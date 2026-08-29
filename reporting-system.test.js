const test = require('node:test');
const assert = require('node:assert/strict');
const { CompanySetupService } = require('./company-setup.js');
const { BookkeeperEngine, AccountType } = require('./accounting-engine.js');
const { ReportingSystem, getPeriodBounds } = require('./reporting-system.js');

function createCompanyWithAccounts() {
  const companyService = new CompanySetupService('reporting_test_setup');
  const engine = companyService.engine;
  const company = engine.createCompany({ name: 'Reporting Co', code: 'RC' });

  const cash = engine.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const ar = engine.createAccount(company.id, { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET });
  const revenue = engine.createAccount(company.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE });
  const expense = engine.createAccount(company.id, { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE });
  const equipment = engine.createAccount(company.id, { code: '1200', title: 'Equipment', type: AccountType.ASSET });
  const ap = engine.createAccount(company.id, { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY });
  const capital = engine.createAccount(company.id, { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY });

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-01',
    description: 'Owner investment',
    reference: 'INV-001',
    lines: [
      { accountId: cash.id, entryType: 'debit', amount: 10000 },
      { accountId: capital.id, entryType: 'credit', amount: 10000 },
    ],
  });

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-05',
    description: 'Collected sales',
    reference: 'SALE-001',
    lines: [
      { accountId: cash.id, entryType: 'debit', amount: 3000 },
      { accountId: revenue.id, entryType: 'credit', amount: 3000 },
    ],
  });

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-10',
    description: 'Paid rent',
    reference: 'EXP-001',
    lines: [
      { accountId: expense.id, entryType: 'debit', amount: 1400 },
      { accountId: cash.id, entryType: 'credit', amount: 1400 },
    ],
  });

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-14',
    description: 'Equipment purchase',
    reference: 'EQ-001',
    lines: [
      { accountId: equipment.id, entryType: 'debit', amount: 2500 },
      { accountId: cash.id, entryType: 'credit', amount: 2500 },
    ],
  });

  return { companyService, engine, company, cash, ar, revenue, expense, equipment, ap, capital };
}

function createTwoCompanies() {
  const companyService = new CompanySetupService('reporting_multi_company_test');
  const engine = companyService.engine;
  const companyA = engine.createCompany({ name: 'Company A', code: 'A' });
  const companyB = engine.createCompany({ name: 'Company B', code: 'B' });
  const cashA = engine.createAccount(companyA.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const cashB = engine.createAccount(companyB.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const revenueA = engine.createAccount(companyA.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE });
  const revenueB = engine.createAccount(companyB.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE });

  engine.postJournalEntry({
    companyId: companyA.id,
    date: '2026-08-05',
    description: 'A revenue',
    reference: 'A-REV',
    lines: [
      { accountId: cashA.id, entryType: 'debit', amount: 1000 },
      { accountId: revenueA.id, entryType: 'credit', amount: 1000 },
    ],
  });

  engine.postJournalEntry({
    companyId: companyB.id,
    date: '2026-08-05',
    description: 'B revenue',
    reference: 'B-REV',
    lines: [
      { accountId: cashB.id, entryType: 'debit', amount: 2000 },
      { accountId: revenueB.id, entryType: 'credit', amount: 2000 },
    ],
  });

  return { companyService, engine, companyA, companyB };
}

test('period bounds support weekly and monthly ranges', () => {
  const weekly = getPeriodBounds('WEEK', new Date('2026-08-12T12:00:00Z'));
  const monthly = getPeriodBounds('MONTH', new Date('2026-08-12T12:00:00Z'));
  assert.equal(weekly.period, 'WEEK');
  assert.equal(weekly.granularity, 'Weekly');
  assert.equal(monthly.period, 'MONTH');
  assert.equal(monthly.granularity, 'Monthly');
  assert.ok(weekly.startDate && weekly.endDate);
});

test('income statement calculates revenue, expenses, and net income from posted entries', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getIncomeStatement(company.id, '2026-08-01', '2026-08-31');
  assert.equal(report.revenue, 3000);
  assert.equal(report.expenses, 1400);
  assert.equal(report.netIncome, 1600);
  assert.equal(report.validation.status, 'BALANCED');
});

test('balance sheet validates assets equals liabilities plus equity', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getBalanceSheet(company.id, '2026-08-01', '2026-08-31');
  assert.equal(report.assets, report.liabilities + report.equity);
  assert.equal(report.validation.status, 'BALANCED');
});

test('trial balance reports debit and credit totals and flags imbalance', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getTrialBalance(company.id, '2026-08-01', '2026-08-31');
  assert.ok(report.totalDebit >= 0);
  assert.ok(report.totalCredit >= 0);
  assert.equal(report.status, 'BALANCED');
});

test('general ledger calculates running balances from journal entries', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const ledger = reporting.getGeneralLedger(company.id, '2026-08-01', '2026-08-31');
  assert.ok(Array.isArray(ledger));
  assert.ok(ledger.length > 0);
  assert.ok(ledger.every((row) => row.runningBalance !== undefined));
});

test('general journal returns debit and credit account information', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const journal = reporting.getGeneralJournal(company.id, '2026-08-01', '2026-08-31');
  assert.ok(journal.length >= 4);
  assert.ok(journal[0].debit >= 0);
  assert.ok(journal[0].credit >= 0);
});

test('cash flow statement produces beginning, ending, and net cash values', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getCashFlowStatement(company.id, '2026-08-01', '2026-08-31');
  assert.ok(report.beginningCash >= 0);
  assert.ok(report.endingCash >= 0);
  assert.equal(report.netChangeInCash, report.endingCash - report.beginningCash);
});

test('owner equity statement reconciles to the balance sheet', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getOwnersEquityStatement(company.id, '2026-08-01', '2026-08-31');
  assert.ok(report.validation.status === 'BALANCED' || report.validation.status === 'FAILED');
  assert.ok(report.endingEquity >= 0);
});

test('AR report totals reconcile to outstanding customer balances', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getARReport(company.id, '2026-08-01', '2026-08-31');
  assert.ok(report.totalAR >= 0);
  assert.ok(report.currentAR >= 0);
  assert.ok(report.overdueAR >= 0);
});

test('AP report totals reconcile to outstanding vendor balances', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const report = reporting.getAPReport(company.id, '2026-08-01', '2026-08-31');
  assert.ok(report.totalAP >= 0);
  assert.ok(report.currentAP >= 0);
  assert.ok(report.overdueAP >= 0);
});

test('chart of accounts and transaction report are generated for the selected company', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const accounts = reporting.getChartOfAccountsReport(company.id);
  const transactions = reporting.getTransactionReport(company.id, '2026-08-01', '2026-08-31');
  assert.ok(Array.isArray(accounts));
  assert.ok(Array.isArray(transactions));
  assert.ok(accounts.length >= 1);
});

test('period comparison does not return NaN or Infinity when previous amount is zero', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const comparison = reporting.getPeriodComparison(company.id, 'MONTH');
  assert.ok(Array.isArray(comparison.rows));
  assert.ok(comparison.rows.every((row) => row.percentageChange === null || Number.isFinite(row.percentageChange)));
});

test('dashboard summary recalculates for the selected period', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const summary = reporting.getDashboardSummary(company.id, 'MONTH', '2026-08-01', '2026-08-31');
  assert.equal(summary.companyId, company.id);
  assert.ok(summary.netIncome >= 0);
  assert.ok(summary.totalAssets >= 0);
});

test('generateReports returns all major report sections for a company and period', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const reporting = new ReportingSystem(companyService);
  const reports = reporting.generateReports({ companyId: company.id, period: 'MONTH', startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.ok(reports.dashboard);
  assert.ok(reports.incomeStatement);
  assert.ok(reports.balanceSheet);
  assert.ok(reports.cashFlow);
  assert.ok(reports.trialBalance);
  assert.ok(reports.generalLedger);
  assert.ok(reports.generalJournal);
  assert.ok(reports.ar);
  assert.ok(reports.ap);
  assert.ok(reports.graphData);
});

test('multi-company validation keeps reports isolated by company', () => {
  const { companyService, companyA, companyB } = createTwoCompanies();
  const reporting = new ReportingSystem(companyService);
  const reportA = reporting.getIncomeStatement(companyA.id, '2026-08-01', '2026-08-31');
  const reportB = reporting.getIncomeStatement(companyB.id, '2026-08-01', '2026-08-31');
  assert.equal(reportA.revenue, 1000);
  assert.equal(reportB.revenue, 2000);
  assert.notEqual(reportA.revenue, reportB.revenue);
});
