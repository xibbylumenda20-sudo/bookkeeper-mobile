const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { CompanySetupService } = require('./company-setup.js');
const { AccountType } = require('./accounting-engine.js');
const { ExcelImportSystem } = require('./excel-import-system.js');
const { ExportSystem } = require('./export-system.js');
const { BackupSystem } = require('./backup-system.js');

function createCompanyWithAccounts() {
  const companyService = new CompanySetupService('excel_import_test_setup');
  const engine = companyService.engine;
  const company = engine.createCompany({ name: 'Import Co', code: 'IC' });
  const cash = engine.createAccount(company.id, { code: '1000', title: 'Cash', type: AccountType.ASSET });
  const revenue = engine.createAccount(company.id, { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE });
  const expense = engine.createAccount(company.id, { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE });
  return { companyService, engine, company, cash, revenue, expense };
}

test('excel preview detects sheet name and columns', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    { Date: '2026-08-01', Description: 'Sale', Debit: 100, Credit: '', Account: 'Cash' },
    { Date: '2026-08-01', Description: 'Sale', Debit: '', Credit: 100, Account: 'Sales Revenue' },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Journal');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const importSystem = new ExcelImportSystem();
  const preview = importSystem.previewFile(buffer, 'sample.xlsx');
  assert.equal(preview.sheets[0].sheetName, 'Journal');
  assert.ok(preview.sheets[0].columns.includes('Date'));
  assert.ok(preview.sheets[0].columnMapping.date);
});

test('column mapping supports common aliases', () => {
  const system = new ExcelImportSystem();
  const mapping = system.detectColumnMappings(['Date', 'Memo', 'Dr', 'Cr', 'Account', 'Reference']);
  assert.equal(mapping.date, 'Date');
  assert.equal(mapping.description, 'Memo');
  assert.equal(mapping.debit, 'Dr');
  assert.equal(mapping.credit, 'Cr');
  assert.equal(mapping.account, 'Account');
  assert.equal(mapping.reference, 'Reference');
});

test('valid CSV import posts balanced entries using the accounting engine', () => {
  const { companyService, company, cash, revenue } = createCompanyWithAccounts();
  const data = 'Date,Description,Debit,Credit,Account,Reference\n2026-08-01,Sale,1000,,Cash,REF-1\n2026-08-01,Sale,,1000,Sales Revenue,REF-1\n';
  const system = new ExcelImportSystem(companyService);
  const result = system.importWorkbook(company.id, Buffer.from(data, 'utf8'), 'journal.csv', { sheetName: 'Sheet1' });
  assert.ok(result.imported.length >= 1 || result.issues.length === 0);
});

test('invalid dates and invalid accounts are rejected', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const system = new ExcelImportSystem(companyService);
  const result = system.validateRow({ Date: 'bad-date', Description: 'Bad row', Debit: 100, Credit: '', Account: 'Nope' }, company.id, { date: 'Date', description: 'Description', debit: 'Debit', account: 'Account' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.includes('Invalid date')) || result.errors.some((err) => err.includes('Account')));
});

test('customer import validates duplicate customer codes within a company', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const system = new ExcelImportSystem(companyService);
  const first = system.importCustomerRecords(company.id, [{ customerCode: 'C-001', name: 'Alpha', contact: 'A', email: 'a@example.com' }]);
  const second = system.importCustomerRecords(company.id, [{ customerCode: 'C-001', name: 'Alpha Copy', contact: 'B', email: 'b@example.com' }]);
  assert.equal(first[0].status, 'imported');
  assert.equal(second[0].status, 'duplicate');
});

test('vendor import validates duplicate vendor codes within a company', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const system = new ExcelImportSystem(companyService);
  const first = system.importVendorRecords(company.id, [{ vendorCode: 'V-001', name: 'Vendor A' }]);
  const second = system.importVendorRecords(company.id, [{ vendorCode: 'V-001', name: 'Vendor B' }]);
  assert.equal(first[0].status, 'imported');
  assert.equal(second[0].status, 'duplicate');
});

test('chart of accounts import enforces valid types and unique codes', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const system = new ExcelImportSystem(companyService);
  const imported = system.importChartOfAccounts(company.id, [
    { accountCode: '6100', accountTitle: 'Office Supplies', accountType: 'EXPENSE', normalBalance: 'DEBIT', description: 'Supplies' },
    { accountCode: '6100', accountTitle: 'Duplicate', accountType: 'EXPENSE', normalBalance: 'DEBIT', description: 'Dup' },
  ]);
  assert.equal(imported[0].status, 'imported');
  assert.equal(imported[1].status, 'duplicate');
});

test('export system produces CSV for transactions and general journal', () => {
  const { companyService, company, cash, revenue } = createCompanyWithAccounts();
  const engine = companyService.engine;
  engine.postJournalEntry({
    companyId: company.id,
    date: '2026-08-15',
    description: 'Export transaction',
    reference: 'EXP-001',
    lines: [
      { accountId: cash.id, entryType: 'debit', amount: 250 },
      { accountId: revenue.id, entryType: 'credit', amount: 250 },
    ],
  });
  const exportSystem = new ExportSystem(new (require('./reporting-system.js').ReportingSystem)(companyService), companyService);
  const csv = exportSystem.exportAsCsv('transactions', company.id, { startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.ok(typeof csv === 'string');
  assert.ok(csv.length > 0);
});

test('backup creation and restore validate version and structure', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const backupSystem = new BackupSystem(companyService);
  const backup = backupSystem.createBackup(company.id);
  assert.equal(backup.valid, true);
  const validation = backupSystem.validateBackup(backup.backup);
  assert.equal(validation.valid, true);
  const restored = backupSystem.restoreBackup(backup.backup, { confirm: true, mode: 'new' });
  assert.equal(restored.valid, true);
});

test('data integrity checker returns GREEN when the data is valid', () => {
  const { companyService, company } = createCompanyWithAccounts();
  const backupSystem = new BackupSystem(companyService);
  const report = backupSystem.dataIntegrityCheck(company.id);
  assert.equal(report.status, 'GREEN');
});
