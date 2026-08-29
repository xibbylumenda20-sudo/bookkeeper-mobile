 (function () {
const { CompanySetupService } = typeof module !== 'undefined' && module.exports ? require('./company-setup.js') : window;
const {
  BookkeeperEngine,
  AccountType,
  EntryType,
  TransactionStatus,
  NormalBalance,
} = typeof module !== 'undefined' && module.exports ? require('./accounting-engine.js') : window;

const TransactionType = Object.freeze({
  SALES: 'Sales',
  PURCHASES: 'Purchases',
  EXPENSE: 'Expense',
  INCOME: 'Income',
  OWNER_INVESTMENT: 'Owner Investment',
  OWNER_WITHDRAWAL: 'Owner Withdrawal',
  TRANSFER: 'Transfer',
  ASSET_PURCHASE: 'Asset Purchase',
  LOAN_TRANSACTION: 'Loan Transaction',
  CUSTOMER_PAYMENT: 'Customer Payment',
  VENDOR_PAYMENT: 'Vendor Payment',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
  CUSTOM_JOURNAL: 'Custom Journal Entry',
});

const TRANSACTION_TYPES = Object.freeze(Object.values(TransactionType));

function generateId(prefix) {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timePart}-${randomPart}`;
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeStatus(value) {
  const status = String(value || '').trim();
  if (status === 'DRAFT' || status === 'Draft') return TransactionStatus.DRAFT;
  if (status === 'VOIDED' || status === 'Voided') return TransactionStatus.VOIDED;
  return TransactionStatus.POSTED;
}

function isValidDate(value) {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
}

class TransactionRecord {
  constructor(data = {}) {
    this.id = data.id || generateId('txn');
    this.companyId = data.companyId || null;
    this.date = data.date || new Date().toISOString().slice(0, 10);
    this.reference = data.reference || '';
    this.type = data.type || TransactionType.CUSTOM_JOURNAL;
    this.description = data.description || '';
    this.status = normalizeStatus(data.status || TransactionStatus.POSTED);
    this.journalEntryId = data.journalEntryId || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
    this.lines = Array.isArray(data.lines) ? data.lines : [];
  }
}

class TransactionService {
  constructor(storageKey = 'bookkeeper_mobile_transactions_v1') {
    this.storageKey = storageKey;
    this.companyService = new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine;
    this.transactions = [];
    this.load();
  }

  load() {
    if (typeof localStorage === 'undefined') {
      this.transactions = [];
      return;
    }

    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.transactions = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.transactions = Array.isArray(parsed) ? parsed.map((record) => new TransactionRecord(record)) : [];
    } catch (error) {
      this.transactions = [];
    }
  }

  save() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(this.transactions));
    }
  }

  getCompanyById(companyId) {
    return this.companyService.getCompanyById(companyId);
  }

  getAccountById(accountId) {
    return this.companyService.getAccountById(accountId);
  }

  listTransactions(companyId, filters = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) return [];

    const search = String(filters.search || '').trim().toLowerCase();
    const status = filters.status || 'ALL';
    const type = filters.type || 'ALL';
    const accountId = filters.accountId || null;
    const fromDate = filters.fromDate || null;
    const toDate = filters.toDate || null;
    const sort = filters.sort || 'newest';

    let results = this.transactions.filter((record) => record.companyId === companyId);

    if (status !== 'ALL') {
      results = results.filter((record) => record.status === status);
    }

    if (type !== 'ALL') {
      results = results.filter((record) => record.type === type);
    }

    if (accountId) {
      results = results.filter((record) =>
        (record.lines || []).some((line) => String(line.accountId) === String(accountId)),
      );
    }

    if (fromDate) {
      results = results.filter((record) => record.date >= fromDate);
    }

    if (toDate) {
      results = results.filter((record) => record.date <= toDate);
    }

    if (search) {
      results = results.filter((record) => {
        const target = `${record.reference} ${record.description} ${record.type}`.toLowerCase();
        return target.includes(search);
      });
    }

    if (sort === 'oldest') {
      results.sort((left, right) => new Date(left.date) - new Date(right.date));
    } else if (sort === 'highest') {
      results.sort((left, right) => this.getTransactionTotal(right) - this.getTransactionTotal(left));
    } else if (sort === 'lowest') {
      results.sort((left, right) => this.getTransactionTotal(left) - this.getTransactionTotal(right));
    } else {
      results.sort((left, right) => new Date(right.date) - new Date(left.date));
    }

    return results;
  }

  getTransactionById(transactionId) {
    return this.transactions.find((record) => record.id === transactionId) || null;
  }

  getTransactionTotal(transaction) {
    if (!transaction || !Array.isArray(transaction.lines)) return 0;
    return transaction.lines.reduce((sum, line) => sum + toSafeNumber(line.debit || 0) + toSafeNumber(line.credit || 0), 0);
  }

  getPossibleDuplicate(companyId, candidate = {}) {
    const { date, description, reference, amount, accountIds = [] } = candidate;
    if (!date || !description) return null;

    return this.transactions.find((record) => {
      if (record.companyId !== companyId) return false;
      if (record.status === TransactionStatus.VOIDED) return false;

      const recordDebit = (record.lines || []).reduce((sum, line) => sum + toSafeNumber(line.debit || 0), 0);
      const recordCredit = (record.lines || []).reduce((sum, line) => sum + toSafeNumber(line.credit || 0), 0);
      const candidateAmount = toSafeNumber(amount);
      const sameAmount = Math.max(recordDebit, recordCredit) === candidateAmount || (recordDebit + recordCredit) === candidateAmount;

      const sameDate = String(record.date) === String(date);
      const sameDescription = String(record.description || '').toLowerCase() === String(description || '').toLowerCase();
      const sameReference = !reference || !record.reference ? false : String(record.reference).toLowerCase() === String(reference).toLowerCase();
      const accountOverlap = accountIds.length > 0 && (record.lines || []).some((line) => accountIds.includes(String(line.accountId)));
      const match = (sameDate && sameDescription && sameAmount) || (sameReference && sameAmount) || (sameDate && accountOverlap && sameAmount);
      return match;
    }) || null;
  }

  validateTransaction(companyId, payload = {}) {
    const errors = [];
    const company = this.getCompanyById(companyId);
    if (!company) {
      errors.push('Company is missing');
    }

    const date = String(payload.date || '').trim();
    if (!isValidDate(date)) {
      errors.push('Invalid date');
    }

    const description = String(payload.description || '').trim();
    if (!description) {
      errors.push('Description is required');
    }

    const status = normalizeStatus(payload.status || TransactionStatus.POSTED);
    const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
    if (rawLines.length === 0) {
      errors.push('At least one journal line is required');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const normalizedLines = [];

    for (const line of rawLines) {
      const accountId = line && line.accountId ? String(line.accountId) : '';
      const account = accountId ? this.getAccountById(accountId) : null;
      if (!account || (company && account.companyId !== companyId)) {
        errors.push('Invalid account');
      }

      if (account && account.archived) {
        errors.push('Archived account cannot receive new postings');
      }

      const amount = toSafeNumber(line && line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push('Amount must be greater than zero');
      }

      const entryType = String(line && line.entryType || '').toLowerCase();
      if (entryType !== 'debit' && entryType !== 'credit') {
        errors.push('Journal line must be debit or credit');
      }

      if (company && date && this.engine.isAccountingPeriodLocked(companyId, date)) {
        errors.push('Accounting period is locked');
      }

      if (entryType === 'debit') totalDebit += amount;
      if (entryType === 'credit') totalCredit += amount;

      normalizedLines.push({
        accountId,
        accountTitle: account ? account.title : '',
        amount,
        entryType: entryType === 'credit' ? EntryType.CREDIT : EntryType.DEBIT,
        description: String(line && line.description || '').trim(),
      });
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push('Transaction is unbalanced');
    }

    return {
      valid: errors.length === 0,
      errors,
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      status,
      lines: normalizedLines,
    };
  }

  createTransaction(companyId, payload = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }

    const type = payload.type || TransactionType.CUSTOM_JOURNAL;
    const status = normalizeStatus(payload.status || TransactionStatus.POSTED);
    const description = String(payload.description || '').trim();
    const reference = String(payload.reference || '').trim();
    const date = String(payload.date || '').trim();
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    const validation = this.validateTransaction(companyId, {
      date,
      description,
      status,
      lines,
    });

    if (!validation.valid && status !== TransactionStatus.DRAFT) {
      return {
        valid: false,
        status: 'RED',
        label: 'RED = Error / Unbalanced',
        errors: validation.errors,
        totalDebit: validation.totalDebit,
        totalCredit: validation.totalCredit,
        difference: validation.difference,
      };
    }

    if (status !== TransactionStatus.DRAFT && validation.valid) {
      const duplicate = this.getPossibleDuplicate(companyId, {
        date,
        description,
        reference,
        amount: validation.totalDebit,
        accountIds: lines.filter((line) => line.accountId).map((line) => String(line.accountId)),
      });

      const isSameTransaction = payload.id && duplicate && duplicate.id === payload.id;
      if (duplicate && !isSameTransaction) {
        return {
          valid: false,
          status: 'BLUE',
          label: 'BLUE = Possible Duplicate',
          errors: ['POSSIBLE DUPLICATE', 'A similar transaction already exists.'],
          duplicate,
          totalDebit: validation.totalDebit,
          totalCredit: validation.totalCredit,
          difference: validation.difference,
        };
      }
    }

    const journalResult = this.engine.postJournalEntry({
      companyId,
      date,
      description,
      reference,
      status,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
      lines: validation.lines.map((line) => ({
        accountId: line.accountId,
        amount: line.amount,
        entryType: line.entryType,
        description: line.description,
      })),
    });

    if (!journalResult.valid) {
      return {
        valid: false,
        status: 'RED',
        label: 'RED = Error / Unbalanced',
        errors: journalResult.errors,
        totalDebit: validation.totalDebit,
        totalCredit: validation.totalCredit,
        difference: validation.difference,
      };
    }

    const transaction = new TransactionRecord({
      id: payload.id || generateId('txn'),
      companyId,
      date,
      reference,
      type,
      description,
      status,
      journalEntryId: journalResult.entry.id,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
      lines: validation.lines.map((line) => ({
        accountId: line.accountId,
        accountTitle: line.accountTitle,
        debit: line.entryType === EntryType.DEBIT ? line.amount : 0,
        credit: line.entryType === EntryType.CREDIT ? line.amount : 0,
        description: line.description,
      })),
    });

    this.transactions.push(transaction);
    this.save();

    return {
      valid: true,
      transaction,
      journalEntry: journalResult.entry,
      status: status === TransactionStatus.DRAFT ? 'BLUE' : 'GREEN',
      label: status === TransactionStatus.DRAFT ? 'BLUE = Draft Saved' : 'GREEN = Posted successfully',
      errors: [],
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      difference: validation.difference,
    };
  }

  postTransaction(companyId, payload = {}) {
    return this.createTransaction(companyId, { ...payload, status: TransactionStatus.POSTED });
  }

  saveDraft(companyId, payload = {}) {
    return this.createTransaction(companyId, { ...payload, status: TransactionStatus.DRAFT });
  }

  voidTransaction(transactionId, modifiedBy = 'system') {
    const transaction = this.getTransactionById(transactionId);
    if (!transaction) {
      return { valid: false, errors: ['Transaction not found'] };
    }

    const result = this.engine.voidJournalEntry(transaction.journalEntryId, { modifiedBy });
    if (!result.valid) {
      return { valid: false, errors: result.errors };
    }

    transaction.status = TransactionStatus.VOIDED;
    transaction.modifiedBy = modifiedBy;
    transaction.updatedAt = new Date().toISOString();
    this.save();

    return {
      valid: true,
      transaction,
      journalEntry: result.entry,
      status: 'GREEN',
      label: 'GREEN = Voided',
      errors: [],
    };
  }

  getCompanyAccountBalances(companyId) {
    const company = this.getCompanyById(companyId);
    if (!company) return {};
    return this.companyService.engine.calculateAccountBalances(companyId);
  }

  getTransactionPreview(companyId, payload = {}) {
    const validation = this.validateTransaction(companyId, payload);
    return {
      ...validation,
      currentStatus: validation.valid ? 'BALANCED' : 'ERROR',
      message: validation.valid ? 'Valid transaction ready for review.' : 'Transaction is invalid.',
    };
  }

  getTransactionTypes() {
    return [...TRANSACTION_TYPES];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TransactionType,
    TRANSACTION_TYPES,
    TransactionService,
    TransactionRecord,
    normalizeStatus,
    generateId,
    toSafeNumber,
  };
}

if (typeof window !== 'undefined') {
  window.TransactionType = TransactionType;
  window.TransactionService = TransactionService;
}
})();
