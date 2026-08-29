(function () {
const {
  AccountType,
  BookkeeperEngine,
  Company,
  Account,
  NormalBalance,
} = typeof module !== 'undefined' && module.exports ? require('./accounting-engine.js') : window;

const STORAGE_VERSION = 1;

const BUSINESS_TYPES = Object.freeze([
  'Retail',
  'Service',
  'Freelance',
  'Restaurant',
  'Construction',
  'Online Seller',
  'Professional Services',
  'Other',
]);

const DEFAULT_ACCOUNT_TEMPLATES = Object.freeze({
  Retail: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Inventory', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Utilities Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Supplies Expense', type: AccountType.EXPENSE },
  ],
  Service: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Prepaid Expenses', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Service Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Utilities Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Salaries Expense', type: AccountType.EXPENSE },
  ],
  Freelance: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Office Supplies Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Utilities Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Transportation Expense', type: AccountType.EXPENSE },
  ],
  Restaurant: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Inventory', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Food Cost Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Rent Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Utilities Expense', type: AccountType.EXPENSE },
  ],
  Construction: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Equipment', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Contract Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Materials Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Labor Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Equipment Expense', type: AccountType.EXPENSE },
  ],
  'Online Seller': [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Inventory', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Sales - Online', type: AccountType.REVENUE },
    { code: '5100', title: 'Advertising Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Shipping Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Bank Charges', type: AccountType.EXPENSE },
  ],
  'Professional Services': [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1200', title: 'Prepaid Expenses', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Professional Fees', type: AccountType.REVENUE },
    { code: '5100', title: 'Rent Expense', type: AccountType.EXPENSE },
    { code: '5200', title: 'Utilities Expense', type: AccountType.EXPENSE },
    { code: '5300', title: 'Office Supplies Expense', type: AccountType.EXPENSE },
  ],
  Other: [
    { code: '1000', title: 'Cash', type: AccountType.ASSET },
    { code: '1100', title: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '2000', title: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', title: "Owner's Capital", type: AccountType.EQUITY },
    { code: '4000', title: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '5100', title: 'Other Expenses', type: AccountType.EXPENSE },
  ],
});

function getStorageAdapter() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }

  const memoryStorage = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
    },
    setItem(key, value) {
      memoryStorage[key] = String(value);
    },
    removeItem(key) {
      delete memoryStorage[key];
    },
  };
}

function normalizeCompanyType(value) {
  const text = String(value || '').trim();
  if (!text) return 'Other';
  return BUSINESS_TYPES.includes(text) ? text : 'Other';
}

function companyTemplateByName(name) {
  const key = String(name || '').trim();
  if (!key) return [];
  return DEFAULT_ACCOUNT_TEMPLATES[key] || [];
}

function determineNormalBalance(type) {
  switch (type) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return NormalBalance.DEBIT;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.REVENUE:
      return NormalBalance.CREDIT;
    default:
      return NormalBalance.DEBIT;
  }
}

class CompanySetupService {
  constructor(storageKey = 'bookkeeper_mobile_company_setup_v1') {
    this.storageKey = storageKey;
    this.storage = getStorageAdapter();
    this.engine = new BookkeeperEngine();
    this.activeCompanyId = null;
    this.load();
  }

  load() {
    const rawValue = this.storage.getItem(this.storageKey);
    if (!rawValue) {
      this.save();
      return;
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        this.save();
        return;
      }

      const restored = new BookkeeperEngine();
      restored.companies = (parsed?.engineData?.companies || []).map((company) => new Company(company));
      restored.accounts = (parsed?.engineData?.accounts || []).map((account) => new Account(account));
      restored.journalEntries = parsed?.engineData?.journalEntries || [];
      restored.journalLines = parsed?.engineData?.journalLines || [];
      restored.transactions = parsed?.engineData?.transactions || [];
      restored.customers = parsed?.engineData?.customers || [];
      restored.vendors = parsed?.engineData?.vendors || [];
      restored.invoices = parsed?.engineData?.invoices || [];
      restored.invoicePayments = parsed?.engineData?.invoicePayments || [];
      restored.bills = parsed?.engineData?.bills || [];
      restored.billPayments = parsed?.engineData?.billPayments || [];
      restored.bankAccounts = parsed?.engineData?.bankAccounts || [];
      restored.reconciliations = parsed?.engineData?.reconciliations || [];
      restored.auditLogs = parsed?.engineData?.auditLogs || [];
      this.engine = restored;
      this.activeCompanyId = parsed.activeCompanyId || (restored.companies[0] ? restored.companies[0].id : null);
    } catch (error) {
      this.engine = new BookkeeperEngine();
      this.activeCompanyId = null;
      this.save();
    }
  }

  save() {
    const snapshot = {
      version: STORAGE_VERSION,
      activeCompanyId: this.activeCompanyId,
      engineData: {
        companies: this.engine.companies,
        accounts: this.engine.accounts,
        journalEntries: this.engine.journalEntries,
        journalLines: this.engine.journalLines,
        transactions: this.engine.transactions,
        customers: this.engine.customers,
        vendors: this.engine.vendors,
        invoices: this.engine.invoices,
        invoicePayments: this.engine.invoicePayments,
        bills: this.engine.bills,
        billPayments: this.engine.billPayments,
        bankAccounts: this.engine.bankAccounts,
        reconciliations: this.engine.reconciliations,
        auditLogs: this.engine.auditLogs,
      },
    };

    this.storage.setItem(this.storageKey, JSON.stringify(snapshot));
  }

  listCompanies(searchText = '') {
    const query = String(searchText || '').trim().toLowerCase();
    return this.engine.companies.filter((company) => {
      if (query.length === 0) return true;
      const haystack = `${company.name} ${company.code} ${company.email} ${company.businessType || ''} ${company.companyId || ''}`.toLowerCase();
      return haystack.includes(query);
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  getCompanyById(companyId) {
    return this.engine.getCompanyById(companyId);
  }

  getActiveCompany() {
    return this.activeCompanyId ? this.getCompanyById(this.activeCompanyId) : null;
  }

  switchCompany(companyId) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }

    this.activeCompanyId = companyId;
    this.save();
    return company;
  }

  createCompany(data = {}) {
    const sanitized = {
      id: data.id || undefined,
      name: String(data.name || '').trim(),
      code: String(data.code || '').trim() || 'company',
      businessAddress: String(data.businessAddress || '').trim(),
      contactNumber: String(data.contactNumber || '').trim(),
      email: String(data.email || '').trim(),
      taxInformation: String(data.taxInformation || '').trim(),
      fiscalYear: String(data.fiscalYear || '').trim(),
      accountingPeriod: String(data.accountingPeriod || '').trim(),
      baseCurrency: String(data.baseCurrency || 'PHP').trim().toUpperCase(),
      businessType: normalizeCompanyType(data.businessType || 'Other'),
      customBusinessType: String(data.customBusinessType || '').trim(),
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
      description: String(data.description || '').trim(),
      active: data.active !== false,
      isArchived: !!data.isArchived,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
    };

    if (!sanitized.name) {
      throw new Error('Company name is required');
    }

    const created = this.engine.createCompany({
      ...sanitized,
      companyId: sanitized.id || undefined,
      name: sanitized.name,
      code: sanitized.code,
      description: sanitized.description,
      active: sanitized.active,
      isArchived: sanitized.isArchived,
      createdAt: sanitized.createdAt,
      updatedAt: sanitized.updatedAt,
      createdBy: sanitized.createdBy,
      modifiedBy: sanitized.modifiedBy,
    });

    created.businessAddress = sanitized.businessAddress;
    created.contactNumber = sanitized.contactNumber;
    created.email = sanitized.email;
    created.taxInformation = sanitized.taxInformation;
    created.fiscalYear = sanitized.fiscalYear;
    created.accountingPeriod = sanitized.accountingPeriod;
    created.baseCurrency = sanitized.baseCurrency;
    created.businessType = sanitized.businessType;
    created.customBusinessType = sanitized.customBusinessType;
    created.createdAt = sanitized.createdAt;
    created.updatedAt = sanitized.updatedAt;
    created.createdBy = sanitized.createdBy;
    created.modifiedBy = sanitized.modifiedBy;
    created.companyId = sanitized.id || created.id;

    this.activeCompanyId = created.id;
    this.save();
    return created;
  }

  updateCompany(companyId, patch = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }

    const updated = {
      ...company,
      name: patch.name !== undefined ? String(patch.name).trim() : company.name,
      businessAddress: patch.businessAddress !== undefined ? String(patch.businessAddress).trim() : company.businessAddress || '',
      contactNumber: patch.contactNumber !== undefined ? String(patch.contactNumber).trim() : company.contactNumber || '',
      email: patch.email !== undefined ? String(patch.email).trim() : company.email || '',
      taxInformation: patch.taxInformation !== undefined ? String(patch.taxInformation).trim() : company.taxInformation || '',
      fiscalYear: patch.fiscalYear !== undefined ? String(patch.fiscalYear).trim() : company.fiscalYear || '',
      accountingPeriod: patch.accountingPeriod !== undefined ? String(patch.accountingPeriod).trim() : company.accountingPeriod || '',
      baseCurrency: patch.baseCurrency !== undefined ? String(patch.baseCurrency).trim().toUpperCase() : company.baseCurrency || 'PHP',
      businessType: patch.businessType !== undefined ? normalizeCompanyType(patch.businessType) : company.businessType || 'Other',
      customBusinessType: patch.customBusinessType !== undefined ? String(patch.customBusinessType).trim() : company.customBusinessType || '',
      description: patch.description !== undefined ? String(patch.description).trim() : company.description || '',
      active: patch.active !== undefined ? !!patch.active : company.active,
      isArchived: patch.isArchived !== undefined ? !!patch.isArchived : company.isArchived,
      modifiedBy: patch.modifiedBy || 'system',
      updatedAt: new Date().toISOString(),
    };

    Object.assign(company, updated);
    this.save();
    return company;
  }

  archiveCompany(companyId, modifiedBy = 'system') {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }

    company.isArchived = true;
    company.active = false;
    company.modifiedBy = modifiedBy;
    company.updatedAt = new Date().toISOString();
    this.save();
    return company;
  }

  listAccounts(companyId, searchText = '', typeFilter = 'ALL', sortBy = 'title') {
    const company = this.getCompanyById(companyId);
    if (!company) return [];

    const query = String(searchText || '').trim().toLowerCase();
    const results = this.engine.getCompanyAccounts(companyId).filter((account) => {
      const matchesType = typeFilter === 'ALL' || account.type === typeFilter;
      const matchesText = query.length === 0 || `${account.code} ${account.title} ${account.description}`.toLowerCase().includes(query);
      return matchesType && matchesText;
    });

    results.sort((left, right) => {
      if (sortBy === 'code') return left.code.localeCompare(right.code);
      if (sortBy === 'type') return left.type.localeCompare(right.type) || left.title.localeCompare(right.title);
      return left.title.localeCompare(right.title) || left.code.localeCompare(right.code);
    });

    return results;
  }

  createAccount(companyId, data = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company is missing');
    }
    if (company.isArchived) {
      throw new Error('Company is archived');
    }

    const title = String(data.title || '').trim();
    if (!title) {
      throw new Error('Empty account title');
    }

    const accountType = String(data.type || '').trim();
    if (!Object.values(AccountType).includes(accountType)) {
      throw new Error('Invalid account type');
    }

    const code = String(data.code || '').trim();
    if (!code) {
      throw new Error('Account code is required');
    }

    const existingCode = this.engine.getCompanyAccounts(companyId).some((account) => !account.archived && account.code.toLowerCase() === code.toLowerCase());
    if (existingCode) {
      throw new Error('Duplicate account code within company');
    }

    const normalBalance = determineNormalBalance(accountType);
    const created = this.engine.createAccount(companyId, {
      ...data,
      title,
      code,
      type: accountType,
      normalBalance,
      description: String(data.description || '').trim(),
      active: data.active !== false,
      archived: !!data.archived,
      createdBy: data.createdBy || 'system',
      modifiedBy: data.modifiedBy || data.createdBy || 'system',
    });

    this.save();
    return created;
  }

  updateAccount(accountId, patch = {}) {
    const account = this.engine.getAccountById(accountId);
    if (!account) {
      throw new Error('Account is missing');
    }

    const nextTitle = patch.title !== undefined ? String(patch.title).trim() : account.title;
    if (!nextTitle) {
      throw new Error('Empty account title');
    }

    const nextType = patch.type !== undefined ? String(patch.type).trim() : account.type;
    if (!Object.values(AccountType).includes(nextType)) {
      throw new Error('Invalid account type');
    }

    const nextCode = patch.code !== undefined ? String(patch.code).trim() : account.code;
    if (!nextCode) {
      throw new Error('Account code is required');
    }

    const duplicate = this.engine.getCompanyAccounts(account.companyId).some((candidate) => {
      if (candidate.id === accountId) return false;
      return !candidate.archived && candidate.code.toLowerCase() === nextCode.toLowerCase();
    });
    if (duplicate) {
      throw new Error('Duplicate account code within company');
    }

    account.title = nextTitle;
    account.type = nextType;
    account.normalBalance = determineNormalBalance(nextType);
    account.code = nextCode;
    account.description = patch.description !== undefined ? String(patch.description).trim() : account.description;
    account.active = patch.active !== undefined ? !!patch.active : account.active;
    account.archived = patch.archived !== undefined ? !!patch.archived : account.archived;
    account.modifiedBy = patch.modifiedBy || 'system';
    account.updatedAt = new Date().toISOString();

    this.save();
    return account;
  }

  archiveAccount(accountId, modifiedBy = 'system') {
    const account = this.engine.getAccountById(accountId);
    if (!account) {
      throw new Error('Account is missing');
    }

    account.archived = true;
    account.active = false;
    account.modifiedBy = modifiedBy;
    account.updatedAt = new Date().toISOString();
    this.save();
    return account;
  }

  getAccountById(accountId) {
    return this.engine.getAccountById(accountId);
  }

  getCurrentAccountBalance(accountId) {
    return this.engine.getAccountBalance(accountId);
  }

  getCompanyBalance(companyId) {
    const company = this.getCompanyById(companyId);
    if (!company) return 0;

    return this.engine.getCompanyAccounts(companyId).reduce((sum, account) => sum + this.engine.getAccountBalance(account.id), 0);
  }

  getCompanyIsolationSummary() {
    return this.engine.companies.map((company) => ({
      id: company.id,
      name: company.name,
      accountCount: this.engine.getCompanyAccounts(company.id).length,
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUSINESS_TYPES,
    DEFAULT_ACCOUNT_TEMPLATES,
    CompanySetupService,
    STORAGE_VERSION,
    normalizeCompanyType,
    determineNormalBalance,
    companyTemplateByName,
  };
}

if (typeof window !== 'undefined') {
  window.CompanySetupService = CompanySetupService;
  window.BUSINESS_TYPES = BUSINESS_TYPES;
  window.DEFAULT_ACCOUNT_TEMPLATES = DEFAULT_ACCOUNT_TEMPLATES;
}
})();
