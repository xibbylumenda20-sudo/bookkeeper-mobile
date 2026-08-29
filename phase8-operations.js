const { CompanySetupService } = require('./company-setup.js');
const {
  AccountType,
  EntryType,
  TransactionStatus,
  BookkeeperEngine,
} = require('./accounting-engine.js');

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

function normalizeAdjustmentType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'DEBIT') return 'DEBIT';
  if (text === 'CREDIT') return 'CREDIT';
  return 'DEBIT';
}

class Phase8OperationsService {
  constructor(storageKey = 'bookkeeper_mobile_phase8_v1') {
    this.storageKey = storageKey;
    this.companyService = new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine;
    this.adjustingEntries = [];
  }

  ensureCompany(companyId) {
    const company = this.companyService.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }
    return company;
  }

  ensureBankAccount(companyId, bankAccountId) {
    const bankAccount = this.engine.bankAccounts.find(
      (record) => record.companyId === companyId && record.id === bankAccountId,
    );
    if (!bankAccount) {
      throw new Error('Bank account is missing');
    }
    return bankAccount;
  }

  createBankAccount(companyId, input = {}) {
    const company = this.ensureCompany(companyId);
    const normalized = {
      name: String(input.name || '').trim() || 'Bank Account',
      accountNumber: String(input.accountNumber || '').trim(),
      type: String(input.type || 'checking').trim() || 'checking',
      balance: safeNumber(input.balance),
      active: input.active !== false,
      createdBy: input.createdBy || 'system',
      ledgerAccountId: input.ledgerAccountId || input.accountId || null,
    };

    const bankAccount = this.engine.createBankAccount(company.id, normalized);
    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'BankAccount',
      entityId: bankAccount.id,
      action: 'CREATE',
      message: `Bank account created: ${bankAccount.name}`,
      createdBy: normalized.createdBy,
      details: { accountNumber: normalized.accountNumber, type: normalized.type },
    });
    return bankAccount;
  }

  importBankStatement(companyId, bankAccountId, rows = []) {
    this.ensureBankAccount(companyId, bankAccountId);

    const normalized = Array.isArray(rows) ? rows : [];
    const statementRows = normalized.map((row) => {
      const amount = safeNumber(row.amount);
      const date = normalizeDate(row.date) || new Date().toISOString().slice(0, 10);
      return {
        id: row.id || `stmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        bankAccountId,
        date,
        description: String(row.description || '').trim() || 'Bank statement item',
        reference: String(row.reference || '').trim(),
        amount,
        type: String(row.type || (amount >= 0 ? 'credit' : 'debit')).trim().toLowerCase(),
        posted: !!row.posted,
      };
    });

    const seen = new Set();
    const duplicates = [];
    const uniqueRows = [];

    for (const row of statementRows) {
      const key = `${row.date}|${row.reference || row.description}|${row.amount}`;
      if (seen.has(key)) {
        duplicates.push(row);
        continue;
      }
      seen.add(key);
      uniqueRows.push(row);
    }

    this.engine.recordAudit({
      companyId,
      entityType: 'BankStatement',
      entityId: bankAccountId,
      action: 'IMPORT',
      message: `Bank statement imported for account ${bankAccountId}`,
      createdBy: 'system',
      details: { rows: uniqueRows.length, duplicates: duplicates.length },
    });

    return {
      bankAccountId,
      rows: uniqueRows,
      duplicates,
      totalRows: uniqueRows.length,
    };
  }

  matchBankTransactions(companyId, bankAccountId, rows = []) {
    this.ensureBankAccount(companyId, bankAccountId);
    const statementRows = Array.isArray(rows) ? rows : [];
    const transactions = this.engine.transactions.filter((record) => record.companyId === companyId && record.status !== TransactionStatus.VOIDED);

    const matched = statementRows.map((row) => {
      const amount = safeNumber(row.amount);
      const absoluteAmount = Math.abs(amount);
      const candidate = transactions.find((transaction) => {
        const transactionAmount = safeNumber(transaction.amount || 0);
        const sameAmount = Math.abs(transactionAmount - absoluteAmount) < 0.01;
        if (!sameAmount) return false;
        const sameDate = String(transaction.date) === String(row.date);
        const sameReference = !!row.reference && !!transaction.reference && String(transaction.reference).toLowerCase() === String(row.reference).toLowerCase();
        const sameDescription = !!transaction.description && !!row.description && String(transaction.description).toLowerCase().includes(String(row.description).toLowerCase());
        return sameDate || sameReference || sameDescription;
      });

      return {
        statementRow: row,
        matched: !!candidate,
        matchedTransaction: candidate || null,
      };
    });

    return {
      bankAccountId,
      matches: matched.filter((entry) => entry.matched),
      unmatched: matched.filter((entry) => !entry.matched),
      total: matched.length,
    };
  }

  createReconciliation(companyId, bankAccountId, data = {}) {
    this.ensureBankAccount(companyId, bankAccountId);

    const statementDate = normalizeDate(data.statementDate) || new Date().toISOString().slice(0, 10);
    const startingBalance = safeNumber(data.startingBalance);
    const endingBalance = safeNumber(data.endingBalance);
    const bookBalance = safeNumber(data.bookBalance);
    const matchedAmount = safeNumber(data.matchedAmount);
    const outstandingItems = safeNumber(data.outstandingItems);
    const difference = endingBalance - (bookBalance + outstandingItems);
    const status = Math.abs(difference) < 0.01 ? 'RECONCILED' : 'OPEN';

    const reconciliation = this.engine.createReconciliation(companyId, {
      bankAccountId,
      statementDate,
      startingBalance,
      endingBalance,
      clearedBalance: bookBalance,
      status: status === 'RECONCILED' ? TransactionStatus.POSTED : TransactionStatus.DRAFT,
      notes: String(data.notes || '').trim(),
      createdBy: data.createdBy || 'system',
    });

    this.engine.recordAudit({
      companyId,
      entityType: 'Reconciliation',
      entityId: reconciliation.id,
      action: 'CREATE',
      message: `Reconciliation created for bank account ${bankAccountId}`,
      createdBy: data.createdBy || 'system',
      details: {
        statementDate,
        startingBalance,
        endingBalance,
        bookBalance,
        matchedAmount,
        outstandingItems,
        difference,
      },
    });

    return {
      reconciliation,
      bankStatementBalance: endingBalance,
      bookBalance,
      matchedAmount,
      outstandingItems,
      difference,
      status,
    };
  }

  applyReconciliationAdjustment(companyId, reconciliationId, adjustment = {}) {
    const company = this.ensureCompany(companyId);
    const reconciliation = this.engine.reconciliations.find(
      (record) => record.companyId === companyId && record.id === reconciliationId,
    );
    if (!reconciliation) {
      throw new Error('Reconciliation not found');
    }

    const ledgerAccountId = adjustment.ledgerAccountId || adjustment.accountId || null;
    const adjustmentAccountId = adjustment.adjustmentAccountId || adjustment.offsetAccountId || null;
    const amount = safeNumber(adjustment.amount);
    if (!ledgerAccountId || !adjustmentAccountId || amount <= 0) {
      throw new Error('Adjustment requires ledgerAccountId, adjustmentAccountId and amount');
    }

    const ledgerAccount = this.engine.getAccountById(ledgerAccountId);
    const adjustmentAccount = this.engine.getAccountById(adjustmentAccountId);
    if (!ledgerAccount || !adjustmentAccount) {
      throw new Error('Adjustment account is missing');
    }
    if (ledgerAccount.companyId !== companyId || adjustmentAccount.companyId !== companyId) {
      throw new Error('Adjustment accounts must belong to the same company');
    }

    const direction = normalizeAdjustmentType(adjustment.direction || adjustment.entryType || 'DEBIT');
    const entryType = direction === 'CREDIT' ? EntryType.CREDIT : EntryType.DEBIT;
    const offsetType = direction === 'CREDIT' ? EntryType.DEBIT : EntryType.CREDIT;

    const result = this.engine.postJournalEntry({
      companyId: company.id,
      date: normalizeDate(adjustment.date) || new Date().toISOString().slice(0, 10),
      description: String(adjustment.description || 'Reconciliation adjustment').trim() || 'Reconciliation adjustment',
      reference: String(adjustment.reference || `REC-${Date.now()}`).trim(),
      createdBy: adjustment.createdBy || 'system',
      status: TransactionStatus.POSTED,
      lines: [
        { accountId: ledgerAccountId, entryType: entryType, amount },
        { accountId: adjustmentAccountId, entryType: offsetType, amount },
      ],
    });

    if (!result.valid) {
      throw new Error(result.errors.join('; '));
    }

    this.engine.recordAudit({
      companyId,
      entityType: 'BankReconciliationAdjustment',
      entityId: reconciliation.id,
      action: 'ADJUST',
      message: `Reconciliation adjustment posted for ${reconciliation.id}`,
      createdBy: adjustment.createdBy || 'system',
      details: { amount, ledgerAccountId, adjustmentAccountId, direction },
    });

    reconciliation.status = TransactionStatus.POSTED;
    reconciliation.notes = `${reconciliation.notes || ''} Adjustment applied: ${amount}`.trim();
    reconciliation.updatedAt = new Date().toISOString();
    return result;
  }

  createAdjustingEntry(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const description = String(payload.description || '').trim();
    if (!description) {
      throw new Error('Description is required');
    }

    const date = normalizeDate(payload.date) || new Date().toISOString().slice(0, 10);
    const status = String(payload.status || 'DRAFT').toUpperCase();
    const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
    if (rawLines.length === 0) {
      throw new Error('Adjusting entry requires at least one line');
    }

    const lines = rawLines.map((line) => ({
      accountId: line.accountId,
      entryType: String(line.entryType || '').toLowerCase() === 'credit' ? EntryType.CREDIT : EntryType.DEBIT,
      amount: safeNumber(line.amount),
      description: String(line.description || '').trim(),
    }));

    const result = this.engine.postJournalEntry({
      companyId: company.id,
      date,
      description,
      reference: String(payload.reference || `ADJ-${Date.now()}`).trim(),
      createdBy: payload.createdBy || 'system',
      status: status === 'VOIDED' ? TransactionStatus.VOIDED : status === 'POSTED' ? TransactionStatus.POSTED : TransactionStatus.DRAFT,
      lines,
    });

    if (!result.valid) {
      throw new Error(result.errors.join('; '));
    }

    const record = {
      id: result.entry.id,
      companyId: company.id,
      type: String(payload.type || 'custom').trim(),
      status: result.entry.status,
      date,
      description,
      createdBy: payload.createdBy || 'system',
      createdAt: new Date().toISOString(),
      journalEntryId: result.entry.id,
    };
    this.adjustingEntries.push(record);

    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'AdjustingEntry',
      entityId: result.entry.id,
      action: 'CREATE',
      message: `Adjusting entry created: ${description}`,
      createdBy: payload.createdBy || 'system',
      details: { type: record.type, status: result.entry.status },
    });

    if (status === 'VOIDED') {
      this.voidAdjustingEntry(companyId, result.entry.id, { modifiedBy: payload.createdBy || 'system' });
    }

    return { ...result, record };
  }

  voidAdjustingEntry(companyId, entryId, options = {}) {
    const company = this.ensureCompany(companyId);
    const entry = this.engine.journalEntries.find((record) => record.companyId === company.id && record.id === entryId);
    if (!entry) {
      throw new Error('Adjusting entry not found');
    }

    const result = this.engine.voidJournalEntry(entryId, { modifiedBy: options.modifiedBy || 'system' });
    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'AdjustingEntry',
      entityId: entryId,
      action: 'VOID',
      message: `Adjusting entry voided: ${entryId}`,
      createdBy: options.modifiedBy || 'system',
      details: { reason: options.reason || '' },
    });
    return result;
  }

  closePeriod(companyId, payload = {}) {
    const company = this.ensureCompany(companyId);
    const startDate = normalizeDate(payload.startDate) || new Date().toISOString().slice(0, 10);
    const endDate = normalizeDate(payload.endDate) || startDate;
    const periodKey = `${startDate}::${endDate}`;

    company.accountingPeriods = company.accountingPeriods || {};
    company.accountingPeriods[periodKey] = {
      startDate,
      endDate,
      closed: true,
      locked: true,
      closingDate: normalizeDate(payload.closingDate) || new Date().toISOString().slice(0, 10),
      closedBy: payload.closedBy || 'system',
      reason: String(payload.reason || 'Period closed').trim(),
      isClosed: true,
      history: Array.isArray(company.accountingPeriods[periodKey]?.history) ? company.accountingPeriods[periodKey].history : [],
    };

    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'PeriodClosing',
      entityId: periodKey,
      action: 'CLOSE',
      message: `Period closed: ${periodKey}`,
      createdBy: payload.closedBy || 'system',
      details: { startDate, endDate },
    });

    return company.accountingPeriods[periodKey];
  }

  unlockPeriod(companyId, periodKey, options = {}) {
    const company = this.ensureCompany(companyId);
    if (!options.confirmed) {
      throw new Error('Unlock requires explicit confirmation');
    }

    company.accountingPeriods = company.accountingPeriods || {};
    if (!company.accountingPeriods[periodKey]) {
      throw new Error('Period not found');
    }

    company.accountingPeriods[periodKey].closed = false;
    company.accountingPeriods[periodKey].locked = false;
    company.accountingPeriods[periodKey].isClosed = false;
    company.accountingPeriods[periodKey].history = company.accountingPeriods[periodKey].history || [];
    company.accountingPeriods[periodKey].history.push({
      action: 'UNLOCK',
      timestamp: new Date().toISOString(),
      createdBy: options.modifiedBy || 'system',
    });

    this.engine.recordAudit({
      companyId: company.id,
      entityType: 'PeriodClosing',
      entityId: periodKey,
      action: 'UNLOCK',
      message: `Period unlocked: ${periodKey}`,
      createdBy: options.modifiedBy || 'system',
      details: { confirmed: true },
    });

    return company.accountingPeriods[periodKey];
  }

  getAuditTrail(companyId) {
    this.ensureCompany(companyId);
    return this.engine.getAuditLogs(companyId);
  }
}

module.exports = {
  Phase8OperationsService,
};
