const test = require('node:test');
const assert = require('node:assert/strict');

const { BookkeeperApplicationService, TransactionType } = require('./application-service.js');
const { AccountType } = require('./accounting-engine.js');

function buildApp() {
  const app = new BookkeeperApplicationService('phase7-app-suite');
  const company = app.initializeCompany({
    name: 'Phase 7 Company',
    code: 'PH7',
    businessType: 'Service',
    createdBy: 'admin',
  });

  const cash = app.companyService.createAccount(company.id, {
    code: '1000',
    title: 'Cash',
    type: AccountType.ASSET,
    createdBy: 'admin',
  });

  const revenue = app.companyService.createAccount(company.id, {
    code: '4000',
    title: 'Service Revenue',
    type: AccountType.REVENUE,
    createdBy: 'admin',
  });

  const expense = app.companyService.createAccount(company.id, {
    code: '5100',
    title: 'Rent Expense',
    type: AccountType.EXPENSE,
    createdBy: 'admin',
  });

  const ap = app.companyService.createAccount(company.id, {
    code: '2000',
    title: 'Accounts Payable',
    type: AccountType.LIABILITY,
    createdBy: 'admin',
  });

  const ar = app.companyService.createAccount(company.id, {
    code: '1100',
    title: 'Accounts Receivable',
    type: AccountType.ASSET,
    createdBy: 'admin',
  });

  const capital = app.companyService.createAccount(company.id, {
    code: '3000',
    title: "Owner's Capital",
    type: AccountType.EQUITY,
    createdBy: 'admin',
  });

  return { app, company, accounts: { cash, revenue, expense, ap, ar, capital } };
}

test('application service initializes companies and keeps them isolated', () => {
  const { app, company } = buildApp();
  const nextCompany = app.initializeCompany({ name: 'Second Company', code: 'PH8', businessType: 'Retail', createdBy: 'admin' });

  assert.equal(app.companyService.getCompanyById(company.id)?.name, 'Phase 7 Company');
  assert.equal(app.companyService.getCompanyById(nextCompany.id)?.name, 'Second Company');
  assert.notEqual(company.id, nextCompany.id);
});

test('application service creates balanced journal entries using the accounting engine', () => {
  const { app, company, accounts } = buildApp();

  const result = app.createJournalEntry(company.id, {
    date: '2026-08-01',
    description: 'Owner investment',
    reference: 'PH7-INV-1',
    type: TransactionType.OWNER_INVESTMENT,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 25000 },
      { accountId: accounts.capital.id, entryType: 'credit', amount: 25000 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.cash.id), 25000);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.capital.id), 25000);
});

test('application service creates an invoice from the AR/AP layer without bypassing accounting validation', () => {
  const { app, company, accounts } = buildApp();
  const customer = app.arapService.createCustomer(company.id, {
    customerCode: 'C-1',
    name: 'Customer One',
    contact: 'Jane',
    email: 'jane@example.com',
    createdBy: 'admin',
  });

  const invoice = app.createCustomerInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'PH7-INV-100',
    invoiceDate: '2026-08-02',
    dueDate: '2026-08-22',
    items: [{ description: 'Consulting', quantity: 1, unitPrice: 800, revenueAccount: accounts.revenue.id, amount: 800 }],
    createdBy: 'admin',
  });

  assert.equal(invoice.valid, true);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.ar.id), 800);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.revenue.id), 800);
});

test('application service creates a vendor bill and validates the resulting AP entry', () => {
  const { app, company, accounts } = buildApp();
  const vendor = app.arapService.createVendor(company.id, {
    vendorCode: 'V-1',
    name: 'Vendor One',
    contact: 'John',
    email: 'john@example.com',
    createdBy: 'admin',
  });

  const bill = app.createVendorBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'PH7-BILL-100',
    billDate: '2026-08-03',
    dueDate: '2026-08-18',
    items: [{ description: 'Office rent', quantity: 1, unitPrice: 700, expenseAccount: accounts.expense.id, amount: 700 }],
    createdBy: 'admin',
  });

  assert.equal(bill.valid, true);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.ap.id), 700);
  assert.equal(app.companyService.engine.getAccountBalance(accounts.expense.id), 700);
});

test('application service dashboard summary reflects the posted accounting data', () => {
  const { app, company, accounts } = buildApp();
  app.createJournalEntry(company.id, {
    date: '2026-08-04',
    description: 'Cash sale',
    reference: 'PH7-REV-1',
    type: TransactionType.INCOME,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 1200 },
      { accountId: accounts.revenue.id, entryType: 'credit', amount: 1200 },
    ],
  });

  const summary = app.getDashboardSummary(company.id, { startDate: '2026-08-01', endDate: '2026-08-30' });
  assert.equal(summary.status, 'GREEN');
  assert.equal(summary.reports.incomeStatement.netIncome, 1200);
  assert.equal(summary.balances.cash, 1200);
});

test('application service export reads the stored report data and preserves readonly reporting contracts', () => {
  const { app, company, accounts } = buildApp();
  app.createJournalEntry(company.id, {
    date: '2026-08-05',
    description: 'Cash sale',
    reference: 'PH7-REV-2',
    type: TransactionType.INCOME,
    createdBy: 'admin',
    lines: [
      { accountId: accounts.cash.id, entryType: 'debit', amount: 300 },
      { accountId: accounts.revenue.id, entryType: 'credit', amount: 300 },
    ],
  });

  const payload = app.exportCompanyReport(company.id, 'transactions', { startDate: '2026-08-01', endDate: '2026-08-30' });
  assert.ok(payload.rows.length >= 1);
  assert.equal(payload.companyId, company.id);
});
