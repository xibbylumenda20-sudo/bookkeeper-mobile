const test = require('node:test');
const assert = require('node:assert/strict');

const { TransactionService, TransactionType } = require('../transaction-system.js');
const { AccountType, TransactionStatus } = require('../accounting-engine.js');

function buildTransactionService() {
  const service = new TransactionService('txn-suite-1');
  const company = service.companyService.createCompany({
    name: 'Txn Company',
    businessType: 'Service',
    createdBy: 'admin',
  });

  const accounts = {
    cash: service.companyService.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET, createdBy: 'admin' }),
    rent: service.companyService.createAccount(company.id, { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE, createdBy: 'admin' }),
    sales: service.companyService.createAccount(company.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE, createdBy: 'admin' }),
    capital: service.companyService.createAccount(company.id, { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY, createdBy: 'admin' }),
    draw: service.companyService.createAccount(company.id, { code: '3100', title: "Owner's Drawings", type: AccountType.EQUITY, createdBy: 'admin' }),
    equipment: service.companyService.createAccount(company.id, { code: '1200', title: 'Equipment', type: AccountType.ASSET, createdBy: 'admin' }),
    loan: service.companyService.createAccount(company.id, { code: '2100', title: 'Loans Payable', type: AccountType.LIABILITY, createdBy: 'admin' }),
    ar: service.companyService.createAccount(company.id, { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET, createdBy: 'admin' }),
    ap: service.companyService.createAccount(company.id, { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY, createdBy: 'admin' }),
    income: service.companyService.createAccount(company.id, { code: '4100', title: 'Other Income', type: AccountType.REVENUE, createdBy: 'admin' }),
    bankA: service.companyService.createAccount(company.id, { code: '1010', title: 'BDO Operating Account', type: AccountType.ASSET, createdBy: 'admin' }),
    bankB: service.companyService.createAccount(company.id, { code: '1020', title: 'GCash Business', type: AccountType.ASSET, createdBy: 'admin' }),
  };

  return { service, company, accounts };
}

test('create expense transaction', () => {
  const { service, company, accounts } = buildTransactionService();

  const result = service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-08-15',
    description: 'Pay rent',
    reference: 'INV-RENT-001',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 10000, description: 'Rent expense' },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 10000, description: 'Cash payment' },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.transaction.status, TransactionStatus.POSTED);
  assert.equal(service.engine.getAccountBalance(accounts.rent.id), 10000);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), -10000);
});

test('expense produces correct debit and credit', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-08-16',
    description: 'Utilities',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 2500 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 2500 },
    ],
  });

  const balances = service.engine.calculateAccountBalances(company.id);
  assert.equal(balances[accounts.rent.id].debit, 2500);
  assert.equal(balances[accounts.cash.id].credit, 2500);
});

test('create income transaction', () => {
  const { service, company, accounts } = buildTransactionService();

  const result = service.createTransaction(company.id, {
    type: TransactionType.INCOME,
    date: '2026-08-17',
    description: 'Cash income',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.income.id, entryType: 'credit', amount: 5000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 5000);
  assert.equal(service.engine.getAccountBalance(accounts.income.id), 5000);
});

test('owner investment', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-08-18',
    description: 'Owner invests cash',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 50000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 50000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 50000);
  assert.equal(service.engine.getAccountBalance(accounts.capital.id), 50000);
});

test('owner withdrawal', () => {
  const { service, company, accounts } = buildTransactionService();

  service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-08-19',
    description: 'Owner invests cash',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 20000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 20000 },
    ],
  });

  const result = service.createTransaction(company.id, {
    type: TransactionType.OWNER_WITHDRAWAL,
    date: '2026-08-20',
    description: 'Owner withdrawal',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.draw.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 5000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.draw.id), -5000);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 15000);
});

test('asset purchase', () => {
  const { service, company, accounts } = buildTransactionService();

  const result = service.createTransaction(company.id, {
    type: TransactionType.ASSET_PURCHASE,
    date: '2026-08-21',
    description: 'Purchased equipment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.equipment.id, entryType: 'debit', amount: 20000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 20000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.equipment.id), 20000);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), -20000);
});

test('loan received', () => {
  const { service, company, accounts } = buildTransactionService();

  const result = service.createTransaction(company.id, {
    type: TransactionType.LOAN_TRANSACTION,
    date: '2026-08-22',
    description: 'Received loan',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 100000 },
      { accountId: accounts.loan.id, entryType: 'credit', amount: 100000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 100000);
  assert.equal(service.engine.getAccountBalance(accounts.loan.id), 100000);
});

test('loan payment', () => {
  const { service, company, accounts } = buildTransactionService();

  service.createTransaction(company.id, {
    type: TransactionType.LOAN_TRANSACTION,
    date: '2026-08-22',
    description: 'Received loan',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 100000 },
      { accountId: accounts.loan.id, entryType: 'credit', amount: 100000 },
    ],
  });

  const result = service.createTransaction(company.id, {
    type: TransactionType.LOAN_TRANSACTION,
    date: '2026-08-23',
    description: 'Pay principal',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.loan.id, entryType: 'debit', amount: 10000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 10000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.loan.id), 90000);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 90000);
});

test('transfer', () => {
  const { service, company, accounts } = buildTransactionService();

  service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-08-24',
    description: 'Initial owner investment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 20000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 20000 },
    ],
  });

  const result = service.createTransaction(company.id, {
    type: TransactionType.TRANSFER,
    date: '2026-08-25',
    description: 'Transfer to GCash',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.bankB.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.bankA.id, entryType: 'credit', amount: 5000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.bankB.id), 5000);
  assert.equal(service.engine.getAccountBalance(accounts.bankA.id), -5000);
});

test('customer payment', () => {
  const { service, company, accounts } = buildTransactionService();

  service.createTransaction(company.id, {
    type: TransactionType.SALES,
    date: '2026-08-26',
    description: 'Credit sale',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.ar.id, entryType: 'debit', amount: 10000 },
      { accountId: accounts.sales.id, entryType: 'credit', amount: 10000 },
    ],
  });

  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOMER_PAYMENT,
    date: '2026-08-27',
    description: 'Receive customer payment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 6000 },
      { accountId: accounts.ar.id, entryType: 'credit', amount: 6000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 6000);
  assert.equal(service.engine.getAccountBalance(accounts.ar.id), 4000);
});

test('vendor payment', () => {
  const { service, company, accounts } = buildTransactionService();

  service.createTransaction(company.id, {
    type: TransactionType.PURCHASES,
    date: '2026-08-28',
    description: 'Vendor bill',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.ap.id, entryType: 'credit', amount: 5000 },
    ],
  });

  const result = service.createTransaction(company.id, {
    type: TransactionType.VENDOR_PAYMENT,
    date: '2026-08-29',
    description: 'Pay vendor',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.ap.id, entryType: 'debit', amount: 2000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 2000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.ap.id), 3000);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), -2000);
});

test('multi-line journal', () => {
  const { service, company, accounts } = buildTransactionService();

  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-08-30',
    description: 'Multi-line entry',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1500 },
      { accountId: accounts.equipment.id, entryType: 'debit', amount: 8500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 10000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.totalDebit, 10000);
  assert.equal(result.totalCredit, 10000);
});

test('balanced transaction posts', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-08-31',
    description: 'Balanced custom entry',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 750 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 750 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.transaction.status, TransactionStatus.POSTED);
});

test('unbalanced transaction is rejected', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-01',
    description: 'Unbalanced custom entry',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 5000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 4000 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('unbalanced')));
});

test('missing account is rejected', () => {
  const { service, company } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-02',
    description: 'Missing account',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: 'missing-account', entryType: 'debit', amount: 500 },
      { accountId: 'missing-account-2', entryType: 'credit', amount: 500 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('invalid account')));
});

test('invalid amount is rejected', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-03',
    description: 'Bad amount',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 0 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 0 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('amount')));
});

test('invalid date is rejected', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: 'bad-date',
    description: 'Bad date',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 500 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('invalid date')));
});

test('archived account is rejected for new posting', () => {
  const { service, company, accounts } = buildTransactionService();
  service.companyService.archiveAccount(accounts.cash.id, 'admin');

  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-04',
    description: 'Archived account entry',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 500 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('archived')));
});

test('locked period is rejected', () => {
  const { service, company, accounts } = buildTransactionService();
  company.accountingPeriods = { '2026-09-01::2026-09-30': { locked: true } };

  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-05',
    description: 'Locked period entry',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 500 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('locked')));
});

test('draft does not affect account balance', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.saveDraft(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-06',
    description: 'Draft entry',
    status: TransactionStatus.DRAFT,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 1000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 0);
});

test('draft does not affect Trial Balance', () => {
  const { service, company, accounts } = buildTransactionService();
  service.saveDraft(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-07',
    description: 'Draft entry two',
    status: TransactionStatus.DRAFT,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 1000 },
    ],
  });

  const trialBalance = service.engine.getTrialBalance(company.id);
  assert.equal(trialBalance.balanced, true);
});

test('posted transaction affects account balance', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-09-08',
    description: 'Investment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 9000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 9000 },
    ],
  });

  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 9000);
  assert.equal(service.engine.getAccountBalance(accounts.capital.id), 9000);
});

test('posted transaction appears in General Journal', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-09-09',
    description: 'Expense posting',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 800 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 800 },
    ],
  });

  const journal = service.engine.getGeneralJournal(company.id);
  assert.ok(journal.some((row) => row.accountId === accounts.rent.id && row.amount === 800));
});

test('posted transaction appears in General Ledger', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-09-10',
    description: 'Expense ledger',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 950 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 950 },
    ],
  });

  const ledger = service.engine.getGeneralLedger(company.id);
  assert.ok(ledger.some((row) => row.accountId === accounts.rent.id && row.debit === 950));
});

test('posted transaction appears in Trial Balance', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-09-11',
    description: 'Expense balance',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 2000 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 2000 },
    ],
  });

  const tb = service.engine.getTrialBalance(company.id);
  assert.equal(tb.balanced, true);
  assert.ok(tb.rows.some((row) => row.code === '5100' && row.debit > 0));
});

test('voided transaction no longer affects current balances', () => {
  const { service, company, accounts } = buildTransactionService();
  const created = service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-09-12',
    description: 'Investment to void',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1500 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 1500 },
    ],
  });

  service.voidTransaction(created.transaction.id, 'admin');

  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 0);
  assert.equal(service.engine.getAccountBalance(accounts.capital.id), 0);
});

test('voided transaction remains in history', () => {
  const { service, company, accounts } = buildTransactionService();
  const created = service.createTransaction(company.id, {
    type: TransactionType.OWNER_INVESTMENT,
    date: '2026-09-13',
    description: 'Voided investment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1700 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 1700 },
    ],
  });

  service.voidTransaction(created.transaction.id, 'admin');
  const persisted = service.transactions.find((record) => record.id === created.transaction.id);

  assert.equal(persisted.status, TransactionStatus.VOIDED);
});

test('duplicate warning works', () => {
  const { service, company, accounts } = buildTransactionService();
  service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-09-14',
    description: 'Duplicate rent',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 1800 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 1800 },
    ],
  });

  const duplicate = service.createTransaction(company.id, {
    type: TransactionType.EXPENSE,
    date: '2026-09-14',
    description: 'Duplicate rent',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.rent.id, entryType: 'debit', amount: 1800 },
      { accountId: accounts.cash.id, entryType: 'credit', amount: 1800 },
    ],
  });

  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => String(error).toLowerCase().includes('duplicate')));
});

test('company isolation works', () => {
  const service = new TransactionService('txn-suite-2');
  const companyA = service.companyService.createCompany({ name: 'Tx Company A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.companyService.createCompany({ name: 'Tx Company B', businessType: 'Service', createdBy: 'admin' });

  const cashA = service.companyService.createAccount(companyA.id, { code: '1000', title: 'Cash A', type: AccountType.ASSET, createdBy: 'admin' });
  const cashB = service.companyService.createAccount(companyB.id, { code: '1000', title: 'Cash B', type: AccountType.ASSET, createdBy: 'admin' });
  const capitalA = service.companyService.createAccount(companyA.id, { code: '3000', title: "Owner's Capital A", type: AccountType.EQUITY, createdBy: 'admin' });
  const capitalB = service.companyService.createAccount(companyB.id, { code: '3000', title: "Owner's Capital B", type: AccountType.EQUITY, createdBy: 'admin' });

  service.createTransaction(companyA.id, {
    date: '2026-09-15',
    description: 'A investment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: cashA.id, entryType: 'debit', amount: 500 },
      { accountId: capitalA.id, entryType: 'credit', amount: 500 },
    ],
  });

  service.createTransaction(companyB.id, {
    date: '2026-09-16',
    description: 'B investment',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: cashB.id, entryType: 'debit', amount: 700 },
      { accountId: capitalB.id, entryType: 'credit', amount: 700 },
    ],
  });

  assert.equal(service.engine.getAccountBalance(cashA.id), 500);
  assert.equal(service.engine.getAccountBalance(cashB.id), 700);
});

test('switching company loads correct transactions', () => {
  const service = new TransactionService('txn-suite-3');
  const companyA = service.companyService.createCompany({ name: 'Switch A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.companyService.createCompany({ name: 'Switch B', businessType: 'Service', createdBy: 'admin' });

  const cashA = service.companyService.createAccount(companyA.id, { code: '1000', title: 'Cash A', type: AccountType.ASSET, createdBy: 'admin' });
  const capitalA = service.companyService.createAccount(companyA.id, { code: '3000', title: "Owner's Capital A", type: AccountType.EQUITY, createdBy: 'admin' });
  const cashB = service.companyService.createAccount(companyB.id, { code: '1000', title: 'Cash B', type: AccountType.ASSET, createdBy: 'admin' });
  const capitalB = service.companyService.createAccount(companyB.id, { code: '3000', title: "Owner's Capital B", type: AccountType.EQUITY, createdBy: 'admin' });

  service.createTransaction(companyA.id, { date: '2026-09-17', description: 'A tx', status: TransactionStatus.POSTED, createdBy: 'admin', lines: [{ accountId: cashA.id, entryType: 'debit', amount: 100 }, { accountId: capitalA.id, entryType: 'credit', amount: 100 }] });
  service.createTransaction(companyB.id, { date: '2026-09-18', description: 'B tx', status: TransactionStatus.POSTED, createdBy: 'admin', lines: [{ accountId: cashB.id, entryType: 'debit', amount: 200 }, { accountId: capitalB.id, entryType: 'credit', amount: 200 }] });

  service.companyService.switchCompany(companyA.id);
  assert.equal(service.listTransactions(companyA.id).length, 1);
  service.companyService.switchCompany(companyB.id);
  assert.equal(service.listTransactions(companyB.id).length, 1);
});

test('creating a transaction does not affect another company', () => {
  const service = new TransactionService('txn-suite-4');
  const companyA = service.companyService.createCompany({ name: 'Company A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.companyService.createCompany({ name: 'Company B', businessType: 'Service', createdBy: 'admin' });

  const cashA = service.companyService.createAccount(companyA.id, { code: '1000', title: 'Cash A', type: AccountType.ASSET, createdBy: 'admin' });
  const capitalA = service.companyService.createAccount(companyA.id, { code: '3000', title: "Owner's Capital A", type: AccountType.EQUITY, createdBy: 'admin' });
  const cashB = service.companyService.createAccount(companyB.id, { code: '1000', title: 'Cash B', type: AccountType.ASSET, createdBy: 'admin' });
  const capitalB = service.companyService.createAccount(companyB.id, { code: '3000', title: "Owner's Capital B", type: AccountType.EQUITY, createdBy: 'admin' });

  service.createTransaction(companyA.id, { date: '2026-09-19', description: 'A', status: TransactionStatus.POSTED, createdBy: 'admin', lines: [{ accountId: cashA.id, entryType: 'debit', amount: 300 }, { accountId: capitalA.id, entryType: 'credit', amount: 300 }] });
  service.createTransaction(companyB.id, { date: '2026-09-20', description: 'B', status: TransactionStatus.POSTED, createdBy: 'admin', lines: [{ accountId: cashB.id, entryType: 'debit', amount: 400 }, { accountId: capitalB.id, entryType: 'credit', amount: 400 }] });

  assert.equal(service.engine.getAccountBalance(cashA.id), 300);
  assert.equal(service.engine.getAccountBalance(cashB.id), 400);
});

test('total debit always equals total credit for posted entries', () => {
  const { service, company, accounts } = buildTransactionService();
  const result = service.createTransaction(company.id, {
    type: TransactionType.CUSTOM_JOURNAL,
    date: '2026-09-21',
    description: 'Total match',
    status: TransactionStatus.POSTED,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1200 },
      { accountId: accounts.equipment.id, entryType: 'debit', amount: 800 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 2000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.totalDebit, result.totalCredit);
});
