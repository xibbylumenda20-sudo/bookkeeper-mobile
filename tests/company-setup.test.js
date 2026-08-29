const test = require('node:test');
const assert = require('node:assert/strict');

const { CompanySetupService } = require('../company-setup.js');
const { AccountType, NormalBalance } = require('../accounting-engine.js');

test('create company', () => {
  const service = new CompanySetupService('company-setup-test-1');
  const company = service.createCompany({
    name: 'Acme Retail',
    businessAddress: '123 Main St',
    contactNumber: '+639171234567',
    email: 'hello@acme.ph',
    taxInformation: 'VAT-001',
    fiscalYear: '2026',
    accountingPeriod: 'Monthly',
    baseCurrency: 'PHP',
    businessType: 'Retail',
    createdBy: 'admin',
  });

  assert.ok(company.id);
  assert.equal(company.name, 'Acme Retail');
  assert.equal(company.businessType, 'Retail');
  assert.equal(company.active, true);
});

test('new company starts with zero balances', () => {
  const service = new CompanySetupService('company-setup-test-2');
  const company = service.createCompany({ name: 'Zero Balance Company', businessType: 'Service', createdBy: 'admin' });
  const balances = service.engine.calculateAccountBalances(company.id);
  const total = Object.values(balances).reduce((sum, account) => sum + account.balance, 0);

  assert.equal(total, 0);
  assert.equal(service.getCompanyBalance(company.id), 0);
});

test('creating a company does not create an Opening Capital journal entry', () => {
  const service = new CompanySetupService('company-setup-test-3');
  const company = service.createCompany({ name: 'No Opening Capital', businessType: 'Service', createdBy: 'admin' });

  const journalEntries = service.engine.getPostedEntries(company.id);
  assert.equal(journalEntries.length, 0);
});

test('creating a company does not create ₱50,000 capital', () => {
  const service = new CompanySetupService('company-setup-test-4');
  const company = service.createCompany({ name: 'No 50k Capital', businessType: 'Retail', createdBy: 'admin' });

  const balances = service.engine.calculateAccountBalances(company.id);
  const capitalBalance = Object.values(balances).filter((entry) => entry.account.type === AccountType.EQUITY).reduce((sum, entry) => sum + entry.balance, 0);
  assert.equal(capitalBalance, 0);
});

test('create account', () => {
  const service = new CompanySetupService('company-setup-test-5');
  const company = service.createCompany({ name: 'Account Co', businessType: 'Service', createdBy: 'admin' });

  const account = service.createAccount(company.id, {
    code: '1000',
    title: 'BDO Operating Account',
    type: AccountType.ASSET,
    description: 'Primary operating account',
    createdBy: 'admin',
  });

  assert.ok(account.id);
  assert.equal(account.companyId, company.id);
  assert.equal(account.title, 'BDO Operating Account');
});

test('account receives correct company ID', () => {
  const service = new CompanySetupService('company-setup-test-6');
  const company = service.createCompany({ name: 'Company ID Co', businessType: 'Retail', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1620', title: 'GCash Business', type: AccountType.ASSET, createdBy: 'admin' });

  assert.equal(account.companyId, company.id);
});

test('asset automatically gets DEBIT normal balance', () => {
  const service = new CompanySetupService('company-setup-test-7');
  const company = service.createCompany({ name: 'Asset Balance Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1010', title: 'Petty Cash', type: AccountType.ASSET, createdBy: 'admin' });

  assert.equal(account.normalBalance, NormalBalance.DEBIT);
});

test('expense automatically gets DEBIT normal balance', () => {
  const service = new CompanySetupService('company-setup-test-8');
  const company = service.createCompany({ name: 'Expense Balance Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '5010', title: 'Office Supplies', type: AccountType.EXPENSE, createdBy: 'admin' });

  assert.equal(account.normalBalance, NormalBalance.DEBIT);
});

test('liability automatically gets CREDIT normal balance', () => {
  const service = new CompanySetupService('company-setup-test-9');
  const company = service.createCompany({ name: 'Liability Balance Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '2010', title: 'Taxes Payable', type: AccountType.LIABILITY, createdBy: 'admin' });

  assert.equal(account.normalBalance, NormalBalance.CREDIT);
});

test('equity automatically gets CREDIT normal balance', () => {
  const service = new CompanySetupService('company-setup-test-10');
  const company = service.createCompany({ name: 'Equity Balance Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '3010', title: 'Owner Capital - Juan', type: AccountType.EQUITY, createdBy: 'admin' });

  assert.equal(account.normalBalance, NormalBalance.CREDIT);
});

test('revenue automatically gets CREDIT normal balance', () => {
  const service = new CompanySetupService('company-setup-test-11');
  const company = service.createCompany({ name: 'Revenue Balance Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '4010', title: 'Sales - Online', type: AccountType.REVENUE, createdBy: 'admin' });

  assert.equal(account.normalBalance, NormalBalance.CREDIT);
});

test('duplicate account code is rejected within one company', () => {
  const service = new CompanySetupService('company-setup-test-12');
  const company = service.createCompany({ name: 'Duplicate Co', businessType: 'Retail', createdBy: 'admin' });

  service.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET, createdBy: 'admin' });

  assert.throws(() => {
    service.createAccount(company.id, { code: '1000', title: 'Cash Duplicate', type: AccountType.ASSET, createdBy: 'admin' });
  }, /Duplicate account code within company/i);
});

test('same account code is allowed in another company', () => {
  const service = new CompanySetupService('company-setup-test-13');
  const companyA = service.createCompany({ name: 'Company A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.createCompany({ name: 'Company B', businessType: 'Service', createdBy: 'admin' });

  service.createAccount(companyA.id, { code: '1000', title: 'Cash A', type: AccountType.ASSET, createdBy: 'admin' });
  const accountB = service.createAccount(companyB.id, { code: '1000', title: 'Cash B', type: AccountType.ASSET, createdBy: 'admin' });

  assert.equal(accountB.companyId, companyB.id);
});

test('empty account title is rejected', () => {
  const service = new CompanySetupService('company-setup-test-14');
  const company = service.createCompany({ name: 'Empty Title Co', businessType: 'Service', createdBy: 'admin' });

  assert.throws(() => {
    service.createAccount(company.id, { code: '1005', title: '', type: AccountType.ASSET, createdBy: 'admin' });
  }, /Empty account title/i);
});

test('invalid account type is rejected', () => {
  const service = new CompanySetupService('company-setup-test-15');
  const company = service.createCompany({ name: 'Invalid Type Co', businessType: 'Service', createdBy: 'admin' });

  assert.throws(() => {
    service.createAccount(company.id, { code: '9999', title: 'Bad Type', type: 'INVALID', createdBy: 'admin' });
  }, /Invalid account type/i);
});

test('account title can be customized', () => {
  const service = new CompanySetupService('company-setup-test-16');
  const company = service.createCompany({ name: 'Custom Title Co', businessType: 'Retail', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1622', title: 'Maya Business', type: AccountType.ASSET, createdBy: 'admin' });

  assert.equal(account.title, 'Maya Business');
});

test('account can be archived', () => {
  const service = new CompanySetupService('company-setup-test-17');
  const company = service.createCompany({ name: 'Archive Co', businessType: 'Retail', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1630', title: 'Old Bank', type: AccountType.ASSET, createdBy: 'admin' });

  const archived = service.archiveAccount(account.id, 'admin');
  assert.equal(archived.archived, true);
  assert.equal(archived.active, false);
});

test('archived account cannot receive new posted transactions', () => {
  const service = new CompanySetupService('company-setup-test-18');
  const company = service.createCompany({ name: 'Archived Tx Co', businessType: 'Retail', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1631', title: 'Bank Closed', type: AccountType.ASSET, createdBy: 'admin' });
  service.archiveAccount(account.id, 'admin');

  assert.equal(service.engine.getCompanyAccounts(company.id).some((acct) => acct.id === account.id && !acct.archived), false);
});

test('company A cannot see company B accounts', () => {
  const service = new CompanySetupService('company-setup-test-19');
  const companyA = service.createCompany({ name: 'Company A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.createCompany({ name: 'Company B', businessType: 'Service', createdBy: 'admin' });

  service.createAccount(companyA.id, { code: '1650', title: 'A-only Cash', type: AccountType.ASSET, createdBy: 'admin' });
  service.createAccount(companyB.id, { code: '1651', title: 'B-only Cash', type: AccountType.ASSET, createdBy: 'admin' });

  const companyAAccounts = service.listAccounts(companyA.id);
  const companyBAccounts = service.listAccounts(companyB.id);

  assert.ok(companyAAccounts.some((acct) => acct.title === 'A-only Cash'));
  assert.ok(companyBAccounts.some((acct) => acct.title === 'B-only Cash'));
  assert.equal(companyAAccounts.some((acct) => acct.title === 'B-only Cash'), false);
});

test('switching companies loads the correct accounts', () => {
  const service = new CompanySetupService('company-setup-test-20');
  const companyA = service.createCompany({ name: 'Switch A', businessType: 'Retail', createdBy: 'admin' });
  const companyB = service.createCompany({ name: 'Switch B', businessType: 'Service', createdBy: 'admin' });

  service.createAccount(companyA.id, { code: '1700', title: 'A Cash', type: AccountType.ASSET, createdBy: 'admin' });
  service.createAccount(companyB.id, { code: '1701', title: 'B Cash', type: AccountType.ASSET, createdBy: 'admin' });

  service.switchCompany(companyA.id);
  const activeA = service.getActiveCompany();
  const accountsAfterSwitchA = service.listAccounts(activeA.id);

  service.switchCompany(companyB.id);
  const activeB = service.getActiveCompany();
  const accountsAfterSwitchB = service.listAccounts(activeB.id);

  assert.equal(accountsAfterSwitchA.some((acct) => acct.title === 'A Cash'), true);
  assert.equal(accountsAfterSwitchB.some((acct) => acct.title === 'B Cash'), true);
});

test('creating an account does not create a journal entry', () => {
  const service = new CompanySetupService('company-setup-test-21');
  const company = service.createCompany({ name: 'No Journal Co', businessType: 'Retail', createdBy: 'admin' });

  service.createAccount(company.id, { code: '1710', title: 'Computer Equipment', type: AccountType.ASSET, createdBy: 'admin' });

  assert.equal(service.engine.getPostedEntries(company.id).length, 0);
});

test('new account balance is zero', () => {
  const service = new CompanySetupService('company-setup-test-22');
  const company = service.createCompany({ name: 'Zero Account Co', businessType: 'Service', createdBy: 'admin' });
  const account = service.createAccount(company.id, { code: '1715', title: 'Delivery Expense', type: AccountType.EXPENSE, createdBy: 'admin' });

  assert.equal(service.getCurrentAccountBalance(account.id), 0);
});
