const test = require('node:test');
const assert = require('node:assert/strict');

const { ARAPService, InvoiceStatus, BillStatus } = require('../ar-ap-system.js');
const { AccountType } = require('../accounting-engine.js');

function buildARAP() {
  const service = new ARAPService('ar-ap-suite');
  const company = service.companyService.createCompany({
    name: 'ARAP Co',
    businessType: 'Service',
    createdBy: 'admin',
  });

  const cash = service.companyService.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET, createdBy: 'admin' });
  const ar = service.companyService.createAccount(company.id, { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET, createdBy: 'admin' });
  const revenue = service.companyService.createAccount(company.id, { code: '4000', title: 'Service Revenue', type: AccountType.REVENUE, createdBy: 'admin' });
  const expense = service.companyService.createAccount(company.id, { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE, createdBy: 'admin' });
  const ap = service.companyService.createAccount(company.id, { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY, createdBy: 'admin' });

  const customer = service.createCustomer(company.id, {
    customerCode: 'C-100',
    name: 'Alpha Customer',
    contact: 'Jane',
    email: 'jane@example.com',
    address: '123 Main St',
    notes: 'Preferred client',
    createdBy: 'admin',
  });

  const vendor = service.createVendor(company.id, {
    vendorCode: 'V-200',
    name: 'Beta Vendor',
    contact: 'John',
    email: 'john@example.com',
    address: '45 Market St',
    notes: 'Supplies',
    createdBy: 'admin',
  });

  return { service, company, customer, vendor, accounts: { cash, ar, revenue, expense, ap } };
}

test('customer and vendor creation are company-scoped', () => {
  const { service, company, customer, vendor } = buildARAP();

  assert.equal(customer.companyId, company.id);
  assert.equal(vendor.companyId, company.id);
  assert.equal(service.listCustomers(company.id).length, 1);
  assert.equal(service.listVendors(company.id).length, 1);
});

test('valid invoice posts to AR and revenue', () => {
  const { service, company, customer, accounts } = buildARAP();

  const invoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-1001',
    invoiceDate: '2026-08-15',
    dueDate: '2026-08-30',
    status: InvoiceStatus.SENT,
    createdBy: 'admin',
    items: [
      { description: 'Website design', quantity: 1, unitPrice: 1500, revenueAccount: accounts.revenue.id, amount: 1500 },
    ],
    tax: 0,
    notes: 'Monthly design retainer',
  });

  assert.equal(invoice.valid, true);
  assert.equal(invoice.invoice.status, InvoiceStatus.SENT);
  assert.equal(service.engine.getAccountBalance(accounts.ar.id), 1500);
  assert.equal(service.engine.getAccountBalance(accounts.revenue.id), 1500);
});

test('customer payment reduces AR and updates invoice status', () => {
  const { service, company, customer, accounts } = buildARAP();

  const invoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-1002',
    invoiceDate: '2026-08-10',
    dueDate: '2026-08-25',
    status: InvoiceStatus.SENT,
    createdBy: 'admin',
    items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, revenueAccount: accounts.revenue.id, amount: 1000 }],
    tax: 0,
  });

  const payment = service.createCustomerPayment(company.id, {
    customerId: customer.customerId,
    invoiceId: invoice.invoice.id,
    paymentDate: '2026-08-12',
    reference: 'PMT-001',
    amount: 400,
    depositAccount: accounts.cash.id,
    status: 'POSTED',
    createdBy: 'admin',
  });

  assert.equal(payment.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), 400);
  assert.equal(service.engine.getAccountBalance(accounts.ar.id), 600);
  assert.equal(service.getInvoiceById(invoice.invoice.id).status, InvoiceStatus.PARTIALLY_PAID);
});

test('customer payment cannot exceed invoice balance', () => {
  const { service, company, customer, accounts } = buildARAP();

  const invoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-1003',
    invoiceDate: '2026-08-11',
    dueDate: '2026-08-26',
    status: InvoiceStatus.SENT,
    createdBy: 'admin',
    items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, revenueAccount: accounts.revenue.id, amount: 1000 }],
    tax: 0,
  });

  const result = service.createCustomerPayment(company.id, {
    customerId: customer.customerId,
    invoiceId: invoice.invoice.id,
    paymentDate: '2026-08-13',
    reference: 'PMT-OVER',
    amount: 1500,
    depositAccount: accounts.cash.id,
    status: 'POSTED',
    createdBy: 'admin',
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => String(error).toLowerCase().includes('exceed')));
});

test('vendor bill posts to AP and expense and vendor payment reduces AP', () => {
  const { service, company, vendor, accounts } = buildARAP();

  const bill = service.createBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'BILL-2001',
    billDate: '2026-08-14',
    dueDate: '2026-08-29',
    status: BillStatus.SENT,
    createdBy: 'admin',
    items: [{ description: 'Office rent', quantity: 1, unitPrice: 900, expenseAccount: accounts.expense.id, amount: 900 }],
    tax: 0,
  });

  const payment = service.createVendorPayment(company.id, {
    vendorId: vendor.vendorId,
    billId: bill.bill.id,
    paymentDate: '2026-08-20',
    reference: 'VPMT-001',
    amount: 400,
    cashAccount: accounts.cash.id,
    status: 'POSTED',
    createdBy: 'admin',
  });

  assert.equal(bill.valid, true);
  assert.equal(payment.valid, true);
  assert.equal(service.engine.getAccountBalance(accounts.ap.id), 500);
  assert.equal(service.engine.getAccountBalance(accounts.cash.id), -400);
});

test('duplicate invoice and bill numbers are rejected within the same company', () => {
  const { service, company, customer, vendor, accounts } = buildARAP();

  const firstInvoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-DUP-1',
    createdBy: 'admin',
    items: [{ description: 'Duplicate', quantity: 1, unitPrice: 100, revenueAccount: accounts.revenue.id, amount: 100 }],
    tax: 0,
  });

  assert.equal(firstInvoice.valid, true);

  const duplicateInvoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-DUP-1',
    createdBy: 'admin',
    items: [{ description: 'Duplicate', quantity: 1, unitPrice: 100, revenueAccount: accounts.revenue.id, amount: 100 }],
    tax: 0,
  });

  assert.equal(duplicateInvoice.valid, false);
  assert.ok(duplicateInvoice.errors.some((error) => String(error).toLowerCase().includes('duplicate')));

  const firstBill = service.createBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'BILL-DUP-1',
    createdBy: 'admin',
    items: [{ description: 'Duplicate bill', quantity: 1, unitPrice: 200, expenseAccount: accounts.expense.id, amount: 200 }],
    tax: 0,
  });

  assert.equal(firstBill.valid, true);

  const duplicateBill = service.createBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'BILL-DUP-1',
    createdBy: 'admin',
    items: [{ description: 'Duplicate bill', quantity: 1, unitPrice: 200, expenseAccount: accounts.expense.id, amount: 200 }],
    tax: 0,
  });

  assert.equal(duplicateBill.valid, false);
  assert.ok(duplicateBill.errors.some((error) => String(error).toLowerCase().includes('duplicate')));
});

test('bill payment status and aging buckets use due-date-driven rules', () => {
  const { service, company, customer, vendor, accounts } = buildARAP();

  const bill = service.createBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'BILL-AGING-1',
    billDate: '2026-07-10',
    dueDate: '2026-07-25',
    createdBy: 'admin',
    items: [{ description: 'Past due rent', quantity: 1, unitPrice: 300, expenseAccount: accounts.expense.id, amount: 300 }],
    tax: 0,
  });

  assert.equal(bill.valid, true);
  assert.equal(bill.bill.status, BillStatus.OVERDUE || 'OVERDUE');

  const aging = service.getAPAging(company.id);
  assert.ok(aging.buckets && aging.buckets['31-60 days'] !== undefined);
  const invoice = service.createInvoice(company.id, {
    customerId: customer.customerId,
    invoiceNumber: 'INV-AGING-1',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-20',
    createdBy: 'admin',
    items: [{ description: 'Service', quantity: 1, unitPrice: 250, revenueAccount: accounts.revenue.id, amount: 250 }],
    tax: 0,
  });

  assert.equal(invoice.valid, true);
  const arAging = service.getARAging(company.id);
  assert.ok(arAging.buckets && arAging.buckets.current !== undefined);
});

test('vendor payments accept paymentAccount alias and preserve AP reconciliation', () => {
  const { service, company, vendor, accounts } = buildARAP();

  const bill = service.createBill(company.id, {
    vendorId: vendor.vendorId,
    billNumber: 'BILL-PAY-ALIAS',
    createdBy: 'admin',
    items: [{ description: 'Alias vendor payment', quantity: 1, unitPrice: 250, expenseAccount: accounts.expense.id, amount: 250 }],
    tax: 0,
  });

  const payment = service.createVendorPayment(company.id, {
    vendorId: vendor.vendorId,
    billId: bill.bill.id,
    paymentDate: '2026-08-18',
    reference: 'ALIAS-001',
    amount: 100,
    paymentAccount: accounts.cash.id,
    createdBy: 'admin',
  });

  assert.equal(payment.valid, true);
  assert.equal(service.getBillBalance(company.id, bill.bill.id), 150);
});
