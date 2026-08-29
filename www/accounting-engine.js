const ACCOUNTING_ENGINE_VERSION = '1.0.0';

const AccountType = Object.freeze({
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
});

const EntryType = Object.freeze({
  DEBIT: 'debit',
  CREDIT: 'credit',
});

const NormalBalance = Object.freeze({
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
});

const TransactionStatus = Object.freeze({
  DRAFT: 'Draft',
  POSTED: 'Posted',
  VOIDED: 'Voided',
});

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toTimestamp() {
  return new Date().toISOString();
}

function generateId(prefix) {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timePart}-${randomPart}`;
}

function normalizeEntryType(value) {
  const type = String(value || '').toLowerCase();
  if (type === 'debit') return EntryType.DEBIT;
  if (type === 'credit') return EntryType.CREDIT;
  return null;
}

function normalizeStatus(value) {
  const status = String(value || '').trim();
  if (status === 'Draft') return TransactionStatus.DRAFT;
  if (status === 'Posted') return TransactionStatus.POSTED;
  if (status === 'Voided') return TransactionStatus.VOIDED;
  return TransactionStatus.POSTED;
}

function deriveNormalBalance(type) {
  if (type === AccountType.ASSET || type === AccountType.EXPENSE) return NormalBalance.DEBIT;
  if (type === AccountType.LIABILITY || type === AccountType.EQUITY || type === AccountType.REVENUE) return NormalBalance.CREDIT;
  return NormalBalance.DEBIT;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

class BaseModel {
  constructor(data = {}) {
    this.id = data.id || generateId('base');
    this.companyId = data.companyId || null;
    this.createdAt = data.createdAt || toTimestamp();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class Company extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.name = data.name || 'Unnamed Company';
    this.code = data.code || this.id;
    this.description = data.description || '';
    this.active = data.active !== false;
    this.accountingPeriods = data.accountingPeriods || {};
    this.isArchived = !!data.isArchived;
  }
}

class Account extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.code = data.code || '';
    this.title = data.title || 'Unnamed Account';
    this.type = data.type || AccountType.ASSET;
    this.normalBalance = data.normalBalance || deriveNormalBalance(this.type);
    this.description = data.description || '';
    this.active = data.active !== false;
    this.archived = !!data.archived;
  }
}

class JournalLine extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.journalEntryId = data.journalEntryId || null;
    this.accountId = data.accountId || null;
    this.accountCode = data.accountCode || '';
    this.accountTitle = data.accountTitle || '';
    this.entryType = normalizeEntryType(data.entryType) || EntryType.DEBIT;
    this.amount = toSafeNumber(data.amount);
    this.description = data.description || '';
  }
}

class JournalEntry extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.date = normalizeDate(data.date) || new Date().toISOString().slice(0, 10);
    this.description = data.description || '';
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.lines = (data.lines || []).map((line) => new JournalLine({
      ...line,
      companyId: this.companyId,
      journalEntryId: data.id || this.id,
      accountCode: line.accountCode || '',
      accountTitle: line.accountTitle || '',
      createdBy: line.createdBy || data.createdBy || 'system',
      modifiedBy: line.modifiedBy || data.modifiedBy || data.createdBy || 'system',
    }));
    this.reference = data.reference || '';
    this.postedAt = data.postedAt || (this.status === TransactionStatus.POSTED ? toTimestamp() : null);
  }
}

class Transaction extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.type = data.type || 'general';
    this.referenceId = data.referenceId || '';
    this.date = normalizeDate(data.date) || new Date().toISOString().slice(0, 10);
    this.description = data.description || '';
    this.amount = toSafeNumber(data.amount);
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.relatedEntityType = data.relatedEntityType || '';
    this.relatedEntityId = data.relatedEntityId || '';
  }
}

class Customer extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.name = data.name || 'Unnamed Customer';
    this.code = data.code || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.active = data.active !== false;
  }
}

class Vendor extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.name = data.name || 'Unnamed Vendor';
    this.code = data.code || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.active = data.active !== false;
  }
}

class Invoice extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.customerId = data.customerId || null;
    this.invoiceNumber = data.invoiceNumber || `INV-${Date.now()}`;
    this.date = normalizeDate(data.date) || new Date().toISOString().slice(0, 10);
    this.dueDate = normalizeDate(data.dueDate) || this.date;
    this.amount = toSafeNumber(data.amount);
    this.balance = toSafeNumber(data.balance);
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.description = data.description || '';
  }
}

class InvoicePayment extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.invoiceId = data.invoiceId || null;
    this.customerId = data.customerId || null;
    this.amount = toSafeNumber(data.amount);
    this.paymentDate = normalizeDate(data.paymentDate) || new Date().toISOString().slice(0, 10);
    this.bankAccountId = data.bankAccountId || null;
    this.reference = data.reference || '';
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
  }
}

class Bill extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.vendorId = data.vendorId || null;
    this.billNumber = data.billNumber || `BILL-${Date.now()}`;
    this.date = normalizeDate(data.date) || new Date().toISOString().slice(0, 10);
    this.dueDate = normalizeDate(data.dueDate) || this.date;
    this.amount = toSafeNumber(data.amount);
    this.balance = toSafeNumber(data.balance);
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.description = data.description || '';
  }
}

class BillPayment extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.billId = data.billId || null;
    this.vendorId = data.vendorId || null;
    this.amount = toSafeNumber(data.amount);
    this.paymentDate = normalizeDate(data.paymentDate) || new Date().toISOString().slice(0, 10);
    this.bankAccountId = data.bankAccountId || null;
    this.reference = data.reference || '';
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
  }
}

class BankAccount extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.name = data.name || 'Bank Account';
    this.accountNumber = data.accountNumber || '';
    this.type = data.type || 'checking';
    this.balance = toSafeNumber(data.balance);
    this.active = data.active !== false;
  }
}

class Reconciliation extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.bankAccountId = data.bankAccountId || null;
    this.statementDate = normalizeDate(data.statementDate) || new Date().toISOString().slice(0, 10);
    this.startingBalance = toSafeNumber(data.startingBalance);
    this.endingBalance = toSafeNumber(data.endingBalance);
    this.clearedBalance = toSafeNumber(data.clearedBalance);
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.notes = data.notes || '';
  }
}

class AuditLog extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.companyId = data.companyId || null;
    this.entityType = data.entityType || 'system';
    this.entityId = data.entityId || null;
    this.action = data.action || 'CREATE';
    this.message = data.message || '';
    this.details = data.details || {};
  }
}

class BookkeeperEngine {
  constructor() {
    this.companies = [];
    this.accounts = [];
    this.journalEntries = [];
    this.journalLines = [];
    this.transactions = [];
    this.customers = [];
    this.vendors = [];
    this.invoices = [];
    this.invoicePayments = [];
    this.bills = [];
    this.billPayments = [];
    this.bankAccounts = [];
    this.reconciliations = [];
    this.auditLogs = [];
  }

  getCompanyById(companyId) {
    return this.companies.find((company) => company.id === companyId) || null;
  }

  getAccountById(accountId) {
    return this.accounts.find((account) => account.id === accountId) || null;
  }

  getCompanyAccounts(companyId) {
    return this.accounts.filter((account) => account.companyId === companyId && !account.archived);
  }

  createCompany(data = {}) {
    const company = new Company({
      ...data,
      id: data.id || generateId('company'),
      companyId: data.companyId || null,
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
    });

    this.companies.push(company);
    this.recordAudit({
      companyId: company.id,
      entityType: 'Company',
      entityId: company.id,
      action: 'CREATE',
      message: `Company created: ${company.name}`,
      createdBy: company.createdBy,
    });
    return company;
  }

  createAccount(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }

    const account = new Account({
      ...data,
      id: data.id || generateId('acct'),
      companyId,
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
    });

    this.accounts.push(account);
    this.recordAudit({
      companyId,
      entityType: 'Account',
      entityId: account.id,
      action: 'CREATE',
      message: `Account created: ${account.code} - ${account.title}`,
      createdBy: account.createdBy,
    });
    return account;
  }

  createCustomer(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const customer = new Customer({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.customers.push(customer);
    this.recordAudit({ companyId, entityType: 'Customer', entityId: customer.id, action: 'CREATE', message: `Customer created: ${customer.name}`, createdBy: customer.createdBy });
    return customer;
  }

  createVendor(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const vendor = new Vendor({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.vendors.push(vendor);
    this.recordAudit({ companyId, entityType: 'Vendor', entityId: vendor.id, action: 'CREATE', message: `Vendor created: ${vendor.name}`, createdBy: vendor.createdBy });
    return vendor;
  }

  createInvoice(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const invoice = new Invoice({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.invoices.push(invoice);
    this.recordAudit({ companyId, entityType: 'Invoice', entityId: invoice.id, action: 'CREATE', message: `Invoice created: ${invoice.invoiceNumber}`, createdBy: invoice.createdBy });
    return invoice;
  }

  createInvoicePayment(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const payment = new InvoicePayment({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.invoicePayments.push(payment);
    this.recordAudit({ companyId, entityType: 'InvoicePayment', entityId: payment.id, action: 'CREATE', message: `Invoice payment recorded: ${payment.amount}`, createdBy: payment.createdBy });
    return payment;
  }

  createBill(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const bill = new Bill({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.bills.push(bill);
    this.recordAudit({ companyId, entityType: 'Bill', entityId: bill.id, action: 'CREATE', message: `Bill created: ${bill.billNumber}`, createdBy: bill.createdBy });
    return bill;
  }

  createBillPayment(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const payment = new BillPayment({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.billPayments.push(payment);
    this.recordAudit({ companyId, entityType: 'BillPayment', entityId: payment.id, action: 'CREATE', message: `Bill payment recorded: ${payment.amount}`, createdBy: payment.createdBy });
    return payment;
  }

  createBankAccount(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const bankAccount = new BankAccount({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.bankAccounts.push(bankAccount);
    this.recordAudit({ companyId, entityType: 'BankAccount', entityId: bankAccount.id, action: 'CREATE', message: `Bank account created: ${bankAccount.name}`, createdBy: bankAccount.createdBy });
    return bankAccount;
  }

  createReconciliation(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) throw new Error('Company is missing');
    const reconciliation = new Reconciliation({ ...data, companyId, createdBy: data.createdBy || 'system' });
    this.reconciliations.push(reconciliation);
    this.recordAudit({ companyId, entityType: 'Reconciliation', entityId: reconciliation.id, action: 'CREATE', message: `Reconciliation created for account ${reconciliation.bankAccountId}`, createdBy: reconciliation.createdBy });
    return reconciliation;
  }

  isAccountingPeriodLocked(companyId, dateString) {
    const company = this.getCompanyById(companyId);
    if (!company) return false;
    const normalized = normalizeDate(dateString);
    if (!normalized) return false;
    const periods = company.accountingPeriods || {};
    return Object.entries(periods).some(([periodKey, value]) => {
      const locked = !!value?.locked;
      if (!locked) return false;
      const [periodStart, periodEnd] = String(periodKey).split('::');
      if (!periodStart || !periodEnd) return false;
      return normalized >= periodStart && normalized <= periodEnd;
    });
  }

  recordAudit({ companyId, entityType, entityId, action, message, createdBy, details = {} }) {
    const log = new AuditLog({
      companyId,
      entityType,
      entityId,
      action,
      message,
      details,
      createdBy: createdBy || 'system',
      modifiedBy: createdBy || 'system',
    });
    this.auditLogs.push(log);
    return log;
  }

  getAuditLogs(companyId) {
    return this.auditLogs.filter((log) => log.companyId === companyId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getPostedEntries(companyId) {
    return this.journalEntries.filter((entry) => entry.companyId === companyId && entry.status === TransactionStatus.POSTED);
  }

  getPostedJournalLinesForAccount(accountId) {
    const account = this.getAccountById(accountId);
    if (!account) return [];
    const lines = this.journalLines.filter((line) => line.accountId === accountId);
    return lines.filter((line) => {
      const entry = this.journalEntries.find((journalEntry) => journalEntry.id === line.journalEntryId);
      return !!entry && entry.status === TransactionStatus.POSTED && entry.companyId === account.companyId;
    });
  }

  getAccountBalance(accountId) {
    const account = this.getAccountById(accountId);
    if (!account) return 0;

    const debitTotal = this.getPostedJournalLinesForAccount(accountId)
      .filter((line) => line.entryType === EntryType.DEBIT)
      .reduce((sum, line) => sum + line.amount, 0);

    const creditTotal = this.getPostedJournalLinesForAccount(accountId)
      .filter((line) => line.entryType === EntryType.CREDIT)
      .reduce((sum, line) => sum + line.amount, 0);

    const net = debitTotal - creditTotal;
    return account.normalBalance === NormalBalance.DEBIT ? net : creditTotal - debitTotal;
  }

  calculateAccountBalances(companyId) {
    return this.getCompanyAccounts(companyId).reduce((accumulator, account) => {
      const debitTotal = this.getPostedJournalLinesForAccount(account.id)
        .filter((line) => line.entryType === EntryType.DEBIT)
        .reduce((sum, line) => sum + line.amount, 0);

      const creditTotal = this.getPostedJournalLinesForAccount(account.id)
        .filter((line) => line.entryType === EntryType.CREDIT)
        .reduce((sum, line) => sum + line.amount, 0);

      const net = debitTotal - creditTotal;
      const balance = account.normalBalance === NormalBalance.DEBIT ? net : creditTotal - debitTotal;

      accumulator[account.id] = {
        account,
        code: account.code,
        title: account.title,
        type: account.type,
        normalBalance: account.normalBalance,
        debit: debitTotal,
        credit: creditTotal,
        balance,
      };
      return accumulator;
    }, {});
  }

  getCompanyBalance(companyId) {
    return this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.ASSET)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);
  }

  getGeneralJournal(companyId) {
    return this.getPostedEntries(companyId)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .flatMap((entry) =>
        entry.lines.map((line) => ({
          entryId: entry.id,
          companyId: entry.companyId,
          date: entry.date,
          description: entry.description,
          status: entry.status,
          accountId: line.accountId,
          accountCode: line.accountCode || this.getAccountById(line.accountId)?.code || '',
          accountTitle: line.accountTitle || this.getAccountById(line.accountId)?.title || '',
          entryType: line.entryType,
          amount: line.amount,
        })),
      );
  }

  getGeneralLedger(companyId) {
    return this.getCompanyAccounts(companyId).map((account) => {
      const totals = this.calculateAccountBalances(companyId)[account.id] || {
        debit: 0,
        credit: 0,
        balance: 0,
      };

      return {
        accountId: account.id,
        code: account.code,
        title: account.title,
        type: account.type,
        normalBalance: account.normalBalance,
        debit: totals.debit,
        credit: totals.credit,
        balance: totals.balance,
      };
    });
  }

  getTrialBalance(companyId) {
    const rows = this.getCompanyAccounts(companyId).map((account) => {
      const totals = this.calculateAccountBalances(companyId)[account.id] || {
        debit: 0,
        credit: 0,
        balance: 0,
      };

      const balance = totals.balance;
      let debit = 0;
      let credit = 0;

      if (account.normalBalance === NormalBalance.DEBIT) {
        debit = Math.max(balance, 0);
        credit = Math.max(-balance, 0);
      } else {
        credit = Math.max(balance, 0);
        debit = Math.max(-balance, 0);
      }

      return {
        id: account.id,
        code: account.code,
        title: account.title,
        type: account.type,
        normalBalance: account.normalBalance,
        debit,
        credit,
      };
    });

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
    const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced,
      status: balanced ? 'GREEN' : 'RED',
      label: balanced ? 'GREEN = Balanced' : 'RED = Error / Unbalanced',
    };
  }

  verifyAccountingEquation(companyId) {
    const accounts = this.getCompanyAccounts(companyId);
    const assetBalance = accounts
      .filter((account) => account.type === AccountType.ASSET)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);

    const liabilityBalance = accounts
      .filter((account) => account.type === AccountType.LIABILITY)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);

    const equityBalance = accounts
      .filter((account) => account.type === AccountType.EQUITY)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);

    const revenueBalance = accounts
      .filter((account) => account.type === AccountType.REVENUE)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);

    const expenseBalance = accounts
      .filter((account) => account.type === AccountType.EXPENSE)
      .reduce((sum, account) => sum + this.getAccountBalance(account.id), 0);

    const netIncome = revenueBalance - expenseBalance;
    return assetBalance - (liabilityBalance + equityBalance + netIncome);
  }

  validateJournalEntry(data = {}) {
    const errors = [];
    const companyId = data.companyId || null;
    const company = companyId ? this.getCompanyById(companyId) : null;

    if (!company) {
      errors.push('Company is missing');
    }

    const date = normalizeDate(data.date);
    if (!date) {
      errors.push('Date is invalid');
    }

    if (company && date && this.isAccountingPeriodLocked(companyId, date)) {
      errors.push('Accounting period is locked');
    }

    const rawLines = Array.isArray(data.lines) ? data.lines : [];
    if (rawLines.length === 0) {
      errors.push('Journal entry requires at least one line');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const rawLine of rawLines) {
      const account = rawLine && rawLine.accountId ? this.getAccountById(rawLine.accountId) : null;
      if (!account || (company && account.companyId !== companyId)) {
        errors.push('Account is missing');
      }

      const amount = toSafeNumber(rawLine && rawLine.amount);
      if (!rawLine || !Number.isFinite(amount) || amount <= 0) {
        errors.push('Amount is zero or invalid');
      }

      const entryType = normalizeEntryType(rawLine && rawLine.entryType);
      if (!entryType || (entryType !== EntryType.DEBIT && entryType !== EntryType.CREDIT)) {
        errors.push('Journal line entry type is invalid');
      }

      if (entryType === EntryType.DEBIT) totalDebits += amount;
      if (entryType === EntryType.CREDIT) totalCredits += amount;
    }

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      errors.push('Debits do not equal Credits');
    }

    const valid = errors.length === 0;
    return {
      valid,
      status: valid ? 'GREEN' : 'RED',
      label: valid ? 'GREEN = Balanced' : 'RED = Error / Unbalanced',
      errors,
      totalDebits,
      totalCredits,
    };
  }

  postJournalEntry(data = {}) {
    const validation = this.validateJournalEntry(data);
    if (!validation.valid) {
      this.recordAudit({
        companyId: data.companyId || null,
        entityType: 'JournalEntry',
        entityId: data.id || null,
        action: 'REJECT',
        message: 'Journal entry rejected',
        createdBy: data.createdBy || 'system',
        details: { errors: validation.errors },
      });
      return {
        valid: false,
        errors: validation.errors,
        status: 'RED',
        label: 'RED = Error / Unbalanced',
      };
    }

    const normalizedDate = normalizeDate(data.date) || new Date().toISOString().slice(0, 10);
    const entry = new JournalEntry({
      ...data,
      id: data.id || generateId('je'),
      companyId: data.companyId,
      date: normalizedDate,
      status: normalizeStatus(data.status || TransactionStatus.POSTED),
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
      lines: (data.lines || []).map((line) => ({
        ...line,
        amount: Number(line.amount),
        entryType: normalizeEntryType(line.entryType),
        accountCode: this.getAccountById(line.accountId)?.code || '',
        accountTitle: this.getAccountById(line.accountId)?.title || '',
      })),
    });

    this.journalEntries.push(entry);
    this.journalLines.push(...entry.lines.map((line) => new JournalLine({
      ...line,
      companyId: entry.companyId,
      journalEntryId: entry.id,
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
    })));

    const transaction = new Transaction({
      companyId: entry.companyId,
      type: 'journal',
      date: entry.date,
      description: entry.description,
      amount: entry.lines.reduce((sum, line) => sum + line.amount, 0),
      status: entry.status,
      relatedEntityType: 'JournalEntry',
      relatedEntityId: entry.id,
      createdBy: entry.createdBy,
      modifiedBy: entry.modifiedBy,
    });
    this.transactions.push(transaction);

    this.recordAudit({
      companyId: entry.companyId,
      entityType: 'JournalEntry',
      entityId: entry.id,
      action: entry.status === TransactionStatus.DRAFT ? 'SAVE_DRAFT' : 'POST',
      message: `Journal entry ${entry.id} ${entry.status === TransactionStatus.DRAFT ? 'saved as draft' : 'posted'}`,
      createdBy: entry.createdBy,
      details: { description: entry.description, status: entry.status },
    });

    return {
      valid: true,
      entry,
      status: 'GREEN',
      label: 'GREEN = Balanced',
      errors: [],
    };
  }

  voidJournalEntry(entryId, data = {}) {
    const entry = this.journalEntries.find((journalEntry) => journalEntry.id === entryId);
    if (!entry) {
      return { valid: false, status: 'RED', label: 'RED = Error / Unbalanced', errors: ['Journal entry not found'] };
    }

    entry.status = TransactionStatus.VOIDED;
    entry.updatedAt = toTimestamp();
    entry.modifiedBy = data.modifiedBy || 'system';

    this.recordAudit({
      companyId: entry.companyId,
      entityType: 'JournalEntry',
      entityId: entry.id,
      action: 'VOID',
      message: `Journal entry voided: ${entry.id}`,
      createdBy: entry.modifiedBy,
      details: { description: entry.description },
    });

    return { valid: true, entry, status: 'GREEN', label: 'GREEN = Balanced', errors: [] };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AccountType,
    EntryType,
    NormalBalance,
    TransactionStatus,
    BookkeeperEngine,
    Company,
    Account,
    JournalEntry,
    JournalLine,
    Transaction,
    Customer,
    Vendor,
    Invoice,
    InvoicePayment,
    Bill,
    BillPayment,
    BankAccount,
    Reconciliation,
    AuditLog,
    ACCOUNTING_ENGINE_VERSION,
  };
}

if (typeof window !== 'undefined') {
  window.BookkeeperEngine = BookkeeperEngine;
  window.AccountType = AccountType;
  window.EntryType = EntryType;
  window.NormalBalance = NormalBalance;
  window.TransactionStatus = TransactionStatus;
}
