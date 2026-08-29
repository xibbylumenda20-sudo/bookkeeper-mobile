const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BookkeeperEngine,
  AccountType,
  TransactionStatus,
} = require('../accounting-engine.js');

function buildEngineWithCompany(name = 'Demo Company') {
  const engine = new BookkeeperEngine();
  const company = engine.createCompany({ name, code: name.toLowerCase().replace(/\s+/g, '-') });

  const accounts = {
    cash: engine.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET }),
    ar: engine.createAccount(company.id, { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET }),
    ap: engine.createAccount(company.id, { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY }),
    capital: engine.createAccount(company.id, { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY }),
    sales: engine.createAccount(company.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE }),
    rent: engine.createAccount(company.id, { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE }),
    equip: engine.createAccount(company.id, { code: '1200', title: 'Equipment', type: AccountType.ASSET }),
    expenses: engine.createAccount(company.id, { code: '5200', title: 'Utilities Expense', type: AccountType.EXPENSE }),
  };

  return { engine, company, accounts };
}

test('new company starts with zero balances', () => {
  const { engine, company } = buildEngineWithCompany('Zero Balance Co');

  const balances = engine.calculateAccountBalances(company.id);
  const total = Object.values(balances).reduce((sum, account) => sum + account.balance, 0);

  assert.equal(total, 0);
  assert.equal(engine.getCompanyBalance(company.id), 0);
  assert.equal(engine.getTrialBalance(company.id).totalDebit, 0);
  assert.equal(engine.getTrialBalance(company.id).totalCredit, 0);
});

test('owner investment posts a balanced journal entry', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Owner Investor');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-01',
    description: 'Owner invests cash',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 50000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 50000 },
    ],
    createdBy: 'owner',
  });

  assert.equal(result.valid, true);
  assert.equal(engine.getAccountBalance(accounts.cash.id), 50000);
  assert.equal(engine.getAccountBalance(accounts.capital.id), 50000);
  assert.equal(engine.getGeneralLedger(company.id)[0].balance, 50000);
  assert.equal(engine.verifyAccountingEquation(company.id), 0);
});

test('cash expense posts as debit expense and credit cash', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Cash Expense Co');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-02',
    description: 'Pay rent',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 10000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 10000 },
    ],
    createdBy: 'bookkeeper',
  });

  assert.equal(result.valid, true);
  assert.equal(engine.getAccountBalance(accounts.rent.id), 10000);
  assert.equal(engine.getAccountBalance(accounts.cash.id), -10000);
});

test('credit sale creates accounts receivable and revenue', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Credit Sale Co');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-03',
    description: 'Sale on credit',
    lines: [
      { accountId: accounts.ar.id, entryType: 'debit', amount: 10000 },
      { accountId: accounts.sales.id, entryType: 'credit', amount: 10000 },
    ],
    createdBy: 'sales',
  });

  assert.equal(result.valid, true);
  assert.equal(engine.getAccountBalance(accounts.ar.id), 10000);
  assert.equal(engine.getAccountBalance(accounts.sales.id), 10000);
});

test('customer payment reduces receivable and increases cash', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Customer Payment Co');

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-03',
    description: 'Sale on credit',
    lines: [
      { accountId: accounts.ar.id, entryType: 'debit', amount: 10000 },
      { accountId: accounts.sales.id, entryType: 'credit', amount: 10000 },
    ],
    createdBy: 'sales',
  });

  const payment = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-05',
    description: 'Customer pays invoice',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 6000 },
      { accountId: accounts.ar.id, entryType: 'credit', amount: 6000 },
    ],
    createdBy: 'cashier',
  });

  assert.equal(payment.valid, true);
  assert.equal(engine.getAccountBalance(accounts.cash.id), 6000);
  assert.equal(engine.getAccountBalance(accounts.ar.id), 4000);
});

test('vendor bill records expense or asset against accounts payable', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Vendor Bill Co');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-06',
    description: 'Vendor bill',
    lines: [
      { accountId: accounts.expenses.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.ap.id, entryType: 'credit', amount: 5000 },
    ],
    createdBy: 'accounts-payable',
  });

  assert.equal(result.valid, true);
  assert.equal(engine.getAccountBalance(accounts.expenses.id), 5000);
  assert.equal(engine.getAccountBalance(accounts.ap.id), 5000);
});

test('vendor payment reduces accounts payable and cash', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Vendor Payment Co');

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-06',
    description: 'Vendor bill',
    lines: [
      { accountId: accounts.expenses.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.ap.id, entryType: 'credit', amount: 5000 },
    ],
    createdBy: 'accounts-payable',
  });

  const payment = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-07',
    description: 'Pay vendor',
    lines: [
      { accountId: accounts.ap.id, entryType: 'debit', amount: 2000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 2000 },
    ],
    createdBy: 'treasurer',
  });

  assert.equal(payment.valid, true);
  assert.equal(engine.getAccountBalance(accounts.ap.id), 3000);
  assert.equal(engine.getAccountBalance(accounts.cash.id), -2000);
});

test('partial AR payment reduces outstanding receivable', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Partial AR Co');

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-10',
    description: 'Sale on credit',
    lines: [
      { accountId: accounts.ar.id, entryType: 'debit', amount: 20000 },
      { accountId: accounts.sales.id, entryType: 'credit', amount: 20000 },
    ],
    createdBy: 'sales',
  });

  const payment = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-11',
    description: 'Partial customer payment',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 7500 },
      { accountId: accounts.ar.id, entryType: 'credit', amount: 7500 },
    ],
    createdBy: 'cashier',
  });

  assert.equal(payment.valid, true);
  assert.equal(engine.getAccountBalance(accounts.ar.id), 12500);
});

test('partial AP payment reduces liability owed', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Partial AP Co');

  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-12',
    description: 'Vendor bill',
    lines: [
      { accountId: accounts.expenses.id, entryType: 'debit', amount: 8000 },
      { accountId: accounts.ap.id, entryType: 'credit', amount: 8000 },
    ],
    createdBy: 'ap',
  });

  const payment = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-13',
    description: 'Partial vendor payment',
    lines: [
      { accountId: accounts.ap.id, entryType: 'debit', amount: 3000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 3000 },
    ],
    createdBy: 'treasurer',
  });

  assert.equal(payment.valid, true);
  assert.equal(engine.getAccountBalance(accounts.ap.id), 5000);
});

test('balanced journal passes validation and produces trial balance totals', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Balanced Journal Co');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-14',
    description: 'Balanced adjustment',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1500 },
      { accountId: accounts.equip.id, entryType: 'debit', amount: 8500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 10000 },
    ],
    createdBy: 'controller',
  });

  const tb = engine.getTrialBalance(company.id);

  assert.equal(result.valid, true);
  assert.equal(tb.totalDebit, 10000);
  assert.equal(tb.totalCredit, 10000);
  assert.equal(tb.balanced, true);
  assert.equal(tb.rows.some((row) => row.code === '1000' && row.debit === 1500), true);
});

test('unbalanced journal is rejected', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Unbalanced Co');

  const result = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-15',
    description: 'Unbalanced entry',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 4000 },
    ],
    createdBy: 'owner',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /debits.*credits|credits.*debits/i);
});

test('multiple companies never mix data', () => {
  const engine = new BookkeeperEngine();

  const companyA = engine.createCompany({ name: 'Company A', code: 'co-a' });
  const companyB = engine.createCompany({ name: 'Company B', code: 'co-b' });

  const cashA = engine.createAccount(companyA.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const capitalA = engine.createAccount(companyA.id, { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY });

  const cashB = engine.createAccount(companyB.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const capitalB = engine.createAccount(companyB.id, { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY });

  engine.postJournalEntry({
    companyId: companyA.id,
    date: '2026-08-01',
    description: 'A investment',
    lines: [
      { accountId: cashA.id, entryType: 'debit', amount: 1000 },
      { accountId: capitalA.id, entryType: 'credit', amount: 1000 },
    ],
    createdBy: 'owner',
  });

  engine.postJournalEntry({
    companyId: companyB.id,
    date: '2026-08-01',
    description: 'B investment',
    lines: [
      { accountId: cashB.id, entryType: 'debit', amount: 2500 },
      { accountId: capitalB.id, entryType: 'credit', amount: 2500 },
    ],
    createdBy: 'owner',
  });

  assert.equal(engine.getAccountBalance(cashA.id), 1000);
  assert.equal(engine.getAccountBalance(cashB.id), 2500);
  assert.equal(engine.getCompanyBalance(companyA.id), 1000);
  assert.equal(engine.getCompanyBalance(companyB.id), 2500);
});

test('draft transactions do not affect financial reports', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Draft Co');

  const draft = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-16',
    description: 'Draft entry',
    status: TransactionStatus.DRAFT,
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 1000 },
    ],
    createdBy: 'owner',
  });

  assert.equal(draft.valid, true);
  assert.equal(engine.getAccountBalance(accounts.cash.id), 0);
  assert.equal(engine.getTrialBalance(company.id).balanced, true);
});

test('voided transactions remain in audit history but are excluded from reports', () => {
  const { engine, company, accounts } = buildEngineWithCompany('Void Co');

  const posted = engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-17',
    description: 'Void example',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 500 },
    ],
    createdBy: 'owner',
  });

  const voided = engine.voidJournalEntry(posted.entry.id, { modifiedBy: 'admin' });

  assert.equal(voided.valid, true);
  assert.equal(engine.getAccountBalance(accounts.cash.id), 0);
  assert.equal(engine.getAuditLogs(company.id).length >= 2, true);
});
