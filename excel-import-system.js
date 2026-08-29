const XLSX = require('xlsx');
const { CompanySetupService } = require('./company-setup.js');
const { ARAPService } = require('./ar-ap-system.js');
const { TransactionService } = require('./transaction-system.js');
const {
  BookkeeperEngine,
  AccountType,
  EntryType,
  TransactionStatus,
  NormalBalance,
} = require('./accounting-engine.js');

const COLUMN_ALIASES = Object.freeze({
  date: ['Date', 'Transaction Date', 'Posting Date'],
  description: ['Description', 'Details', 'Particulars', 'Memo'],
  debit: ['Debit', 'Dr'],
  credit: ['Credit', 'Cr'],
  amount: ['Amount', 'Value', 'Total'],
  account: ['Account', 'Account Name', 'Account Title'],
  reference: ['Reference', 'Ref', 'Check Number'],
  customer: ['Customer', 'Client'],
  vendor: ['Vendor', 'Supplier'],
});

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeDate(value) {
  if (!value && value !== 0) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeHeader(value) {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function canonicalizeCell(value) {
  return normalizeString(value).toLowerCase();
}

function standardizeRow(rawRow = {}) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow)) {
    row[normalizeHeader(key)] = value;
  }
  return row;
}

class ExcelImportSystem {
  constructor(companyService = null) {
    this.companyService = companyService || new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine || new BookkeeperEngine();
    this.arapService = new ARAPService('bookkeeper_mobile_company_setup_v1');
    this.arapService.companyService = this.companyService;
    this.arapService.engine = this.engine;
    this.transactionService = new TransactionService('bookkeeper_mobile_transactions_v1');
    this.transactionService.companyService = this.companyService;
    this.transactionService.engine = this.engine;
  }

  readWorkbook(fileBuffer, filename = 'upload.csv') {
    if (!fileBuffer) {
      return { workbook: null, sheets: [], filename, fileType: 'empty' };
    }

    const bufferInput = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(String(fileBuffer));
    const extension = String(filename || '').split('.').pop().toLowerCase();

    if (extension === 'csv') {
      const workbook = XLSX.read(bufferInput.toString('utf8'), { type: 'string' });
      return { workbook, sheets: workbook.SheetNames.map((sheetName) => ({ name: sheetName })), filename, fileType: 'csv' };
    }

    const workbook = XLSX.read(bufferInput, { type: 'array' });
    return {
      workbook,
      sheets: workbook.SheetNames.map((sheetName) => ({ name: sheetName })),
      filename,
      fileType: workbook.SheetNames.length ? 'xlsx' : 'unknown',
    };
  }

  detectColumnMappings(headers = []) {
    const normalizedHeaders = headers.map((header) => normalizeHeader(header));
    const mapping = {};

    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      const matched = normalizedHeaders.find((header) => aliases.some((alias) => canonicalizeCell(header) === canonicalizeCell(alias)));
      mapping[key] = matched || null;
    }

    return mapping;
  }

  previewFile(fileBuffer, filename = 'upload.csv', options = {}) {
    const { workbook, sheets, fileType } = this.readWorkbook(fileBuffer, filename);
    const previews = sheets.map((sheet) => {
      const worksheet = workbook.Sheets[sheet.name];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false, range: options.range || 0 });
      const headers = rows[0] ? Object.keys(rows[0]) : [];
      const sampleRows = rows.slice(0, 5).map((row) => standardizeRow(row));
      return {
        sheetName: sheet.name,
        rowCount: rows.length,
        columns: headers,
        sampleRows,
        columnMapping: this.detectColumnMappings(headers),
      };
    });

    return {
      filename,
      fileType,
      sheetCount: previews.length,
      sheets: previews,
    };
  }

  validateRow(row = {}, companyId = null, mappings = {}, context = {}) {
    const normalized = standardizeRow(row);
    const errors = [];
    const dateCell = mappings.date ? normalized[mappings.date] : null;
    const descriptionCell = mappings.description ? normalized[mappings.description] : null;
    const debitCell = mappings.debit ? normalized[mappings.debit] : null;
    const creditCell = mappings.credit ? normalized[mappings.credit] : null;
    const amountCell = mappings.amount ? normalized[mappings.amount] : null;
    const accountCell = mappings.account ? normalized[mappings.account] : null;
    const customerCell = mappings.customer ? normalized[mappings.customer] : null;
    const vendorCell = mappings.vendor ? normalized[mappings.vendor] : null;
    const referenceCell = mappings.reference ? normalized[mappings.reference] : null;

    const parsedDate = normalizeDate(dateCell ?? amountCell);
    if (!dateCell || !parsedDate) {
      errors.push('Invalid date.');
    }

    if (!descriptionCell || !normalizeString(descriptionCell)) {
      errors.push('Missing description.');
    }

    const debitValue = safeNumber(debitCell);
    const creditValue = safeNumber(creditCell);
    const amountValue = safeNumber(amountCell);
    const totalAmount = debitValue || creditValue || amountValue;
    if (!totalAmount || totalAmount <= 0) {
      errors.push('Invalid amount.');
    }

    const accountName = normalizeString(accountCell || '');
    if (!accountName) {
      errors.push('Missing account.');
    }

    if (companyId) {
      const account = this.engine.getCompanyAccounts(companyId).find((entry) => {
        const value = `${entry.code} ${entry.title}`.toLowerCase();
        return value.includes(accountName.toLowerCase());
      });
      if (!account) {
        errors.push(`Account "${accountName || 'Unknown'}" was not found.`);
      }
    }

    if (customerCell && normalizeString(customerCell)) {
      const customerName = normalizeString(customerCell);
      const companyCustomer = this.arapService.getCustomerById(companyId, customerName) ||
        this.engine.customers.find((customer) => customer.companyId === companyId && customer.name.toLowerCase() === customerName.toLowerCase());
      if (!companyCustomer && companyId) {
        errors.push(`Customer "${customerName}" was not found.`);
      }
    }

    if (vendorCell && normalizeString(vendorCell)) {
      const vendorName = normalizeString(vendorCell);
      const companyVendor = this.arapService.getVendorById(companyId, vendorName) ||
        this.engine.vendors.find((vendor) => vendor.companyId === companyId && vendor.name.toLowerCase() === vendorName.toLowerCase());
      if (!companyVendor && companyId) {
        errors.push(`Vendor "${vendorName}" was not found.`);
      }
    }

    const hasDebit = debitCell !== undefined && debitCell !== null && normalizeString(debitCell) !== '';
    const hasCredit = creditCell !== undefined && creditCell !== null && normalizeString(creditCell) !== '';
    if (hasDebit && hasCredit && Math.abs(debitValue - creditValue) > 0.01) {
      errors.push('Debit/credit conflict.');
    }

    if ((hasDebit && creditValue > 0) || (hasCredit && debitValue > 0)) {
      errors.push('Debit/credit conflict.');
    }

    const duplicate = this.findPossibleDuplicate(companyId, {
      reference: normalizeString(referenceCell || ''),
      date: parsedDate,
      description: normalizeString(descriptionCell || ''),
      account: accountName,
      amount: totalAmount,
    });
    if (duplicate) {
      errors.push('Possible duplicate transaction.');
    }

    return {
      valid: errors.length === 0,
      errors,
      row: {
        date: parsedDate,
        description: normalizeString(descriptionCell || ''),
        account: accountName,
        reference: normalizeString(referenceCell || ''),
        debit: hasDebit ? debitValue : 0,
        credit: hasCredit ? creditValue : 0,
        amount: totalAmount,
        customer: normalizeString(customerCell || ''),
        vendor: normalizeString(vendorCell || ''),
      },
    };
  }

  findPossibleDuplicate(companyId, candidate = {}) {
    const { reference, date, description, amount, account } = candidate;
    if (!companyId || !date || !description || !amount) return null;
    const lowerRef = normalizeString(reference).toLowerCase();
    const lowerDescription = normalizeString(description).toLowerCase();
    const lowerAccount = normalizeString(account).toLowerCase();

    return this.engine.journalEntries.find((entry) => {
      if (entry.companyId !== companyId) return false;
      if (entry.status === TransactionStatus.VOIDED) return false;
      const matchesReference = lowerRef && normalizeString(entry.reference || '').toLowerCase() === lowerRef;
      const matchesDescription = !lowerDescription || normalizeString(entry.description || '').toLowerCase() === lowerDescription;
      const matchesDate = String(entry.date) === String(date);
      const matchesAccount = this.engine.journalLines.some((line) => {
        const accountRecord = this.engine.getAccountById(line.accountId);
        return accountRecord && accountRecord.companyId === companyId && normalizeString(accountRecord.title).toLowerCase() === lowerAccount;
      });
      const matchesAmount = entry.lines.some((line) => safeNumber(line.amount) === safeNumber(amount));
      return (matchesReference && matchesDate && matchesAmount) || (matchesDate && matchesDescription && matchesAccount && matchesAmount);
    }) || null;
  }

  validateSheetRows(companyId, rows = [], mappings = {}) {
    const results = rows.map((row, index) => ({
      rowNumber: index + 2,
      ...this.validateRow(row, companyId, mappings),
    }));
    return {
      valid: results.every((entry) => entry.valid),
      rows: results,
      invalidRows: results.filter((entry) => !entry.valid),
    };
  }

  previewAndValidate(fileBuffer, filename = 'upload.csv', companyId = null, options = {}) {
    const preview = this.previewFile(fileBuffer, filename, options);
    const firstSheet = preview.sheets[0];
    const rows = firstSheet ? firstSheet.sampleRows : [];
    const mappings = firstSheet ? firstSheet.columnMapping : {};
    return {
      preview,
      mappings,
      validation: companyId ? this.validateSheetRows(companyId, rows, mappings) : { valid: true, rows: [], invalidRows: [] },
    };
  }

  importCustomerRecords(companyId, rows = [], options = {}) {
    const imported = [];
    for (const row of rows) {
      const customerCode = normalizeString(row.customerCode || row.code || row.CustomerCode || '');
      const name = normalizeString(row.name || row.Name || row.customer || row.Customer || '');
      const email = normalizeString(row.email || row.Email || '');
      const contact = normalizeString(row.contact || row.Contact || '');
      const address = normalizeString(row.address || row.Address || '');
      const notes = normalizeString(row.notes || row.Notes || '');
      if (!customerCode || !name) continue;
      const duplicate = this.engine.customers.find((customer) => customer.companyId === companyId && customer.customerCode === customerCode);
      if (duplicate) {
        imported.push({ status: 'duplicate', customerCode, name, errors: ['Duplicate customer code within the same company.'] });
        continue;
      }
      const created = this.arapService.createCustomer(companyId, {
        customerCode,
        name,
        contact,
        email,
        address,
        notes,
      });
      imported.push({ status: 'imported', customer: created });
    }
    return imported;
  }

  importVendorRecords(companyId, rows = [], options = {}) {
    const imported = [];
    for (const row of rows) {
      const vendorCode = normalizeString(row.vendorCode || row.code || row.VendorCode || '');
      const name = normalizeString(row.name || row.Name || row.vendor || row.Vendor || '');
      const email = normalizeString(row.email || row.Email || '');
      const contact = normalizeString(row.contact || row.Contact || '');
      const address = normalizeString(row.address || row.Address || '');
      const notes = normalizeString(row.notes || row.Notes || '');
      if (!vendorCode || !name) continue;
      const duplicate = this.engine.vendors.find((vendor) => vendor.companyId === companyId && vendor.vendorCode === vendorCode);
      if (duplicate) {
        imported.push({ status: 'duplicate', vendorCode, name, errors: ['Duplicate vendor code within the same company.'] });
        continue;
      }
      const created = this.arapService.createVendor(companyId, {
        vendorCode,
        name,
        contact,
        email,
        address,
        notes,
      });
      imported.push({ status: 'imported', vendor: created });
    }
    return imported;
  }

  importChartOfAccounts(companyId, rows = [], options = {}) {
    const imported = [];
    for (const row of rows) {
      const accountCode = normalizeString(row.accountCode || row.code || row.AccountCode || '');
      const title = normalizeString(row.accountTitle || row.account || row.title || row.AccountTitle || '');
      const type = normalizeString(row.accountType || row.type || row.AccountType || AccountType.ASSET);
      const normalBalance = normalizeString(row.normalBalance || row.normal || row.NormalBalance || '');
      const description = normalizeString(row.description || row.Description || '');
      if (!accountCode || !title) continue;
      const validType = Object.values(AccountType).includes(type.toUpperCase());
      const validNormal = [NormalBalance.DEBIT, NormalBalance.CREDIT].includes(normalBalance.toUpperCase());
      if (!validType || !validNormal) {
        imported.push({ status: 'rejected', accountCode, title, errors: ['Invalid account type or normal balance.'] });
        continue;
      }
      const duplicate = this.engine.accounts.find((account) => account.companyId === companyId && account.code === accountCode);
      if (duplicate) {
        imported.push({ status: 'duplicate', accountCode, title, errors: ['Duplicate account code within the same company.'] });
        continue;
      }
      const created = this.engine.createAccount(companyId, {
        code: accountCode,
        title,
        type: type.toUpperCase(),
        normalBalance: normalBalance.toUpperCase(),
        description,
      });
      imported.push({ status: 'imported', account: created });
    }
    return imported;
  }

  createJournalImportRow(companyId, row = {}, mappings = {}) {
    const normalized = standardizeRow(row);
    const date = normalizeDate(mappings.date ? normalized[mappings.date] : normalized.Date || normalized.date || null);
    const description = normalizeString((mappings.description ? normalized[mappings.description] : normalized.Description || normalized.description || ''));
    const reference = normalizeString((mappings.reference ? normalized[mappings.reference] : normalized.Reference || normalized.reference || ''));
    const accountName = normalizeString((mappings.account ? normalized[mappings.account] : normalized.Account || normalized.account || ''));
    const account = this.engine.getCompanyAccounts(companyId).find((entry) => {
      const text = `${entry.code} ${entry.title}`.toLowerCase();
      return text.includes(accountName.toLowerCase());
    });

    const debitRaw = mappings.debit ? normalized[mappings.debit] : normalized.Debit || normalized.Dr || normalized.debit;
    const creditRaw = mappings.credit ? normalized[mappings.credit] : normalized.Credit || normalized.Cr || normalized.credit;
    const amountRaw = mappings.amount ? normalized[mappings.amount] : normalized.Amount || normalized.Total || normalized.Value || normalized.amount;

    let debit = 0;
    let credit = 0;
    const amount = safeNumber(amountRaw || (debitRaw || creditRaw));
    if (debitRaw !== undefined && debitRaw !== null && normalizeString(debitRaw) !== '') {
      debit = safeNumber(debitRaw);
    }
    if (creditRaw !== undefined && creditRaw !== null && normalizeString(creditRaw) !== '') {
      credit = safeNumber(creditRaw);
    }
    if (!debit && !credit && amount > 0) {
      debit = amount;
    }

    return {
      companyId,
      date,
      description,
      reference,
      accountName,
      accountId: account ? account.id : null,
      debit,
      credit,
      amount,
    };
  }

  importWorkbook(companyId, fileBuffer, filename, options = {}) {
    const preview = this.previewFile(fileBuffer, filename, options);
    const selectedSheets = options.sheetName ? preview.sheets.filter((sheet) => sheet.sheetName === options.sheetName) : preview.sheets;
    const importedJournalEntries = [];
    const issues = [];

    for (const sheet of selectedSheets) {
      const workbook = this.readWorkbook(fileBuffer, filename).workbook;
      const worksheet = workbook.Sheets[sheet.sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
      if (!rows.length) continue;
      const mappings = sheet.columnMapping;
      const validation = this.validateSheetRows(companyId, rows, mappings);
      if (!validation.valid) {
        issues.push({ sheetName: sheet.sheetName, errors: validation.invalidRows });
        continue;
      }

      const grouped = [];
      for (const row of rows) {
        const mapped = this.createJournalImportRow(companyId, row, mappings);
        if (!mapped.accountId) {
          issues.push({ sheetName: sheet.sheetName, row, errors: ['Invalid account.'] });
          continue;
        }
        grouped.push(mapped);
      }

      const journalLines = grouped.map((entry) => ({
        accountId: entry.accountId,
        amount: Math.max(entry.debit, entry.credit),
        entryType: entry.debit > 0 ? EntryType.DEBIT : EntryType.CREDIT,
      }));

      if (journalLines.length > 0) {
        const totalDebits = journalLines.filter((line) => line.entryType === EntryType.DEBIT).reduce((sum, line) => sum + line.amount, 0);
        const totalCredits = journalLines.filter((line) => line.entryType === EntryType.CREDIT).reduce((sum, line) => sum + line.amount, 0);
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          issues.push({ sheetName: sheet.sheetName, errors: ['Balance check failed: imported entry is not balanced.'] });
          continue;
        }

        const entry = this.engine.postJournalEntry({
          companyId,
          date: grouped[0]?.date || new Date().toISOString().slice(0, 10),
          description: grouped[0]?.description || `Imported ${sheet.sheetName}`,
          reference: grouped[0]?.reference || `${sheet.sheetName}-${Date.now()}`,
          lines: journalLines,
        });

        if (entry.valid) {
          importedJournalEntries.push(entry.entry);
        } else {
          issues.push({ sheetName: sheet.sheetName, errors: entry.errors || ['Import rejected by accounting engine.'] });
        }
      }
    }

    return {
      imported: importedJournalEntries,
      issues,
      preview,
      status: issues.length ? 'PARTIAL' : 'SUCCESS',
    };
  }
}

module.exports = {
  ExcelImportSystem,
  COLUMN_ALIASES,
};
