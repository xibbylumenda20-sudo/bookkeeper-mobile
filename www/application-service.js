(function () {
const services = typeof module !== 'undefined' && module.exports ? {
  ...require('./company-setup.js'), ...require('./transaction-system.js'), ...require('./ar-ap-system.js'),
  ...require('./reporting-system.js'), ...require('./backup-system.js'), ...require('./export-system.js'),
} : window;
const { CompanySetupService, TransactionService, TransactionType, ARAPService, InvoiceStatus, BillStatus, ReportingSystem, BackupSystem, ExportSystem } = services;

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

class BookkeeperApplicationService {
  constructor(storageKey = 'bookkeeper_mobile_app_service_v1') {
    this.storageKey = storageKey;
    this.companyService = new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.transactionService = new TransactionService('bookkeeper_mobile_transactions_v1');
    this.transactionService.companyService = this.companyService;
    this.transactionService.engine = this.companyService.engine;

    this.arapService = new ARAPService('bookkeeper_mobile_ar_ap_v1');
    this.arapService.companyService = this.companyService;
    this.arapService.engine = this.companyService.engine;

    this.reportingService = new ReportingSystem(this.companyService);
    this.backupSystem = new BackupSystem(this.companyService);
    this.exportSystem = new ExportSystem(this.reportingService, this.companyService);
  }

  ensureCompany(companyId) {
    const company = this.companyService.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }
    return company;
  }

  listCompanies() {
    return this.companyService.listCompanies();
  }

  getCurrentCompany() {
    return this.companyService.getActiveCompany();
  }

  switchCompany(companyId) {
    return this.companyService.switchCompany(companyId);
  }

  initializeCompany(input = {}) {
    const companyData = {
      name: String(input.name || 'New Company').trim() || 'New Company',
      code: String(input.code || '').trim() || 'company',
      businessAddress: String(input.businessAddress || '').trim(),
      contactNumber: String(input.contactNumber || '').trim(),
      email: String(input.email || '').trim(),
      taxInformation: String(input.taxInformation || '').trim(),
      fiscalYear: String(input.fiscalYear || '').trim(),
      accountingPeriod: String(input.accountingPeriod || 'Monthly').trim(),
      baseCurrency: String(input.baseCurrency || 'PHP').trim(),
      businessType: String(input.businessType || 'Other').trim() || 'Other',
      createdBy: input.createdBy || 'system',
    };

    const company = this.companyService.createCompany(companyData);
    this.companyService.switchCompany(company.id);
    return company;
  }

  getDashboardSummary(companyId, options = {}) {
    const company = this.ensureCompany(companyId);
    const periodStart = normalizeDate(options.startDate || null);
    const periodEnd = normalizeDate(options.endDate || null);

    const trialBalance = this.reportingService.getTrialBalance(company.id, periodStart, periodEnd);
    const incomeStatement = this.reportingService.getIncomeStatement(company.id, periodStart, periodEnd);
    const cashFlow = this.reportingService.getCashFlowStatement(company.id, periodStart, periodEnd);
    const arReport = this.reportingService.getARReport(company.id, periodStart, periodEnd);
    const apReport = this.reportingService.getAPReport(company.id, periodStart, periodEnd);
    const accountSummary = this.reportingService.getChartOfAccountsReport(company.id);
    const balanced = trialBalance.status === 'BALANCED' &&
      incomeStatement.validation?.status !== 'FAILED' &&
      cashFlow.validation?.status !== 'FAILED';

    return {
      companyId: company.id,
      companyName: company.name,
      period: {
        startDate: periodStart,
        endDate: periodEnd,
      },
      balances: {
        totalAssets: cashFlow.endingCash || trialBalance.totalDebit || 0,
        totalLiabilities: apReport.totalAP || 0,
        totalEquity: incomeStatement.netIncome || 0,
        netIncome: incomeStatement.netIncome || 0,
        cash: cashFlow.endingCash || 0,
        totalAR: arReport.totalAR || 0,
        totalAP: apReport.totalAP || 0,
      },
      reports: {
        trialBalance,
        incomeStatement,
        cashFlow,
        arReport,
        apReport,
      },
      accounts: accountSummary,
      status: balanced ? 'GREEN' : 'RED',
    };
  }

  createJournalEntry(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const description = String(payload.description || '').trim();
    const date = normalizeDate(payload.date || new Date().toISOString().slice(0, 10));
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (!date) {
      throw new Error('Invalid date');
    }
    if (!description) {
      throw new Error('Description is required');
    }
    if (lines.length === 0) {
      throw new Error('Journal entry requires lines');
    }

    const normalizedLines = lines.map((line) => ({
      accountId: line.accountId,
      entryType: line.entryType,
      amount: safeNumber(line.amount),
      description: String(line.description || '').trim(),
    }));

    const result = this.transactionService.createTransaction(company.id, {
      type: payload.type || TransactionType.CUSTOM_JOURNAL,
      date,
      description,
      reference: String(payload.reference || '').trim(),
      status: payload.status || 'POSTED',
      createdBy: payload.createdBy || 'app',
      lines: normalizedLines,
    });

    if (!result.valid) {
      throw new Error(result.errors.join('; '));
    }

    return result;
  }

  createCustomerInvoice(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const customer = this.arapService.getCustomerById(company.id, payload.customerId || payload.customer || null);
    if (!customer) {
      throw new Error('Customer is missing');
    }

    const itemList = Array.isArray(payload.items) ? payload.items : [];
    if (itemList.length === 0) {
      throw new Error('Invoice must include at least one item');
    }

    const result = this.arapService.createInvoice(company.id, {
      customerId: customer.customerId,
      invoiceNumber: String(payload.invoiceNumber || '').trim() || `INV-${Date.now()}`,
      invoiceDate: normalizeDate(payload.invoiceDate) || new Date().toISOString().slice(0, 10),
      dueDate: normalizeDate(payload.dueDate) || new Date().toISOString().slice(0, 10),
      status: payload.status || InvoiceStatus.SENT,
      notes: String(payload.notes || '').trim(),
      tax: safeNumber(payload.tax),
      createdBy: payload.createdBy || 'app',
      items: itemList.map((item) => ({
        description: String(item.description || '').trim(),
        quantity: safeNumber(item.quantity),
        unitPrice: safeNumber(item.unitPrice ?? item.amount ?? 0),
        revenueAccount: item.revenueAccount || item.accountId || item.account || null,
        amount: safeNumber(item.amount || ((safeNumber(item.quantity) * safeNumber(item.unitPrice)))),
      })),
    });

    if (!result.valid) {
      throw new Error(result.errors.join('; '));
    }

    return result;
  }

  createVendorBill(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const vendor = this.arapService.getVendorById(company.id, payload.vendorId || payload.vendor || null);
    if (!vendor) {
      throw new Error('Vendor is missing');
    }

    const itemList = Array.isArray(payload.items) ? payload.items : [];
    if (itemList.length === 0) {
      throw new Error('Bill must include at least one item');
    }

    const result = this.arapService.createBill(company.id, {
      vendorId: vendor.vendorId,
      billNumber: String(payload.billNumber || '').trim() || `BILL-${Date.now()}`,
      billDate: normalizeDate(payload.billDate) || new Date().toISOString().slice(0, 10),
      dueDate: normalizeDate(payload.dueDate) || new Date().toISOString().slice(0, 10),
      status: payload.status || BillStatus.RECEIVED,
      notes: String(payload.notes || '').trim(),
      tax: safeNumber(payload.tax),
      createdBy: payload.createdBy || 'app',
      items: itemList.map((item) => ({
        description: String(item.description || '').trim(),
        quantity: safeNumber(item.quantity),
        unitPrice: safeNumber(item.unitPrice ?? item.amount ?? 0),
        expenseAccount: item.expenseAccount || item.accountId || item.account || null,
        amount: safeNumber(item.amount || ((safeNumber(item.quantity) * safeNumber(item.unitPrice)))),
      })),
    });

    if (!result.valid) {
      throw new Error(result.errors.join('; '));
    }

    return result;
  }

  createCustomerPayment(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const valid = this.arapService.createCustomerPayment(company.id, {
      customerId: payload.customerId,
      invoiceId: payload.invoiceId,
      paymentDate: payload.paymentDate,
      reference: payload.reference,
      amount: payload.amount,
      depositAccount: payload.depositAccount || payload.paymentAccount,
      status: payload.status || 'POSTED',
      notes: payload.notes,
      createdBy: payload.createdBy || 'app',
    });

    if (!valid.valid) {
      throw new Error(valid.errors.join('; '));
    }

    return valid;
  }

  createVendorPayment(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const valid = this.arapService.createVendorPayment(company.id, {
      vendorId: payload.vendorId,
      billId: payload.billId,
      paymentDate: payload.paymentDate,
      reference: payload.reference,
      amount: payload.amount,
      cashAccount: payload.cashAccount || payload.paymentAccount,
      status: payload.status || 'POSTED',
      notes: payload.notes,
      createdBy: payload.createdBy || 'app',
    });

    if (!valid.valid) {
      throw new Error(valid.errors.join('; '));
    }

    return valid;
  }

  getCompanySnapshot(companyId) {
    const company = this.ensureCompany(companyId);
    return this.backupSystem.createBackup(company.id);
  }

  exportCompanyReport(companyId, reportName, options = {}) {
    this.ensureCompany(companyId);
    return this.exportSystem.exportReport(reportName, companyId, options);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  BookkeeperApplicationService,
  TransactionType,
  InvoiceStatus,
  BillStatus,
};
if (typeof window !== 'undefined') window.BookkeeperApplicationService = BookkeeperApplicationService;
})();
