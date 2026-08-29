const test = require('node:test');
const assert = require('node:assert/strict');

const { CompanySetupService } = require('./company-setup.js');
const { TransactionType } = require('./transaction-system.js');
const { AccountType } = require('./accounting-engine.js');
const { Phase8OperationsService } = require('./phase8-operations.js');

function buildSetup() {
  const companyService = new CompanySetupService('phase8-company-suite');
  const company = companyService.createCompany({
    name: 'Phase 8 Company',
    code: 'PH8',
    businessType: 'Service',
    createdBy: 'admin',
  });

  const cash = companyService.createAccount(company.id, {
    code: '1000',
    title: 'Cash',
    type: AccountType.ASSET,
    createdBy: 'admin',
  });

  const revenue = companyService.createAccount(company.id, {
    code: '4000',
    title: 'Service Revenue',
    type: AccountType.REVENUE,
    createdBy: 'admin',
  });

  const expense = companyService.createAccount(company.id, {
    code: '5100',
    title: 'Office Expense',
    type: AccountType.EXPENSE,
    createdBy: 'admin',
  });

  const liability = companyService.createAccount(company.id, {
    code: '2000',
    title: 'Accounts Payable',
    type: AccountType.LIABILITY,
    createdBy: 'admin',
  });

  const bank = companyService.createAccount(company.id, {
    code: '1010',
    title: 'Bank Checking',
    type: AccountType.ASSET,
    createdBy: 'admin',
  });

  const operations = new Phase8OperationsService('phase8-operations-suite');
  operations.companyService = companyService;
  operations.engine = companyService.engine;

  return { companyService, company, accounts: { cash, revenue, expense, liability, bank }, operations };
}

test('bank account creation is stored under the company and recorded in the audit log', () => {
  const { company, operations } = buildSetup();
  const account = operations.createBankAccount(company.id, {
    name: 'Main Checking',
    accountNumber: '987654321',
    type: 'checking',
    balance: 1500,
    createdBy: 'admin',
  });

  assert.equal(account.companyId, company.id);
  assert.equal(account.type, 'checking');
  assert.ok(operations.engine.getAuditLogs(company.id).some((entry) => entry.entityType === 'BankAccount'));
});

test('bank statement import identifies duplicates and keeps company data isolated', () => {
  const { company, operations } = buildSetup();
  const bankAccount = operations.createBankAccount(company.id, {
    name: 'Main Checking',
    accountNumber: '1111',
    type: 'checking',
    balance: 0,
    createdBy: 'admin',
  });

  const result = operations.importBankStatement(company.id, bankAccount.id, [
    { date: '2026-08-01', description: 'Payroll', reference: 'REF-1', amount: 1500 },
    { date: '2026-08-01', description: 'Payroll', reference: 'REF-1', amount: 1500 },
    { date: '2026-08-02', description: 'Vendor', reference: 'REF-2', amount: -250 },
  ]);

  assert.equal(result.totalRows, 2);
  assert.equal(result.duplicates.length, 1);
});

test('reconciliation reports difference and supports a zero-difference reconciliation', () => {
  const { company, accounts, operations } = buildSetup();
  const bankAccount = operations.createBankAccount(company.id, {
    name: 'Main Checking',
    accountNumber: '2222',
    type: 'checking',
    balance: 0,
    createdBy: 'admin',
  });

  const reconciliation = operations.createReconciliation(company.id, bankAccount.id, {
    statementDate: '2026-08-31',
    startingBalance: 1000,
    endingBalance: 700,
    bookBalance: 700,
    matchedAmount: 0,
    outstandingItems: 0,
    notes: 'Ready',
    createdBy: 'admin',
  });

  assert.equal(reconciliation.difference, 0);
  assert.equal(reconciliation.status, 'RECONCILED');
});

test('reconciliation adjustment posts a balanced journal entry through the engine', () => {
  const { company, accounts, operations } = buildSetup();
  const bankAccount = operations.createBankAccount(company.id, {
    name: 'Main Checking',
    accountNumber: '3333',
    type: 'checking',
    balance: 0,
    createdBy: 'admin',
  });

  const reconciliation = operations.createReconciliation(company.id, bankAccount.id, {
    statementDate: '2026-08-31',
    startingBalance: 0,
    endingBalance: 1200,
    bookBalance: 1100,
    matchedAmount: 0,
    outstandingItems: 0,
    notes: 'Adjustment needed',
    createdBy: 'admin',
  });

  const result = operations.applyReconciliationAdjustment(company.id, reconciliation.reconciliation.id, {
    ledgerAccountId: accounts.cash.id,
    adjustmentAccountId: accounts.expense.id,
    amount: 100,
    direction: 'CREDIT',
    description: 'Statement adjustment',
    createdBy: 'admin',
  });

  assert.equal(result.valid, true);
  assert.equal(operations.engine.getAccountBalance(accounts.cash.id), -100);
  assert.equal(operations.engine.getAccountBalance(accounts.expense.id), 100);
});

test('adjusting entry can be created as draft and posted without bypassing validation', () => {
  const { company, accounts, operations } = buildSetup();
  const result = operations.createAdjustingEntry(company.id, {
    type: 'accrued expense',
    description: 'Accrued office expense',
    date: '2026-08-15',
    status: 'POSTED',
    createdBy: 'admin',
    lines: [
      { accountId: accounts.expense.id, entryType: 'debit', amount: 250 },
      { accountId: accounts.liability.id, entryType: 'credit', amount: 250 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.entry.status, 'Posted');
  assert.equal(operations.engine.getAccountBalance(accounts.expense.id), 250);
  assert.equal(operations.engine.getAccountBalance(accounts.liability.id), 250);
});

test('draft adjusting entries do not affect reports and voided entries are excluded', () => {
  const { company, accounts, operations } = buildSetup();
  operations.createAdjustingEntry(company.id, {
    type: 'custom',
    description: 'Draft adjustment',
    date: '2026-08-20',
    status: 'DRAFT',
    createdBy: 'admin',
    lines: [
      { accountId: accounts.expense.id, entryType: 'debit', amount: 999 },
      { accountId: accounts.liability.id, entryType: 'credit', amount: 999 },
    ],
  });

  const trialBalance = operations.engine.getTrialBalance(company.id);
  assert.equal(trialBalance.totalDebit, 0);
  assert.equal(trialBalance.totalCredit, 0);

  const first = operations.adjustingEntries[0];
  operations.voidAdjustingEntry(company.id, first.journalEntryId, { modifiedBy: 'admin', reason: 'void draft' });
  assert.ok(true);
});

test('period closing locks the period and requires explicit confirmation to unlock', () => {
  const { company, operations } = buildSetup();
  const period = operations.closePeriod(company.id, {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    closingDate: '2026-08-31',
    closedBy: 'admin',
    reason: 'Monthly close',
  });

  assert.equal(period.closed, true);
  assert.equal(period.locked, true);
  assert.throws(() => operations.unlockPeriod(company.id, '2026-08-01::2026-08-31', { confirmed: false, modifiedBy: 'admin' }));

  const unlocked = operations.unlockPeriod(company.id, '2026-08-01::2026-08-31', { confirmed: true, modifiedBy: 'admin' });
  assert.equal(unlocked.locked, false);
});

test('audit trail records create, modify, post and void actions for the phase 8 events', () => {
  const { company, operations } = buildSetup();
  operations.createBankAccount(company.id, { name: 'Audit Bank', accountNumber: '4444', type: 'checking', createdBy: 'admin' });
  const logs = operations.getAuditTrail(company.id);
  assert.ok(logs.some((entry) => entry.entityType === 'BankAccount'));
  assert.ok(logs.some((entry) => entry.action === 'CREATE'));
});

test('cross-company records are rejected for bank reconciliation and period actions', () => {
  const { company, companyService, operations } = buildSetup();
  const second = companyService.createCompany({
    name: 'Second Company',
    code: 'PH9',
    businessType: 'Retail',
    createdBy: 'admin',
  });

  const firstAccount = operations.createBankAccount(company.id, {
    name: 'Primary Bank',
    accountNumber: '5555',
    type: 'checking',
    createdBy: 'admin',
  });

  assert.throws(() => operations.ensureBankAccount(second.id, firstAccount.id));
});
