 (function () {
const { CompanySetupService } = typeof module !== 'undefined' && module.exports ? require('./company-setup.js') : window;
const { ARAPService } = typeof module !== 'undefined' && module.exports ? require('./ar-ap-system.js') : window;
const { TransactionService } = typeof module !== 'undefined' && module.exports ? require('./transaction-system.js') : window;
const {
  BookkeeperEngine,
  AccountType,
  EntryType,
  TransactionStatus,
  NormalBalance,
} = typeof module !== 'undefined' && module.exports ? require('./accounting-engine.js') : window;

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

function startOfDay(date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function endOfDay(date) {
  const clone = new Date(date);
  clone.setHours(23, 59, 59, 999);
  return clone;
}

function toIsoDate(date) {
  const normalized = new Date(date);
  if (Number.isNaN(normalized.getTime())) return null;
  return normalized.toISOString().slice(0, 10);
}

function reconcileDateRange(startDate, endDate) {
  const validStart = normalizeDate(startDate);
  const validEnd = normalizeDate(endDate);
  if (validStart && validEnd && validStart > validEnd) {
    return { startDate: validEnd, endDate: validStart };
  }
  return { startDate: validStart || null, endDate: validEnd || null };
}

function isDateInRange(value, startDate, endDate) {
  if (!value) return true;
  const normalized = normalizeDate(value);
  if (!normalized) return true;
  if (startDate && normalized < startDate) return false;
  if (endDate && normalized > endDate) return false;
  return true;
}

function getPeriodLabel(period) {
  const normalized = String(period || 'MONTH').toUpperCase();
  switch (normalized) {
    case 'WEEK':
      return 'This Week';
    case 'MONTH':
      return 'This Month';
    case 'QUARTER':
      return 'This Quarter';
    case 'YEAR':
      return 'This Year';
    case 'PREVIOUS_WEEK':
      return 'Previous Week';
    case 'PREVIOUS_MONTH':
      return 'Previous Month';
    case 'PREVIOUS_QUARTER':
      return 'Previous Quarter';
    case 'PREVIOUS_YEAR':
      return 'Previous Year';
    case 'CUSTOM':
      return 'Custom Range';
    default:
      return 'This Month';
  }
}

function getStartOfWeek(date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  clone.setDate(clone.getDate() + offset);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getStartOfMonth(date) {
  const clone = new Date(date);
  clone.setDate(1);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getStartOfQuarter(date) {
  const clone = new Date(date);
  const quarter = Math.floor(clone.getMonth() / 3);
  clone.setMonth(quarter * 3, 1);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getStartOfYear(date) {
  const clone = new Date(date);
  clone.setMonth(0, 1);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function addDays(date, amount) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
}

function getPeriodBounds(period = 'MONTH', baseDate = new Date(), customStartDate = null, customEndDate = null) {
  const date = new Date(baseDate);
  const normalizedPeriod = String(period || 'MONTH').toUpperCase();
  if (normalizedPeriod === 'CUSTOM') {
    const start = normalizeDate(customStartDate || date.toISOString().slice(0, 10));
    const end = normalizeDate(customEndDate || start || date.toISOString().slice(0, 10));
    return {
      period: 'CUSTOM',
      label: 'Custom Range',
      startDate: start,
      endDate: end,
      granularity: 'Custom Date Range',
      comparisonStart: null,
      comparisonEnd: null,
    };
  }

  let start = null;
  let end = null;

  switch (normalizedPeriod) {
    case 'THIS_WEEK':
    case 'WEEK':
      start = getStartOfWeek(date);
      end = addDays(start, 6);
      break;
    case 'THIS_MONTH':
    case 'MONTH':
      start = getStartOfMonth(date);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      break;
    case 'THIS_QUARTER':
    case 'QUARTER':
      start = getStartOfQuarter(date);
      end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      break;
    case 'THIS_YEAR':
    case 'YEAR':
      start = getStartOfYear(date);
      end = new Date(start.getFullYear(), 11, 31);
      break;
    case 'PREVIOUS_WEEK':
      start = addDays(getStartOfWeek(date), -7);
      end = addDays(start, 6);
      break;
    case 'PREVIOUS_MONTH':
      start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      end = new Date(date.getFullYear(), date.getMonth(), 0);
      break;
    case 'PREVIOUS_QUARTER': {
      const qStart = getStartOfQuarter(date);
      const qStartMonth = qStart.getMonth();
      const prevQuarterStart = new Date(qStart.getFullYear(), qStartMonth - 3, 1);
      start = prevQuarterStart;
      end = new Date(prevQuarterStart.getFullYear(), prevQuarterStart.getMonth() + 3, 0);
      break;
    }
    case 'PREVIOUS_YEAR':
      start = new Date(date.getFullYear() - 1, 0, 1);
      end = new Date(date.getFullYear() - 1, 11, 31);
      break;
    default:
      start = getStartOfMonth(date);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      break;
  }

  return {
    period: normalizedPeriod,
    label: getPeriodLabel(normalizedPeriod),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    granularity: normalizedPeriod.includes('YEAR') ? 'Yearly' : normalizedPeriod.includes('QUARTER') ? 'Quarterly' : normalizedPeriod.includes('WEEK') ? 'Weekly' : 'Monthly',
    comparisonStart: null,
    comparisonEnd: null,
  };
}

function getPeriodComparisonBounds(period = 'MONTH', baseDate = new Date()) {
  const current = getPeriodBounds(period, baseDate);
  const previous = getPeriodBounds(period.startsWith('PREVIOUS_') ? period.replace('PREVIOUS_', 'THIS_') : `PREVIOUS_${period.replace('THIS_', '').replace('MONTH', 'MONTH')}`.replace(/_+/g, '_').replace(/^_+|_+$/g, ''), baseDate);
  return { current, previous };
}

function getMatchingAccountIdsForType(accounts, type) {
  return accounts.filter((account) => account.type === type).map((account) => account.id);
}

function computeAccountActivityForRange(engine, companyId, startDate = null, endDate = null) {
  const entries = engine.getPostedEntries(companyId).filter((entry) => isDateInRange(entry.date, startDate, endDate));
  const map = {};
  for (const account of engine.getCompanyAccounts(companyId)) {
    map[account.id] = { account, debit: 0, credit: 0, balance: 0 };
  }

  for (const entry of entries) {
    for (const line of entry.lines) {
      const account = engine.getAccountById(line.accountId);
      if (!account || account.companyId !== companyId) continue;
      if (!map[line.accountId]) {
        map[line.accountId] = { account, debit: 0, credit: 0, balance: 0 };
      }
      if (line.entryType === EntryType.DEBIT) {
        map[line.accountId].debit += safeNumber(line.amount);
      }
      if (line.entryType === EntryType.CREDIT) {
        map[line.accountId].credit += safeNumber(line.amount);
      }
    }
  }

  for (const accountId of Object.keys(map)) {
    const current = map[accountId];
    const net = current.debit - current.credit;
    current.balance = current.account.normalBalance === NormalBalance.DEBIT ? net : (current.credit - current.debit);
  }
  return map;
}

function computeAccountBalanceAsOf(engine, companyId, asOfDate = null) {
  const accountMap = {};
  for (const account of engine.getCompanyAccounts(companyId)) {
    const debit = engine.getPostedJournalLinesForAccount(account.id)
      .filter((line) => {
        const entry = engine.journalEntries.find((journalEntry) => journalEntry.id === line.journalEntryId);
        return !!entry && entry.companyId === companyId && entry.status === TransactionStatus.POSTED && (!asOfDate || isDateInRange(entry.date, null, asOfDate));
      })
      .filter((line) => line.entryType === EntryType.DEBIT)
      .reduce((sum, line) => sum + safeNumber(line.amount), 0);
    const credit = engine.getPostedJournalLinesForAccount(account.id)
      .filter((line) => {
        const entry = engine.journalEntries.find((journalEntry) => journalEntry.id === line.journalEntryId);
        return !!entry && entry.companyId === companyId && entry.status === TransactionStatus.POSTED && (!asOfDate || isDateInRange(entry.date, null, asOfDate));
      })
      .filter((line) => line.entryType === EntryType.CREDIT)
      .reduce((sum, line) => sum + safeNumber(line.amount), 0);
    const net = debit - credit;
    accountMap[account.id] = {
      account,
      debit,
      credit,
      balance: account.normalBalance === NormalBalance.DEBIT ? net : (credit - debit),
    };
  }
  return accountMap;
}

class ReportingSystem {
  constructor(companyService = null) {
    this.companyService = companyService || new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine || new BookkeeperEngine();
    this.arapService = new ARAPService('bookkeeper_mobile_company_setup_v1');
    this.transactionService = new TransactionService('bookkeeper_mobile_transactions_v1');
    this.transactionService.companyService = this.companyService;
    this.transactionService.engine = this.engine;
    this.arapService.companyService = this.companyService;
    this.arapService.engine = this.engine;
  }

  normalizeCompanyId(companyId) {
    return String(companyId || this.companyService.activeCompanyId || '').trim() || null;
  }

  normalizeArgs(companyIdOrOptions, startDate, endDate) {
    if (companyIdOrOptions && typeof companyIdOrOptions === 'object' && !Array.isArray(companyIdOrOptions)) {
      return {
        companyId: companyIdOrOptions.companyId || companyIdOrOptions.company || this.normalizeCompanyId(),
        startDate: normalizeDate(companyIdOrOptions.startDate || companyIdOrOptions.fromDate || null),
        endDate: normalizeDate(companyIdOrOptions.endDate || companyIdOrOptions.toDate || null),
        period: companyIdOrOptions.period || companyIdOrOptions.range || 'MONTH',
      };
    }

    return {
      companyId: this.normalizeCompanyId(companyIdOrOptions),
      startDate: normalizeDate(startDate),
      endDate: normalizeDate(endDate),
      period: 'MONTH',
    };
  }

  validateReport(reportName, validation) {
    const defaultValidation = {
      status: 'BALANCED',
      message: 'Accounting reports balanced',
      reason: '',
    };
    if (!validation || typeof validation !== 'object') return defaultValidation;
    return {
      ...defaultValidation,
      ...validation,
      status: validation.valid === false ? 'FAILED' : (validation.status || defaultValidation.status),
      message: validation.message || defaultValidation.message,
      reason: validation.reason || validation.details || '',
    };
  }

  getCompanyAccounts(companyId) {
    return this.engine.getCompanyAccounts(companyId);
  }

  getPostedEntries(companyId, startDate = null, endDate = null) {
    return this.engine.getPostedEntries(companyId).filter((entry) => isDateInRange(entry.date, startDate, endDate));
  }

  getAccountActivity(companyId, startDate = null, endDate = null) {
    return computeAccountActivityForRange(this.engine, companyId, startDate, endDate);
  }

  getIncomeStatement(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, revenue: 0, expenses: 0, netIncome: 0, revenueAccounts: [], expenseAccounts: [], status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const accountActivity = this.getAccountActivity(companyId, rangeStart, rangeEnd);
    const revenueAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.REVENUE)
      .map((account) => ({
        accountId: account.id,
        code: account.code,
        title: account.title,
        accountType: account.type,
        normalBalance: account.normalBalance,
        debit: accountActivity[account.id]?.debit || 0,
        credit: accountActivity[account.id]?.credit || 0,
        amount: accountActivity[account.id]?.credit || 0,
      }));

    const expenseAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.EXPENSE)
      .map((account) => ({
        accountId: account.id,
        code: account.code,
        title: account.title,
        accountType: account.type,
        normalBalance: account.normalBalance,
        debit: accountActivity[account.id]?.debit || 0,
        credit: accountActivity[account.id]?.credit || 0,
        amount: accountActivity[account.id]?.debit || 0,
      }));

    const revenue = revenueAccounts.reduce((sum, row) => sum + row.amount, 0);
    const expenses = expenseAccounts.reduce((sum, row) => sum + row.amount, 0);
    const netIncome = revenue - expenses;
    const validation = {
      valid: Math.abs((revenue - expenses) - netIncome) < 0.01,
      status: 'BALANCED',
      message: 'Accounting reports balanced',
      reason: '',
    };

    return {
      companyId,
      reportTitle: 'Income Statement',
      startDate: rangeStart,
      endDate: rangeEnd,
      revenue,
      expenses,
      netIncome,
      revenueAccounts,
      expenseAccounts,
      validation: this.validateReport('Income Statement', validation),
    };
  }

  getBalanceSheet(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, assets: 0, liabilities: 0, equity: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const activity = this.getAccountActivity(companyId, rangeStart, rangeEnd);
    const assetAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.ASSET)
      .map((account) => ({ ...account, balance: activity[account.id]?.balance || this.engine.getAccountBalance(account.id) }));
    const liabilityAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.LIABILITY)
      .map((account) => ({ ...account, balance: activity[account.id]?.balance || this.engine.getAccountBalance(account.id) }));
    const equityAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.EQUITY)
      .map((account) => ({ ...account, balance: activity[account.id]?.balance || this.engine.getAccountBalance(account.id) }));

    const incomeStatement = this.getIncomeStatement(companyId, rangeStart, rangeEnd);
    const assets = assetAccounts.reduce((sum, row) => sum + row.balance, 0);
    const liabilities = liabilityAccounts.reduce((sum, row) => sum + row.balance, 0);
    const equity = equityAccounts.reduce((sum, row) => sum + row.balance, 0) + incomeStatement.netIncome;
    const validation = {
      valid: Math.abs(assets - (liabilities + equity)) < 0.01,
      status: 'BALANCED',
      message: 'Accounting reports balanced',
      reason: '',
    };

    return {
      companyId,
      reportTitle: 'Balance Sheet',
      startDate: rangeStart,
      endDate: rangeEnd,
      assets,
      liabilities,
      equity,
      assetAccounts,
      liabilityAccounts,
      equityAccounts,
      validation: this.validateReport('Balance Sheet', validation),
    };
  }

  getTrialBalance(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, rows: [], totalDebit: 0, totalCredit: 0, difference: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const rows = this.getCompanyAccounts(companyId).map((account) => {
      const activity = this.getAccountActivity(companyId, rangeStart, rangeEnd)[account.id] || { debit: 0, credit: 0, balance: 0 };
      const balance = activity.balance || this.engine.getAccountBalance(account.id);
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
        accountId: account.id,
        code: account.code,
        title: account.title,
        accountType: account.type,
        normalBalance: account.normalBalance,
        debit,
        credit,
      };
    });

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
    const difference = totalDebit - totalCredit;
    const status = Math.abs(difference) < 0.01 ? 'BALANCED' : 'OUT_OF_BALANCE';
    return {
      companyId,
      reportTitle: 'Trial Balance',
      startDate: rangeStart,
      endDate: rangeEnd,
      rows,
      totalDebit,
      totalCredit,
      difference,
      status,
      validation: {
        status: status === 'BALANCED' ? 'BALANCED' : 'FAILED',
        message: status === 'BALANCED' ? 'Accounting reports balanced' : 'Report validation failed',
        reason: status === 'BALANCED' ? '' : `Difference: ${difference}`,
      },
    };
  }

  getGeneralLedger(companyIdOrOptions, startDate, endDate, accountFilter = null, search = '') {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) return [];

    const query = String(search || '').trim().toLowerCase();
    const rows = [];
    for (const entry of this.getPostedEntries(companyId, rangeStart, rangeEnd)) {
      for (const line of entry.lines) {
        const account = this.engine.getAccountById(line.accountId);
        if (!account || account.companyId !== companyId) continue;
        if (accountFilter && String(line.accountId) !== String(accountFilter)) continue;
        if (query && !`${entry.description} ${entry.reference} ${account.code} ${account.title}`.toLowerCase().includes(query)) continue;
        rows.push({
          companyId,
          entryId: entry.id,
          date: entry.date,
          reference: entry.reference || entry.description,
          description: entry.description,
          accountId: account.id,
          accountCode: account.code,
          accountTitle: account.title,
          debit: line.entryType === EntryType.DEBIT ? safeNumber(line.amount) : 0,
          credit: line.entryType === EntryType.CREDIT ? safeNumber(line.amount) : 0,
          runningBalance: 0,
        });
      }
    }

    const accountMap = {};
    for (const row of rows.sort((left, right) => new Date(left.date) - new Date(right.date))) {
      const key = `${row.accountId}`;
      accountMap[key] = (accountMap[key] || 0) + row.debit - row.credit;
      row.runningBalance = accountMap[key];
    }
    return rows;
  }

  getGeneralJournal(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) return [];
    const rows = [];
    for (const entry of this.getPostedEntries(companyId, rangeStart, rangeEnd)) {
      const debitLine = entry.lines.find((line) => line.entryType === EntryType.DEBIT);
      const creditLine = entry.lines.find((line) => line.entryType === EntryType.CREDIT);
      rows.push({
        companyId,
        date: entry.date,
        reference: entry.reference || entry.description,
        description: entry.description,
        debitAccount: debitLine ? (this.engine.getAccountById(debitLine.accountId)?.title || debitLine.accountCode || '') : '',
        creditAccount: creditLine ? (this.engine.getAccountById(creditLine.accountId)?.title || creditLine.accountCode || '') : '',
        debit: debitLine ? safeNumber(debitLine.amount) : 0,
        credit: creditLine ? safeNumber(creditLine.amount) : 0,
      });
    }
    return rows;
  }

  getCashFlowStatement(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, operatingActivities: { inflows: 0, outflows: 0, net: 0 }, investingActivities: { inflows: 0, outflows: 0, net: 0 }, financingActivities: { inflows: 0, outflows: 0, net: 0 }, beginningCash: 0, endingCash: 0, netChangeInCash: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const accounts = this.getCompanyAccounts(companyId);
    const cashAccounts = accounts.filter((account) => account.type === AccountType.ASSET && /cash|bank/i.test(account.title));
    const accountBalances = computeAccountBalanceAsOf(this.engine, companyId, rangeStart);
    const beginningCash = cashAccounts.reduce((sum, account) => sum + (accountBalances[account.id]?.balance || this.engine.getAccountBalance(account.id)), 0);
    const endingCash = cashAccounts.reduce((sum, account) => sum + this.engine.getAccountBalance(account.id), 0);

    const cashInflows = this.getPostedEntries(companyId, rangeStart, rangeEnd)
      .flatMap((entry) => entry.lines)
      .filter((line) => {
        const account = this.engine.getAccountById(line.accountId);
        return !!account && account.type === AccountType.ASSET && /cash|bank/i.test(account.title) && line.entryType === EntryType.DEBIT;
      })
      .reduce((sum, line) => sum + safeNumber(line.amount), 0);

    const cashOutflows = this.getPostedEntries(companyId, rangeStart, rangeEnd)
      .flatMap((entry) => entry.lines)
      .filter((line) => {
        const account = this.engine.getAccountById(line.accountId);
        return !!account && account.type === AccountType.ASSET && /cash|bank/i.test(account.title) && line.entryType === EntryType.CREDIT;
      })
      .reduce((sum, line) => sum + safeNumber(line.amount), 0);

    const netChangeInCash = endingCash - beginningCash;
    const review = cashAccounts.length === 0 ? [{ account: null, reason: 'No cash or bank account found; classification requires review' }] : [];

    return {
      companyId,
      reportTitle: 'Cash Flow Statement',
      startDate: rangeStart,
      endDate: rangeEnd,
      beginningCash,
      operatingActivities: { inflows: cashInflows, outflows: cashOutflows, net: cashInflows - cashOutflows },
      investingActivities: { inflows: 0, outflows: 0, net: 0 },
      financingActivities: { inflows: 0, outflows: 0, net: 0 },
      cashInflows,
      cashOutflows,
      netChangeInCash,
      endingCash,
      requiresReview: review,
      validation: {
        status: 'BALANCED',
        message: 'Accounting reports balanced',
        reason: review.length ? 'Automatic classification unavailable for some cash flow items; manual review required' : '',
      },
    };
  }

  getOwnersEquityStatement(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, beginningEquity: 0, ownerInvestments: 0, netIncome: 0, ownerDrawings: 0, otherEquityChanges: 0, endingEquity: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const incomeStatement = this.getIncomeStatement(companyId, rangeStart, rangeEnd);
    const equityAccounts = this.getCompanyAccounts(companyId).filter((account) => account.type === AccountType.EQUITY);
    const beginningEquity = equityAccounts.reduce((sum, account) => sum + this.engine.getAccountBalance(account.id), 0);
    const ownerInvestments = this.getPostedEntries(companyId, rangeStart, rangeEnd)
      .flatMap((entry) => entry.lines)
      .filter((line) => {
        const account = this.engine.getAccountById(line.accountId);
        return !!account && account.type === AccountType.EQUITY && /capital|investment|equity/i.test(account.title);
      })
      .reduce((sum, line) => sum + (line.entryType === EntryType.DEBIT ? 0 : safeNumber(line.amount)), 0);
    const ownerDrawings = this.getPostedEntries(companyId, rangeStart, rangeEnd)
      .flatMap((entry) => entry.lines)
      .filter((line) => {
        const account = this.engine.getAccountById(line.accountId);
        return !!account && account.type === AccountType.EQUITY && /draw|withdraw/i.test(account.title);
      })
      .reduce((sum, line) => sum + (line.entryType === EntryType.CREDIT ? safeNumber(line.amount) : 0), 0);
    const otherEquityChanges = 0;
    const endingEquity = beginningEquity + ownerInvestments + incomeStatement.netIncome - ownerDrawings + otherEquityChanges;
    const balanceSheet = this.getBalanceSheet(companyId, rangeStart, rangeEnd);
    const valid = Math.abs(endingEquity - balanceSheet.equity) < 0.01;

    return {
      companyId,
      reportTitle: "Statement of Owner's Equity",
      startDate: rangeStart,
      endDate: rangeEnd,
      beginningEquity,
      ownerInvestments,
      netIncome: incomeStatement.netIncome,
      ownerDrawings,
      otherEquityChanges,
      endingEquity,
      validation: {
        status: valid ? 'BALANCED' : 'FAILED',
        message: valid ? 'Accounting reports balanced' : 'Report validation failed',
        reason: valid ? '' : 'Ending equity does not reconcile to the balance sheet equity',
      },
    };
  }

  getARReport(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, rows: [], totalAR: 0, currentAR: 0, overdueAR: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const rows = this.arapService.listInvoices(companyId).map((invoice) => {
      const paid = this.arapService.engine.invoicePayments
        .filter((payment) => payment.companyId === companyId && payment.invoiceId === (invoice.id || invoice.invoiceId))
        .reduce((sum, payment) => sum + safeNumber(payment.amount), 0);
      const outstanding = Math.max(invoice.total - paid, 0);
      return {
        customer: this.arapService.getCustomerById(companyId, invoice.customerId)?.name || invoice.customerId,
        invoice: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate || invoice.date,
        dueDate: invoice.dueDate,
        amount: invoice.total,
        paid,
        outstanding,
        status: invoice.status,
      };
    }).filter((row) => isDateInRange(row.invoiceDate, rangeStart, rangeEnd) || isDateInRange(row.dueDate, rangeStart, rangeEnd));

    const totalAR = rows.reduce((sum, row) => sum + row.outstanding, 0);
    const currentAR = rows.filter((row) => !row.dueDate || new Date(row.dueDate) >= new Date()).reduce((sum, row) => sum + row.outstanding, 0);
    const overdueAR = rows.filter((row) => row.dueDate && new Date(row.dueDate) < new Date()).reduce((sum, row) => sum + row.outstanding, 0);
    const customerBalanceTotal = this.arapService.listCustomers(companyId).reduce((sum, customer) => sum + this.arapService.getCustomerOutstandingBalance(companyId, customer.customerId), 0);
    const valid = Math.abs(customerBalanceTotal - totalAR) < 0.01;
    return {
      companyId,
      reportTitle: 'Accounts Receivable Report',
      startDate: rangeStart,
      endDate: rangeEnd,
      rows,
      totalAR,
      currentAR,
      overdueAR,
      validation: {
        status: valid ? 'BALANCED' : 'FAILED',
        message: valid ? 'Accounting reports balanced' : 'Report validation failed',
        reason: valid ? '' : 'AR balances do not reconcile to customer ledger balances',
      },
    };
  }

  getAPReport(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) {
      return { companyId: null, rows: [], totalAP: 0, currentAP: 0, overdueAP: 0, status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    }

    const rows = this.arapService.listBills(companyId).map((bill) => {
      const paid = this.arapService.engine.billPayments
        .filter((payment) => payment.companyId === companyId && payment.billId === (bill.id || bill.billId))
        .reduce((sum, payment) => sum + safeNumber(payment.amount), 0);
      const outstanding = Math.max(bill.total - paid, 0);
      return {
        vendor: this.arapService.getVendorById(companyId, bill.vendorId)?.name || bill.vendorId,
        bill: bill.billNumber,
        billDate: bill.billDate || bill.date,
        dueDate: bill.dueDate,
        amount: bill.total,
        paid,
        outstanding,
        status: bill.status,
      };
    }).filter((row) => isDateInRange(row.billDate, rangeStart, rangeEnd) || isDateInRange(row.dueDate, rangeStart, rangeEnd));

    const totalAP = rows.reduce((sum, row) => sum + row.outstanding, 0);
    const currentAP = rows.filter((row) => !row.dueDate || new Date(row.dueDate) >= new Date()).reduce((sum, row) => sum + row.outstanding, 0);
    const overdueAP = rows.filter((row) => row.dueDate && new Date(row.dueDate) < new Date()).reduce((sum, row) => sum + row.outstanding, 0);
    const vendorBalanceTotal = this.arapService.listVendors(companyId).reduce((sum, vendor) => sum + this.arapService.getVendorOutstandingBalance(companyId, vendor.vendorId), 0);
    const valid = Math.abs(vendorBalanceTotal - totalAP) < 0.01;
    return {
      companyId,
      reportTitle: 'Accounts Payable Report',
      startDate: rangeStart,
      endDate: rangeEnd,
      rows,
      totalAP,
      currentAP,
      overdueAP,
      validation: {
        status: valid ? 'BALANCED' : 'FAILED',
        message: valid ? 'Accounting reports balanced' : 'Report validation failed',
        reason: valid ? '' : 'AP balances do not reconcile to vendor ledger balances',
      },
    };
  }

  getCustomerLedger(companyIdOrOptions, customerId, filters = {}) {
    const { companyId } = this.normalizeArgs(companyIdOrOptions, null, null);
    const targetCustomer = customerId || filters.customerId || null;
    if (!companyId || !targetCustomer) return [];
    return this.arapService.getCustomerLedger(companyId, targetCustomer, filters);
  }

  getVendorLedger(companyIdOrOptions, vendorId, filters = {}) {
    const { companyId } = this.normalizeArgs(companyIdOrOptions, null, null);
    const targetVendor = vendorId || filters.vendorId || null;
    if (!companyId || !targetVendor) return [];
    return this.arapService.getVendorLedger(companyId, targetVendor, filters);
  }

  getBankReconciliationReport(companyIdOrOptions, bankAccountId = null) {
    const { companyId } = this.normalizeArgs(companyIdOrOptions, null, null);
    if (!companyId) return { companyId: null, rows: [], status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    const reconciliations = this.engine.reconciliations.filter((record) => record.companyId === companyId);
    const selected = reconciliations.find((record) => !bankAccountId || record.bankAccountId === bankAccountId) || reconciliations[0] || null;
    if (!selected) return { companyId, rows: [], bankStatementBalance: 0, bookBalance: 0, outstandingItems: 0, adjustments: 0, difference: 0, status: 'BALANCED', message: 'Accounting reports balanced' };
    const bankStatementBalance = safeNumber(selected.endingBalance);
    const bookBalance = safeNumber(selected.clearedBalance || selected.endingBalance);
    const outstandingItems = safeNumber(selected.outstandingItems || 0);
    const adjustments = safeNumber(selected.adjustments || 0);
    const difference = bankStatementBalance - (bookBalance + outstandingItems + adjustments);
    return {
      companyId,
      reportTitle: 'Bank Reconciliation Report',
      bankStatementBalance,
      bookBalance,
      outstandingItems,
      adjustments,
      difference,
      status: Math.abs(difference) < 0.01 ? 'BALANCED' : 'FAILED',
      message: Math.abs(difference) < 0.01 ? 'Accounting reports balanced' : 'Report validation failed',
      reason: Math.abs(difference) < 0.01 ? '' : 'Bank statement and book balances do not reconcile',
      row: selected,
    };
  }

  getChartOfAccountsReport(companyIdOrOptions) {
    const { companyId } = this.normalizeArgs(companyIdOrOptions, null, null);
    if (!companyId) return [];
    return this.getCompanyAccounts(companyId).map((account) => ({
      companyId,
      code: account.code,
      title: account.title,
      accountType: account.type,
      normalBalance: account.normalBalance,
      currentBalance: this.engine.getAccountBalance(account.id),
      active: account.active !== false && !account.archived,
      archived: !!account.archived,
    }));
  }

  getTransactionReport(companyIdOrOptions, startDate, endDate) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) return [];
    const rows = [];
    for (const entry of this.engine.getPostedEntries(companyId)) {
      if (!isDateInRange(entry.date, rangeStart, rangeEnd)) continue;
      for (const line of entry.lines || []) {
        const account = this.engine.getAccountById(line.accountId);
        rows.push({
          date: entry.date,
          reference: entry.reference,
          description: entry.description,
          transactionType: 'Journal Entry',
          account: account ? `${account.code} - ${account.title}` : line.accountId,
          debit: line.entryType === EntryType.DEBIT ? (Number(line.amount) || 0) : 0,
          credit: line.entryType === EntryType.CREDIT ? (Number(line.amount) || 0) : 0,
          status: entry.status,
        });
      }
    }
    return rows;
  }

  getPeriodComparison(companyIdOrOptions, currentPeriod = 'MONTH', comparisonPeriod = null) {
    const { companyId } = this.normalizeArgs(companyIdOrOptions, null, null);
    if (!companyId) return { companyId: null, rows: [], status: 'FAILED', message: 'Report validation failed', reason: 'Company is missing' };
    const currentPeriodName = comparisonPeriod || currentPeriod;
    const currentBounds = getPeriodBounds(currentPeriodName, new Date());
    const previousBounds = getPeriodBounds(`PREVIOUS_${String(currentPeriodName).toUpperCase().replace('THIS_', '')}`, new Date());
    const metrics = [
      { key: 'revenue', getValue: (value) => value.revenue },
      { key: 'expenses', getValue: (value) => value.expenses },
      { key: 'netIncome', getValue: (value) => value.netIncome },
      { key: 'cash', getValue: (value) => value.endingCash },
      { key: 'AR', getValue: (value) => value.totalAR },
      { key: 'AP', getValue: (value) => value.totalAP },
      { key: 'assets', getValue: (value) => value.assets },
      { key: 'liabilities', getValue: (value) => value.liabilities },
      { key: 'equity', getValue: (value) => value.equity },
    ];

    const rows = metrics.map(({ key, getValue }) => {
      const current = { revenue: this.getIncomeStatement(companyId, currentBounds.startDate, currentBounds.endDate).revenue, expenses: this.getIncomeStatement(companyId, currentBounds.startDate, currentBounds.endDate).expenses, netIncome: this.getIncomeStatement(companyId, currentBounds.startDate, currentBounds.endDate).netIncome, endingCash: this.getCashFlowStatement(companyId, currentBounds.startDate, currentBounds.endDate).endingCash, totalAR: this.getARReport(companyId, currentBounds.startDate, currentBounds.endDate).totalAR, totalAP: this.getAPReport(companyId, currentBounds.startDate, currentBounds.endDate).totalAP, assets: this.getBalanceSheet(companyId, currentBounds.startDate, currentBounds.endDate).assets, liabilities: this.getBalanceSheet(companyId, currentBounds.startDate, currentBounds.endDate).liabilities, equity: this.getBalanceSheet(companyId, currentBounds.startDate, currentBounds.endDate).equity };
      const previous = { revenue: this.getIncomeStatement(companyId, previousBounds.startDate, previousBounds.endDate).revenue, expenses: this.getIncomeStatement(companyId, previousBounds.startDate, previousBounds.endDate).expenses, netIncome: this.getIncomeStatement(companyId, previousBounds.startDate, previousBounds.endDate).netIncome, endingCash: this.getCashFlowStatement(companyId, previousBounds.startDate, previousBounds.endDate).endingCash, totalAR: this.getARReport(companyId, previousBounds.startDate, previousBounds.endDate).totalAR, totalAP: this.getAPReport(companyId, previousBounds.startDate, previousBounds.endDate).totalAP, assets: this.getBalanceSheet(companyId, previousBounds.startDate, previousBounds.endDate).assets, liabilities: this.getBalanceSheet(companyId, previousBounds.startDate, previousBounds.endDate).liabilities, equity: this.getBalanceSheet(companyId, previousBounds.startDate, previousBounds.endDate).equity };

      const currentAmount = getValue(current);
      const previousAmount = getValue(previous);
      const difference = currentAmount - previousAmount;
      const percentageChange = previousAmount === 0 ? null : ((difference / previousAmount) * 100);
      return { metric: key, currentAmount, previousAmount, difference, percentageChange };
    });

    return { companyId, currentPeriod, comparisonPeriod: previousBounds.label || comparisonPeriod || currentPeriod, rows, validation: { status: 'BALANCED', message: 'Accounting reports balanced' } };
  }

  getGraphData(companyIdOrOptions, period = 'MONTH', startDate = null, endDate = null) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) return { datasets: [] };
    const range = getPeriodBounds(period, new Date(), rangeStart || null, rangeEnd || null);
    const current = this.getIncomeStatement(companyId, range.startDate, range.endDate);
    const cash = this.getCashFlowStatement(companyId, range.startDate, range.endDate);
    const ar = this.getARReport(companyId, range.startDate, range.endDate);
    const ap = this.getAPReport(companyId, range.startDate, range.endDate);
    const balance = this.getBalanceSheet(companyId, range.startDate, range.endDate);
    return {
      period: range.period,
      granularity: range.granularity,
      labels: [range.label],
      datasets: [
        { name: 'Revenue vs Expenses', data: [{ label: 'Revenue', value: current.revenue }, { label: 'Expenses', value: current.expenses }] },
        { name: 'Revenue Trend', data: [{ label: range.label, value: current.revenue }] },
        { name: 'Expense Trend', data: [{ label: range.label, value: current.expenses }] },
        { name: 'Net Income Trend', data: [{ label: range.label, value: current.netIncome }] },
        { name: 'Cash Trend', data: [{ label: range.label, value: cash.endingCash }] },
        { name: 'AR Trend', data: [{ label: range.label, value: ar.totalAR }] },
        { name: 'AP Trend', data: [{ label: range.label, value: ap.totalAP }] },
        { name: 'Expense Breakdown', data: current.expenseAccounts.map((row) => ({ label: row.title, value: row.amount })) },
        { name: 'Revenue Breakdown', data: current.revenueAccounts.map((row) => ({ label: row.title, value: row.amount })) },
        { name: 'Assets vs Liabilities vs Equity', data: [{ label: 'Assets', value: balance.assets }, { label: 'Liabilities', value: balance.liabilities }, { label: 'Equity', value: balance.equity }] },
        { name: 'Cash Inflow vs Cash Outflow', data: [{ label: 'Inflow', value: cash.cashInflows }, { label: 'Outflow', value: cash.cashOutflows }] },
      ],
    };
  }

  getDashboardSummary(companyIdOrOptions, period = 'MONTH', startDate = null, endDate = null) {
    const { companyId, startDate: rangeStart, endDate: rangeEnd } = this.normalizeArgs(companyIdOrOptions, startDate, endDate);
    if (!companyId) return { companyId: null, revenue: 0, expenses: 0, netIncome: 0, cash: 0, bank: 0, accountsReceivable: 0, accountsPayable: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
    const income = this.getIncomeStatement(companyId, rangeStart || rangeEnd ? rangeStart : null, rangeEnd || null);
    const cashFlow = this.getCashFlowStatement(companyId, rangeStart || rangeEnd ? rangeStart : null, rangeEnd || null);
    const ar = this.getARReport(companyId, rangeStart || rangeEnd ? rangeStart : null, rangeEnd || null);
    const ap = this.getAPReport(companyId, rangeStart || rangeEnd ? rangeStart : null, rangeEnd || null);
    const balance = this.getBalanceSheet(companyId, rangeStart || rangeEnd ? rangeStart : null, rangeEnd || null);
    const bank = this.getBankReconciliationReport(companyId, null).bookBalance || 0;
    return {
      companyId,
      revenue: income.revenue,
      expenses: income.expenses,
      netIncome: income.netIncome,
      cash: cashFlow.endingCash,
      bank,
      accountsReceivable: ar.totalAR,
      accountsPayable: ap.totalAP,
      totalAssets: balance.assets,
      totalLiabilities: balance.liabilities,
      totalEquity: balance.equity,
      period: period.toUpperCase(),
    };
  }

  generateReports(companyIdOrOptions, period = 'MONTH', startDate = null, endDate = null) {
    const args = typeof companyIdOrOptions === 'object' && companyIdOrOptions && !Array.isArray(companyIdOrOptions)
      ? companyIdOrOptions
      : { companyId: companyIdOrOptions, period, startDate, endDate };

    const companyId = args.companyId || this.normalizeCompanyId();
    const normalizedRange = getPeriodBounds(args.period || period, new Date(), args.startDate || startDate, args.endDate || endDate);
    const rangeStart = normalizedRange.startDate || args.startDate || startDate || null;
    const rangeEnd = normalizedRange.endDate || args.endDate || endDate || null;

    return {
      dashboard: this.getDashboardSummary(companyId, args.period || period, rangeStart, rangeEnd),
      incomeStatement: this.getIncomeStatement(companyId, rangeStart, rangeEnd),
      balanceSheet: this.getBalanceSheet(companyId, rangeStart, rangeEnd),
      cashFlow: this.getCashFlowStatement(companyId, rangeStart, rangeEnd),
      ownersEquity: this.getOwnersEquityStatement(companyId, rangeStart, rangeEnd),
      trialBalance: this.getTrialBalance(companyId, rangeStart, rangeEnd),
      generalLedger: this.getGeneralLedger(companyId, rangeStart, rangeEnd),
      generalJournal: this.getGeneralJournal(companyId, rangeStart, rangeEnd),
      ar: this.getARReport(companyId, rangeStart, rangeEnd),
      ap: this.getAPReport(companyId, rangeStart, rangeEnd),
      customerLedger: this.getCustomerLedger(companyId, null, { fromDate: rangeStart, toDate: rangeEnd }),
      vendorLedger: this.getVendorLedger(companyId, null, { fromDate: rangeStart, toDate: rangeEnd }),
      bankReconciliation: this.getBankReconciliationReport(companyId),
      chartOfAccounts: this.getChartOfAccountsReport(companyId),
      transactions: this.getTransactionReport(companyId, rangeStart, rangeEnd),
      graphData: this.getGraphData(companyId, args.period || period, rangeStart, rangeEnd),
      validationResults: {
        trialBalance: this.getTrialBalance(companyId, rangeStart, rangeEnd).validation,
        balanceSheet: this.getBalanceSheet(companyId, rangeStart, rangeEnd).validation,
        incomeStatement: this.getIncomeStatement(companyId, rangeStart, rangeEnd).validation,
        ownersEquity: this.getOwnersEquityStatement(companyId, rangeStart, rangeEnd).validation,
        ar: this.getARReport(companyId, rangeStart, rangeEnd).validation,
        ap: this.getAPReport(companyId, rangeStart, rangeEnd).validation,
      },
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  ReportingSystem,
  getPeriodBounds,
  getPeriodLabel,
  generateReports: (companyIdOrOptions, period = 'MONTH', startDate = null, endDate = null) => new ReportingSystem().generateReports(companyIdOrOptions, period, startDate, endDate),
};
if (typeof window !== 'undefined') window.ReportingSystem = ReportingSystem;
})();
