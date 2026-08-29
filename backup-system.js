const { CompanySetupService } = require('./company-setup.js');
const { BookkeeperEngine } = require('./accounting-engine.js');

const BACKUP_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class BackupSystem {
  constructor(companyService = null) {
    this.companyService = companyService || new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine || new BookkeeperEngine();
  }

  createBackup(companyId, options = {}) {
    const company = this.companyService.getCompanyById(companyId) || this.engine.getCompanyById(companyId);
    if (!company) {
      return { valid: false, errors: ['Company is missing'] };
    }

    const snapshot = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      companyId: company.id,
      company: clone(company),
      accounts: clone(this.engine.accounts.filter((account) => account.companyId === companyId)),
      transactions: clone(this.engine.transactions.filter((record) => record.companyId === companyId)),
      journalEntries: clone(this.engine.journalEntries.filter((entry) => entry.companyId === companyId)),
      journalLines: clone(this.engine.journalLines.filter((line) => this.engine.journalEntries.some((entry) => entry.id === line.journalEntryId && entry.companyId === companyId))),
      customers: clone(this.engine.customers.filter((customer) => customer.companyId === companyId)),
      vendors: clone(this.engine.vendors.filter((vendor) => vendor.companyId === companyId)),
      invoices: clone(this.engine.invoices.filter((invoice) => invoice.companyId === companyId)),
      invoicePayments: clone(this.engine.invoicePayments.filter((payment) => payment.companyId === companyId)),
      bills: clone(this.engine.bills.filter((bill) => bill.companyId === companyId)),
      billPayments: clone(this.engine.billPayments.filter((payment) => payment.companyId === companyId)),
      bankAccounts: clone(this.engine.bankAccounts.filter((account) => account.companyId === companyId)),
      reconciliations: clone(this.engine.reconciliations.filter((record) => record.companyId === companyId)),
      auditLogs: clone(this.engine.auditLogs.filter((log) => log.companyId === companyId)),
      settings: { companyId: company.id, version: BACKUP_VERSION },
    };

    this.engine.recordAudit({
      companyId,
      entityType: 'Backup',
      entityId: company.id,
      action: 'BACKUP',
      message: 'Backup created',
      createdBy: 'system',
    });

    return { valid: true, backup: snapshot };
  }

  validateBackup(backup = {}) {
    const errors = [];
    if (!backup || typeof backup !== 'object') return { valid: false, errors: ['Backup payload is invalid'] };
    if (!backup.version || backup.version !== BACKUP_VERSION) errors.push('Backup version is invalid');
    if (!backup.companyId) errors.push('Company ID is missing');
    if (!backup.company || typeof backup.company !== 'object') errors.push('Company record is missing');
    const requiredCollections = ['accounts', 'transactions', 'journalEntries', 'customers', 'vendors', 'invoices', 'bills'];
    for (const name of requiredCollections) {
      if (!Array.isArray(backup[name])) errors.push(`Backup collection is invalid: ${name}`);
    }
    return { valid: errors.length === 0, errors };
  }

  restoreBackup(backup = {}, options = {}) {
    const validation = this.validateBackup(backup);
    if (!validation.valid) {
      return { valid: false, errors: validation.errors, restored: false };
    }

    const mode = String(options.mode || 'new').toLowerCase();
    const confirm = !!options.confirm;
    if (!confirm) {
      return { valid: false, errors: ['Restore requires explicit confirmation.'], restored: false };
    }

    const targetCompanyId = options.targetCompanyId || backup.companyId;
    const company = clone(backup.company);
    if (mode === 'new') {
      company.id = options.newCompanyId || `${company.id}-restore-${Date.now()}`;
      company.code = company.code ? `${company.code}-RESTORE` : company.id;
    } else {
      company.id = targetCompanyId || company.id;
    }

    const safeEngine = new BookkeeperEngine();
    safeEngine.companies.push(company);
    safeEngine.accounts.push(...clone(backup.accounts || []).map((account) => ({ ...account, companyId: company.id })));
    safeEngine.transactions.push(...clone(backup.transactions || []).map((record) => ({ ...record, companyId: company.id })));
    safeEngine.journalEntries.push(...clone(backup.journalEntries || []).map((entry) => ({ ...entry, companyId: company.id })));
    safeEngine.journalLines.push(...clone(backup.journalLines || []).map((line) => ({ ...line, companyId: company.id })));
    safeEngine.customers.push(...clone(backup.customers || []).map((customer) => ({ ...customer, companyId: company.id })));
    safeEngine.vendors.push(...clone(backup.vendors || []).map((vendor) => ({ ...vendor, companyId: company.id })));
    safeEngine.invoices.push(...clone(backup.invoices || []).map((invoice) => ({ ...invoice, companyId: company.id })));
    safeEngine.invoicePayments.push(...clone(backup.invoicePayments || []).map((payment) => ({ ...payment, companyId: company.id })));
    safeEngine.bills.push(...clone(backup.bills || []).map((bill) => ({ ...bill, companyId: company.id })));
    safeEngine.billPayments.push(...clone(backup.billPayments || []).map((payment) => ({ ...payment, companyId: company.id })));
    safeEngine.bankAccounts.push(...clone(backup.bankAccounts || []).map((account) => ({ ...account, companyId: company.id })));
    safeEngine.reconciliations.push(...clone(backup.reconciliations || []).map((record) => ({ ...record, companyId: company.id })));
    safeEngine.auditLogs.push(...clone(backup.auditLogs || []).map((log) => ({ ...log, companyId: company.id })));

    this.engine.companies.push(company);
    this.engine.accounts.push(...safeEngine.accounts);
    this.engine.transactions.push(...safeEngine.transactions);
    this.engine.journalEntries.push(...safeEngine.journalEntries);
    this.engine.journalLines.push(...safeEngine.journalLines);
    this.engine.customers.push(...safeEngine.customers);
    this.engine.vendors.push(...safeEngine.vendors);
    this.engine.invoices.push(...safeEngine.invoices);
    this.engine.invoicePayments.push(...safeEngine.invoicePayments);
    this.engine.bills.push(...safeEngine.bills);
    this.engine.billPayments.push(...safeEngine.billPayments);
    this.engine.bankAccounts.push(...safeEngine.bankAccounts);
    this.engine.reconciliations.push(...safeEngine.reconciliations);
    this.engine.auditLogs.push(...safeEngine.auditLogs);

    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'Restore',
      entityId: company.id,
      action: 'RESTORE',
      message: 'Backup restored',
      createdBy: 'system',
    });

    return { valid: true, restored: true, companyId: company.id, backup };
  }

  dataIntegrityCheck(companyId = null) {
    const issues = [];
    const companies = companyId ? this.engine.companies.filter((company) => company.id === companyId) : this.engine.companies;
    for (const company of companies) {
      const accounts = this.engine.accounts.filter((entry) => entry.companyId === company.id);
      const transactions = this.engine.transactions.filter((entry) => entry.companyId === company.id);
      const journalEntries = this.engine.journalEntries.filter((entry) => entry.companyId === company.id);
      const customers = this.engine.customers.filter((entry) => entry.companyId === company.id);
      const vendors = this.engine.vendors.filter((entry) => entry.companyId === company.id);
      const invoices = this.engine.invoices.filter((entry) => entry.companyId === company.id);
      const bills = this.engine.bills.filter((entry) => entry.companyId === company.id);

      for (const transaction of transactions) {
        if (!transaction.companyId) issues.push(`Orphan transaction: ${transaction.id}`);
      }

      for (const entry of journalEntries) {
        if (!entry.lines || entry.lines.length === 0) issues.push(`Unbalanced journal entry: ${entry.id}`);
        const totalDebits = entry.lines.filter((line) => line.entryType === 'debit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
        const totalCredits = entry.lines.filter((line) => line.entryType === 'credit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
        if (Math.abs(totalDebits - totalCredits) > 0.01) issues.push(`Unbalanced journal entry: ${entry.id}`);
      }

      for (const account of accounts) {
        if (!account.title) issues.push(`Invalid account title: ${account.id}`);
      }

      for (const customer of customers) {
        if (!customer.name) issues.push(`Invalid customer: ${customer.id}`);
      }

      for (const vendor of vendors) {
        if (!vendor.name) issues.push(`Invalid vendor: ${vendor.id}`);
      }

      for (const invoice of invoices) {
        if (!invoice.invoiceNumber) issues.push(`Invalid invoice: ${invoice.id}`);
      }

      for (const bill of bills) {
        if (!bill.billNumber) issues.push(`Invalid bill: ${bill.id}`);
      }
    }

    return {
      companyId,
      status: issues.length === 0 ? 'GREEN' : 'RED',
      message: issues.length === 0 ? 'Data integrity passed' : 'Data integrity failed',
      issues,
    };
  }
}

module.exports = {
  BackupSystem,
  BACKUP_VERSION,
};
