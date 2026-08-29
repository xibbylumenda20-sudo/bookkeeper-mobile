const { CompanySetupService } = require('./company-setup.js');
const {
  AccountType,
  EntryType,
  TransactionStatus,
} = require('./accounting-engine.js');

const InvoiceStatus = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
});

const BillStatus = Object.freeze({
  DRAFT: 'DRAFT',
  RECEIVED: 'RECEIVED',
  SENT: 'RECEIVED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
});

const PaymentStatus = Object.freeze({
  POSTED: 'POSTED',
  VOIDED: 'VOIDED',
});

function generateId(prefix) {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timePart}-${randomPart}`;
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeInvoiceStatus(value) {
  const text = String(value || '').trim().toUpperCase();
  if (Object.values(InvoiceStatus).includes(text)) return text;
  return InvoiceStatus.SENT;
}

function normalizeBillStatus(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'SENT') return BillStatus.RECEIVED;
  if (Object.values(BillStatus).includes(text)) return text;
  return BillStatus.RECEIVED;
}

function normalizePaymentStatus(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'VOIDED') return PaymentStatus.VOIDED;
  return PaymentStatus.POSTED;
}

function toTitleCase(value) {
  return String(value || '').trim();
}

function invoiceStatusFromBalance({ invoiceTotal, paidTotal, dueDate }) {
  const remaining = Math.max(invoiceTotal - paidTotal, 0);
  if (remaining <= 0) return InvoiceStatus.PAID;
  if (paidTotal > 0 && remaining < invoiceTotal) return InvoiceStatus.PARTIALLY_PAID;
  if (dueDate && new Date(String(dueDate)) < new Date() && remaining > 0) return InvoiceStatus.OVERDUE;
  return InvoiceStatus.SENT;
}

function billStatusFromBalance({ billTotal, paidTotal, dueDate }) {
  const remaining = Math.max(billTotal - paidTotal, 0);
  if (remaining <= 0) return BillStatus.PAID;
  if (paidTotal > 0 && remaining < billTotal) return BillStatus.PARTIALLY_PAID;
  if (dueDate && new Date(String(dueDate)) < new Date() && remaining > 0) return BillStatus.OVERDUE;
  return BillStatus.RECEIVED;
}

function getAgingBucket(days) {
  if (days <= 0) return 'Current';
  if (days <= 30) return '1-30 days';
  if (days <= 60) return '31-60 days';
  if (days <= 90) return '61-90 days';
  return '91+ days';
}

class CustomerRecord {
  constructor(data = {}) {
    this.customerId = data.customerId || data.id || generateId('cust');
    this.id = this.customerId;
    this.companyId = data.companyId || null;
    this.customerCode = data.customerCode || this.customerId;
    this.name = toTitleCase(data.name) || 'Unnamed Customer';
    this.contact = toTitleCase(data.contact) || '';
    this.email = String(data.email || '').trim();
    this.address = String(data.address || '').trim();
    this.notes = String(data.notes || '').trim();
    this.active = data.active !== false;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class VendorRecord {
  constructor(data = {}) {
    this.vendorId = data.vendorId || data.id || generateId('vend');
    this.id = this.vendorId;
    this.companyId = data.companyId || null;
    this.vendorCode = data.vendorCode || this.vendorId;
    this.name = toTitleCase(data.name) || 'Unnamed Vendor';
    this.contact = toTitleCase(data.contact) || '';
    this.email = String(data.email || '').trim();
    this.address = String(data.address || '').trim();
    this.notes = String(data.notes || '').trim();
    this.active = data.active !== false;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class InvoiceItem {
  constructor(data = {}) {
    this.description = String(data.description || '').trim();
    this.quantity = toSafeNumber(data.quantity);
    this.unitPrice = toSafeNumber(data.unitPrice ?? data.unitCost ?? data.price ?? 0);
    this.revenueAccount = data.revenueAccount || data.accountId || data.account || null;
    this.amount = toSafeNumber(data.amount || (this.quantity * this.unitPrice));
  }
}

class InvoiceRecord {
  constructor(data = {}) {
    this.invoiceId = data.invoiceId || data.id || generateId('inv');
    this.id = this.invoiceId;
    this.companyId = data.companyId || null;
    this.customerId = data.customerId || null;
    this.invoiceNumber = String(data.invoiceNumber || '').trim() || `INV-${Date.now()}`;
    this.invoiceDate = normalizeDate(data.invoiceDate) || new Date().toISOString().slice(0, 10);
    this.dueDate = normalizeDate(data.dueDate) || this.invoiceDate;
    this.items = (data.items || []).map((item) => new InvoiceItem(item));
    this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    this.tax = toSafeNumber(data.tax);
    this.total = this.subtotal + this.tax;
    this.status = normalizeInvoiceStatus(data.status || InvoiceStatus.SENT);
    this.notes = String(data.notes || '').trim();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class CustomerPaymentRecord {
  constructor(data = {}) {
    this.paymentId = data.paymentId || data.id || generateId('pay');
    this.id = this.paymentId;
    this.companyId = data.companyId || null;
    this.customerId = data.customerId || null;
    this.invoiceId = data.invoiceId || null;
    this.paymentDate = normalizeDate(data.paymentDate) || new Date().toISOString().slice(0, 10);
    this.reference = String(data.reference || '').trim();
    this.amount = toSafeNumber(data.amount);
    this.paymentAccount = data.paymentAccount || data.depositAccount || null;
    this.depositAccount = this.paymentAccount;
    this.notes = String(data.notes || '').trim();
    this.status = normalizePaymentStatus(data.status || PaymentStatus.POSTED);
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class BillItem {
  constructor(data = {}) {
    this.description = String(data.description || '').trim();
    this.quantity = toSafeNumber(data.quantity);
    this.unitPrice = toSafeNumber(data.unitPrice ?? data.unitCost ?? data.price ?? 0);
    this.expenseAccount = data.expenseAccount || data.assetAccount || data.accountId || data.account || null;
    this.amount = toSafeNumber(data.amount || (this.quantity * this.unitPrice));
  }
}

class BillRecord {
  constructor(data = {}) {
    this.billId = data.billId || data.id || generateId('bill');
    this.id = this.billId;
    this.companyId = data.companyId || null;
    this.vendorId = data.vendorId || null;
    this.billNumber = String(data.billNumber || '').trim() || `BILL-${Date.now()}`;
    this.billDate = normalizeDate(data.billDate) || new Date().toISOString().slice(0, 10);
    this.dueDate = normalizeDate(data.dueDate) || this.billDate;
    this.items = (data.items || []).map((item) => new BillItem(item));
    this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    this.tax = toSafeNumber(data.tax);
    this.total = this.subtotal + this.tax;
    this.status = normalizeBillStatus(data.status || BillStatus.SENT);
    this.notes = String(data.notes || '').trim();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class VendorPaymentRecord {
  constructor(data = {}) {
    this.paymentId = data.paymentId || data.id || generateId('vpay');
    this.id = this.paymentId;
    this.companyId = data.companyId || null;
    this.vendorId = data.vendorId || null;
    this.billId = data.billId || null;
    this.paymentDate = normalizeDate(data.paymentDate) || new Date().toISOString().slice(0, 10);
    this.reference = String(data.reference || '').trim();
    this.amount = toSafeNumber(data.amount);
    this.paymentAccount = data.paymentAccount || data.cashAccount || null;
    this.cashAccount = this.paymentAccount;
    this.notes = String(data.notes || '').trim();
    this.status = normalizePaymentStatus(data.status || PaymentStatus.POSTED);
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.createdBy = data.createdBy || 'system';
    this.modifiedBy = data.modifiedBy || this.createdBy;
  }
}

class ARAPService {
  constructor(storageKey = 'bookkeeper_mobile_ar_ap_v1') {
    this.storageKey = storageKey;
    this.companyService = new CompanySetupService('bookkeeper_mobile_company_setup_v1');
    this.engine = this.companyService.engine;
  }

  getCompanyById(companyId) {
    return this.companyService.getCompanyById(companyId);
  }

  getAccountById(accountId) {
    return this.engine.getAccountById(accountId);
  }

  getCompanyAccounts(companyId) {
    return this.engine.getCompanyAccounts(companyId);
  }

  getCustomerById(companyId, customerId) {
    if (arguments.length === 1) {
      return this.engine.customers.find((customer) => customer.id === companyId || customer.customerId === companyId) || null;
    }

    const record = this.engine.customers.find((customer) => customer.id === customerId || customer.customerId === customerId);
    if (!record) return null;
    return record.companyId === companyId ? record : null;
  }

  getVendorById(companyId, vendorId) {
    if (arguments.length === 1) {
      return this.engine.vendors.find((vendor) => vendor.id === companyId || vendor.vendorId === companyId) || null;
    }

    const record = this.engine.vendors.find((vendor) => vendor.id === vendorId || vendor.vendorId === vendorId);
    if (!record) return null;
    return record.companyId === companyId ? record : null;
  }

  getInvoiceById(companyId, invoiceId) {
    if (arguments.length === 1) {
      return this.engine.invoices.find((invoice) => invoice.id === companyId || invoice.invoiceId === companyId) || null;
    }

    const record = this.engine.invoices.find((invoice) => invoice.id === invoiceId || invoice.invoiceId === invoiceId);
    if (!record) return null;
    return record.companyId === companyId ? record : null;
  }

  getBillById(companyId, billId) {
    if (arguments.length === 1) {
      return this.engine.bills.find((bill) => bill.id === companyId || bill.billId === companyId) || null;
    }

    const record = this.engine.bills.find((bill) => bill.id === billId || bill.billId === billId);
    if (!record) return null;
    return record.companyId === companyId ? record : null;
  }

  listCustomers(companyId, filters = {}) {
    const search = String(filters.search || '').trim().toLowerCase();
    return this.engine.customers
      .filter((customer) => customer.companyId === companyId)
      .filter((customer) => {
        if (filters.activeOnly === true && customer.active === false) return false;
        if (filters.includeInactive === false && customer.active === false) return false;
        if (!search) return true;
        const target = `${customer.customerCode} ${customer.name} ${customer.contact} ${customer.email}`.toLowerCase();
        return target.includes(search);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  listVendors(companyId, filters = {}) {
    const search = String(filters.search || '').trim().toLowerCase();
    return this.engine.vendors
      .filter((vendor) => vendor.companyId === companyId)
      .filter((vendor) => {
        if (filters.activeOnly === true && vendor.active === false) return false;
        if (filters.includeInactive === false && vendor.active === false) return false;
        if (!search) return true;
        const target = `${vendor.vendorCode} ${vendor.name} ${vendor.contact} ${vendor.email}`.toLowerCase();
        return target.includes(search);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  listInvoices(companyId, filters = {}) {
    const customerId = filters.customerId || null;
    const status = filters.status || null;
    return this.engine.invoices
      .filter((invoice) => invoice.companyId === companyId)
      .filter((invoice) => (!customerId || invoice.customerId === customerId))
      .filter((invoice) => (!status || invoice.status === status))
      .sort((left, right) => new Date(right.invoiceDate) - new Date(left.invoiceDate));
  }

  listBills(companyId, filters = {}) {
    const vendorId = filters.vendorId || null;
    const status = filters.status || null;
    return this.engine.bills
      .filter((bill) => bill.companyId === companyId)
      .filter((bill) => (!vendorId || bill.vendorId === vendorId))
      .filter((bill) => (!status || bill.status === status))
      .sort((left, right) => new Date(right.billDate) - new Date(left.billDate));
  }

  createCustomer(companyId, payload = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      return { valid: false, errors: ['Company is missing'] };
    }

    const customer = new CustomerRecord({
      ...payload,
      companyId,
      customerCode: payload.customerCode || `C-${this.listCustomers(companyId).length + 1}`,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    this.engine.customers.push(customer);
    this.engine.recordAudit({
      companyId,
      entityType: 'Customer',
      entityId: customer.id,
      action: 'CREATE',
      message: `Customer created: ${customer.name}`,
      createdBy: customer.createdBy,
    });
    this.companyService.save();
    return customer;
  }

  editCustomer(companyId, customerId, payload = {}) {
    const customer = this.getCustomerById(companyId, customerId);
    if (!customer) {
      return { valid: false, errors: ['Customer not found'] };
    }

    const merged = new CustomerRecord({
      ...customer,
      ...payload,
      customerId: customer.customerId,
      companyId,
      updatedAt: new Date().toISOString(),
      createdAt: customer.createdAt,
      createdBy: customer.createdBy,
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    const index = this.engine.customers.findIndex((item) => item.id === customer.id || item.customerId === customerId);
    this.engine.customers[index] = merged;
    this.companyService.save();
    return { valid: true, customer: merged };
  }

  archiveCustomer(companyId, customerId, modifiedBy = 'system') {
    const customer = this.getCustomerById(companyId, customerId);
    if (!customer) {
      return { valid: false, errors: ['Customer not found'] };
    }

    const updated = { ...customer, active: false, updatedAt: new Date().toISOString(), modifiedBy };
    const index = this.engine.customers.findIndex((item) => item.id === customer.id || item.customerId === customerId);
    this.engine.customers[index] = updated;
    this.companyService.save();
    return { valid: true, customer: updated };
  }

  createVendor(companyId, payload = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      return { valid: false, errors: ['Company is missing'] };
    }

    const vendor = new VendorRecord({
      ...payload,
      companyId,
      vendorCode: payload.vendorCode || `V-${this.listVendors(companyId).length + 1}`,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    this.engine.vendors.push(vendor);
    this.engine.recordAudit({
      companyId,
      entityType: 'Vendor',
      entityId: vendor.id,
      action: 'CREATE',
      message: `Vendor created: ${vendor.name}`,
      createdBy: vendor.createdBy,
    });
    this.companyService.save();
    return vendor;
  }

  editVendor(companyId, vendorId, payload = {}) {
    const vendor = this.getVendorById(companyId, vendorId);
    if (!vendor) {
      return { valid: false, errors: ['Vendor not found'] };
    }

    const merged = new VendorRecord({
      ...vendor,
      ...payload,
      vendorId: vendor.vendorId,
      companyId,
      updatedAt: new Date().toISOString(),
      createdAt: vendor.createdAt,
      createdBy: vendor.createdBy,
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    const index = this.engine.vendors.findIndex((item) => item.id === vendor.id || item.vendorId === vendorId);
    this.engine.vendors[index] = merged;
    this.companyService.save();
    return { valid: true, vendor: merged };
  }

  archiveVendor(companyId, vendorId, modifiedBy = 'system') {
    const vendor = this.getVendorById(companyId, vendorId);
    if (!vendor) {
      return { valid: false, errors: ['Vendor not found'] };
    }

    const updated = { ...vendor, active: false, updatedAt: new Date().toISOString(), modifiedBy };
    const index = this.engine.vendors.findIndex((item) => item.id === vendor.id || item.vendorId === vendorId);
    this.engine.vendors[index] = updated;
    this.companyService.save();
    return { valid: true, vendor: updated };
  }

  findARAccount(companyId) {
    return this.getCompanyAccounts(companyId)
      .find((account) => account.type === AccountType.ASSET && (account.code === '1100' || /receivable/i.test(account.title))) || null;
  }

  findAPAccount(companyId) {
    return this.getCompanyAccounts(companyId)
      .find((account) => account.type === AccountType.LIABILITY && (account.code === '2000' || /payable/i.test(account.title))) || null;
  }

  normalizeInvoiceItems(items = []) {
    return (items || []).map((item) => {
      const normalized = new InvoiceItem(item);
      if (!normalized.description) {
        throw new Error('Invoice item description is required');
      }
      if (normalized.quantity <= 0 || normalized.unitPrice <= 0 || normalized.amount <= 0) {
        throw new Error('Invoice item amount must be positive');
      }
      return normalized;
    });
  }

  normalizeBillItems(items = []) {
    return (items || []).map((item) => {
      const normalized = new BillItem(item);
      if (!normalized.description) {
        throw new Error('Bill item description is required');
      }
      if (normalized.quantity <= 0 || normalized.unitPrice <= 0 || normalized.amount <= 0) {
        throw new Error('Bill item amount must be positive');
      }
      return normalized;
    });
  }

  validateInvoice(companyId, payload = {}) {
    const errors = [];
    const company = this.getCompanyById(companyId);
    if (!company) errors.push('Company is missing');

    const customerId = payload.customerId || null;
    if (!customerId) {
      errors.push('Customer is required');
    } else {
      const customer = this.getCustomerById(companyId, customerId);
      if (!customer) errors.push('Customer is invalid or belongs to another company');
    }

    const invoiceNumber = String(payload.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      errors.push('Invoice number is required');
    } else if (this.engine.invoices.some((entry) => entry.companyId === companyId && entry.invoiceNumber === invoiceNumber && (!payload.id || entry.id !== payload.id))) {
      errors.push('Duplicate invoice number within the same company');
    }

    const arAccount = this.findARAccount(companyId);
    if (!arAccount) errors.push('Accounts Receivable account is missing');

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      errors.push('At least one invoice item is required');
    }

    let subtotal = 0;
    for (const item of items) {
      const description = String(item && item.description || '').trim();
      if (!description) errors.push('Invoice item description is required');
      const quantity = toSafeNumber(item && item.quantity);
      const unitPrice = toSafeNumber(item && item.unitPrice);
      const amount = toSafeNumber(item && item.amount || (quantity * unitPrice));
      if (quantity <= 0 || unitPrice <= 0 || amount <= 0) errors.push('Invoice item amount must be positive');
      const revenueAccount = item && item.revenueAccount ? this.getAccountById(item.revenueAccount) : null;
      if (!revenueAccount || (company && revenueAccount.companyId !== companyId)) {
        errors.push('Invoice revenue account is invalid');
      }
      subtotal += amount;
    }

    const tax = toSafeNumber(payload.tax);
    const total = subtotal + tax;
    if (total <= 0) errors.push('Invoice total must be greater than zero');

    const status = normalizeInvoiceStatus(payload.status || InvoiceStatus.SENT);
    if (status === InvoiceStatus.CANCELLED) {
      return { valid: true, errors: [], status, subtotal, tax, total, items: this.normalizeInvoiceItems(items), arAccount, customerId };
    }

    if (status === InvoiceStatus.DRAFT) {
      return { valid: true, errors: [], status, subtotal, tax, total, items: this.normalizeInvoiceItems(items), arAccount, customerId };
    }

    return {
      valid: errors.length === 0,
      errors,
      status,
      subtotal,
      tax,
      total,
      items: this.normalizeInvoiceItems(items),
      arAccount,
      customerId,
    };
  }

  createInvoice(companyId, payload = {}) {
    const prepared = {
      ...payload,
      invoiceNumber: payload.invoiceNumber || `INV-${Date.now()}`,
    };

    const validation = this.validateInvoice(companyId, prepared);
    if (!validation.valid) {
      return { valid: false, errors: validation.errors };
    }

    const status = validation.status;
    if (status === InvoiceStatus.CANCELLED || status === InvoiceStatus.DRAFT) {
      const invoice = new InvoiceRecord({
        ...payload,
        companyId,
        customerId: validation.customerId,
        invoiceNumber: payload.invoiceNumber || `INV-${Date.now()}`,
        status,
        items: validation.items,
        subtotal: validation.subtotal,
        tax: validation.tax,
        total: validation.total,
        createdBy: payload.createdBy || 'system',
        modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
      });
      this.engine.invoices.push(invoice);
      this.engine.recordAudit({
        companyId,
        entityType: 'Invoice',
        entityId: invoice.id,
        action: 'SAVE',
        message: `Invoice saved: ${invoice.invoiceNumber}`,
        createdBy: invoice.createdBy,
      });
      this.companyService.save();
      return { valid: true, invoice };
    }

    const invoice = new InvoiceRecord({
      ...prepared,
      companyId,
      customerId: validation.customerId,
      invoiceNumber: prepared.invoiceNumber,
      status: InvoiceStatus.SENT,
      items: validation.items,
      subtotal: validation.subtotal,
      tax: validation.tax,
      total: validation.total,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    this.engine.invoices.push(invoice);
    const posting = this.postInvoice(companyId, invoice);
    if (!posting.valid) {
      return { valid: false, errors: posting.errors };
    }

    return { valid: true, invoice: posting.invoice, journalEntry: posting.journalEntry };
  }

  postInvoice(companyId, invoiceOrPayload) {
    const invoice = invoiceOrPayload && (invoiceOrPayload.invoiceId || invoiceOrPayload.id)
      ? this.getInvoiceById(companyId, invoiceOrPayload.invoiceId || invoiceOrPayload.id) || invoiceOrPayload
      : invoiceOrPayload;

    if (!invoice) {
      return { valid: false, errors: ['Invoice not found'] };
    }

    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.CANCELLED) {
      return { valid: false, errors: ['Draft or cancelled invoices cannot be posted'] };
    }

    const validation = this.validateInvoice(companyId, {
      id: invoice.id || invoice.invoiceId,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      items: invoice.items,
      tax: invoice.tax,
      status: invoice.status,
    });

    if (!validation.valid) {
      return { valid: false, errors: validation.errors };
    }

    const arAccount = validation.arAccount;
    const lines = [
      { accountId: arAccount.id, amount: validation.total, entryType: EntryType.DEBIT, description: `Invoice ${invoice.invoiceNumber}` },
      ...invoice.items.map((item) => ({
        accountId: item.revenueAccount,
        amount: item.amount,
        entryType: EntryType.CREDIT,
        description: item.description,
      })),
    ];

    const journalResult = this.engine.postJournalEntry({
      companyId,
      date: invoice.invoiceDate,
      description: `Invoice ${invoice.invoiceNumber}`,
      reference: invoice.invoiceNumber,
      status: TransactionStatus.POSTED,
      createdBy: invoice.createdBy || 'system',
      modifiedBy: invoice.modifiedBy || invoice.createdBy || 'system',
      lines,
    });

    if (!journalResult.valid) {
      return { valid: false, errors: journalResult.errors };
    }

    const savedInvoice = this.engine.invoices.find((entry) => entry.id === invoice.id || entry.invoiceId === invoice.invoiceId) || invoice;
    savedInvoice.status = InvoiceStatus.SENT;
    savedInvoice.updatedAt = new Date().toISOString();
    this.companyService.save();

    return {
      valid: true,
      invoice: savedInvoice,
      journalEntry: journalResult.entry,
    };
  }

  getInvoiceBalance(companyId, invoiceId) {
    const invoice = this.getInvoiceById(companyId, invoiceId);
    if (!invoice) return 0;
    const paid = this.engine.invoicePayments
      .filter((payment) => payment.companyId === companyId && payment.invoiceId === invoiceId)
      .reduce((sum, payment) => sum + toSafeNumber(payment.amount), 0);
    return Math.max(invoice.total - paid, 0);
  }

  getCustomerOutstandingBalance(companyId, customerId) {
    const customer = this.getCustomerById(companyId, customerId);
    if (!customer) return 0;
    return this.listInvoices(companyId, { customerId: customer.customerId })
      .reduce((sum, invoice) => sum + this.getInvoiceBalance(companyId, invoice.id || invoice.invoiceId), 0);
  }

  getCustomerBalance(companyId, customerId) {
    return this.getCustomerOutstandingBalance(companyId, customerId);
  }

  getTotalAR(companyId) {
    const arAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.ASSET && (/receivable/i.test(account.title) || account.code === '1100'));
    return arAccounts.reduce((sum, account) => sum + this.engine.getAccountBalance(account.id), 0);
  }

  getCurrentAR(companyId) {
    return this.listCustomers(companyId).reduce((sum, customer) => sum + this.getCustomerOutstandingBalance(companyId, customer.customerId), 0);
  }

  getOverdueAR(companyId) {
    return this.listInvoices(companyId).reduce((sum, invoice) => {
      const outstanding = this.getInvoiceBalance(companyId, invoice.id || invoice.invoiceId);
      const dueDate = new Date(String(invoice.dueDate));
      const isPastDue = outstanding > 0 && dueDate < new Date() && invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.CANCELLED;
      return sum + (isPastDue ? outstanding : 0);
    }, 0);
  }

  getARAging(companyId) {
    const buckets = { Current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '91+ days': 0 };
    let total = 0;

    for (const invoice of this.engine.invoices.filter((entry) => entry.companyId === companyId)) {
      const outstanding = this.getInvoiceBalance(companyId, invoice.id || invoice.invoiceId);
      if (outstanding <= 0) continue;
      const dueDate = invoice.dueDate ? new Date(String(invoice.dueDate)) : null;
      const ageDays = dueDate && !Number.isNaN(dueDate.getTime()) ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000)) : 0;
      const bucket = getAgingBucket(ageDays);
      buckets[bucket] += outstanding;
      total += outstanding;
    }

    const result = { companyId, buckets, total, asOf: new Date().toISOString().slice(0, 10) };
    result.buckets.current = result.buckets.Current;
    return result;
  }

  getCustomerLedger(companyId, customerId, filters = {}) {
    const customer = this.getCustomerById(companyId, customerId);
    if (!customer) return [];

    const invoiceFilter = filters.invoiceId || null;
    const fromDate = filters.fromDate || null;
    const toDate = filters.toDate || null;

    const rows = [];
    for (const invoice of this.listInvoices(companyId, { customerId: customer.customerId })) {
      if (invoiceFilter && invoice.id !== invoiceFilter && invoice.invoiceId !== invoiceFilter) continue;
      if (fromDate && invoice.invoiceDate < fromDate) continue;
      if (toDate && invoice.invoiceDate > toDate) continue;
      const invoiceId = invoice.id || invoice.invoiceId;
      rows.push({
        companyId,
        customerId: customer.customerId,
        date: invoice.invoiceDate,
        reference: invoice.invoiceNumber,
        invoice: invoice.invoiceNumber,
        payment: '',
        debit: invoice.total,
        credit: 0,
        runningBalance: 0,
        kind: 'invoice',
        invoiceId,
      });
    }

    for (const payment of this.engine.invoicePayments.filter((entry) => entry.companyId === companyId && entry.customerId === customer.customerId)) {
      if (invoiceFilter && payment.invoiceId !== invoiceFilter) continue;
      if (fromDate && payment.paymentDate < fromDate) continue;
      if (toDate && payment.paymentDate > toDate) continue;
      const invoiceNumber = this.getInvoiceById(companyId, payment.invoiceId)?.invoiceNumber || payment.invoiceId || '';
      rows.push({
        companyId,
        customerId: customer.customerId,
        date: payment.paymentDate,
        reference: payment.reference,
        invoice: invoiceNumber,
        payment: payment.reference,
        debit: 0,
        credit: payment.amount,
        runningBalance: 0,
        kind: 'payment',
        paymentId: payment.id || payment.paymentId,
        invoiceId: payment.invoiceId,
      });
    }

    rows.sort((left, right) => new Date(left.date) - new Date(right.date));
    let runningBalance = 0;
    for (const row of rows) {
      runningBalance += row.debit;
      runningBalance -= row.credit;
      row.runningBalance = runningBalance;
    }
    return rows;
  }

  createCustomerPayment(companyId, payload = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) return { valid: false, errors: ['Company is missing'] };

    const customer = this.getCustomerById(companyId, payload.customerId);
    if (!customer) return { valid: false, errors: ['Customer is invalid or belongs to another company'] };

    const invoice = this.getInvoiceById(companyId, payload.invoiceId);
    if (!invoice) return { valid: false, errors: ['Invoice not found'] };

    const depositAccount = payload.depositAccount ? this.getAccountById(payload.depositAccount) : null;
    if (!depositAccount || depositAccount.companyId !== companyId) {
      return { valid: false, errors: ['Deposit account is invalid'] };
    }

    const amount = toSafeNumber(payload.amount);
    if (amount <= 0) return { valid: false, errors: ['Payment amount must be greater than zero'] };

    const outstanding = this.getInvoiceBalance(companyId, invoice.id || invoice.invoiceId);
    if (amount > outstanding) {
      return { valid: false, errors: ['Payment exceeds outstanding invoice balance'] };
    }

    const payment = new CustomerPaymentRecord({
      ...payload,
      companyId,
      customerId: customer.customerId,
      invoiceId: invoice.id || invoice.invoiceId,
      status: payload.status || PaymentStatus.POSTED,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    const paymentRecord = payment;
    this.engine.invoicePayments.push(paymentRecord);

    const journalResult = this.engine.postJournalEntry({
      companyId,
      date: payment.paymentDate,
      description: `Customer payment ${payment.reference || payment.paymentId}`,
      reference: payment.reference || payment.paymentId,
      status: TransactionStatus.POSTED,
      createdBy: payment.createdBy,
      modifiedBy: payment.modifiedBy,
      lines: [
        { accountId: payment.depositAccount, amount: payment.amount, entryType: EntryType.DEBIT, description: `Customer payment ${payment.reference}` },
        { accountId: this.findARAccount(companyId).id, amount: payment.amount, entryType: EntryType.CREDIT, description: `AR settlement for ${invoice.invoiceNumber}` },
      ],
    });

    if (!journalResult.valid) {
      return { valid: false, errors: journalResult.errors };
    }

    const paidTotal = this.engine.invoicePayments
      .filter((entry) => entry.companyId === companyId && entry.invoiceId === (invoice.id || invoice.invoiceId))
      .reduce((sum, entry) => sum + toSafeNumber(entry.amount), 0);

    const nextStatus = paidTotal >= invoice.total ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
    invoice.status = nextStatus;
    invoice.updatedAt = new Date().toISOString();

    this.companyService.save();
    return { valid: true, payment: paymentRecord, invoice, journalEntry: journalResult.entry };
  }

  validateBill(companyId, payload = {}) {
    const errors = [];
    const company = this.getCompanyById(companyId);
    if (!company) errors.push('Company is missing');

    const vendorId = payload.vendorId || null;
    if (!vendorId) {
      errors.push('Vendor is required');
    } else {
      const vendor = this.getVendorById(companyId, vendorId);
      if (!vendor) errors.push('Vendor is invalid or belongs to another company');
    }

    const billNumber = String(payload.billNumber || '').trim();
    if (!billNumber) {
      errors.push('Bill number is required');
    } else if (this.engine.bills.some((entry) => entry.companyId === companyId && entry.billNumber === billNumber && (!payload.id || entry.id !== payload.id))) {
      errors.push('Duplicate bill number within the same company');
    }

    const apAccount = this.findAPAccount(companyId);
    if (!apAccount) errors.push('Accounts Payable account is missing');

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      errors.push('At least one bill item is required');
    }

    let subtotal = 0;
    for (const item of items) {
      const description = String(item && item.description || '').trim();
      if (!description) errors.push('Bill item description is required');
      const quantity = toSafeNumber(item && item.quantity);
      const unitPrice = toSafeNumber(item && item.unitPrice);
      const amount = toSafeNumber(item && item.amount || (quantity * unitPrice));
      if (quantity <= 0 || unitPrice <= 0 || amount <= 0) errors.push('Bill item amount must be positive');
      const expenseAccount = item && item.expenseAccount ? this.getAccountById(item.expenseAccount) : null;
      if (!expenseAccount || (company && expenseAccount.companyId !== companyId)) {
        errors.push('Bill expense account is invalid');
      }
      subtotal += amount;
    }

    const tax = toSafeNumber(payload.tax);
    const total = subtotal + tax;
    if (total <= 0) errors.push('Bill total must be greater than zero');

    const status = normalizeBillStatus(payload.status || BillStatus.SENT);
    if (status === BillStatus.CANCELLED || status === BillStatus.DRAFT) {
      return { valid: true, errors: [], status, subtotal, tax, total, items: this.normalizeBillItems(items), apAccount, vendorId };
    }

    return {
      valid: errors.length === 0,
      errors,
      status,
      subtotal,
      tax,
      total,
      items: this.normalizeBillItems(items),
      apAccount,
      vendorId,
    };
  }

  createBill(companyId, payload = {}) {
    const prepared = {
      ...payload,
      billNumber: payload.billNumber || `BILL-${Date.now()}`,
    };

    const validation = this.validateBill(companyId, prepared);
    if (!validation.valid) {
      return { valid: false, errors: validation.errors };
    }

    const status = validation.status;
    if (status === BillStatus.CANCELLED || status === BillStatus.DRAFT) {
      const bill = new BillRecord({
        ...prepared,
        companyId,
        vendorId: validation.vendorId,
        billNumber: prepared.billNumber,
        status,
        items: validation.items,
        subtotal: validation.subtotal,
        tax: validation.tax,
        total: validation.total,
        createdBy: payload.createdBy || 'system',
        modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
      });
      this.engine.bills.push(bill);
      this.companyService.save();
      return { valid: true, bill };
    }

    const bill = new BillRecord({
      ...prepared,
      companyId,
      vendorId: validation.vendorId,
      billNumber: prepared.billNumber,
      status: BillStatus.SENT,
      items: validation.items,
      subtotal: validation.subtotal,
      tax: validation.tax,
      total: validation.total,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    this.engine.bills.push(bill);
    const posting = this.postBill(companyId, bill);
    if (!posting.valid) {
      return { valid: false, errors: posting.errors };
    }

    return { valid: true, bill: posting.bill, journalEntry: posting.journalEntry };
  }

  postBill(companyId, billOrPayload) {
    const bill = billOrPayload && (billOrPayload.billId || billOrPayload.id)
      ? this.getBillById(companyId, billOrPayload.billId || billOrPayload.id) || billOrPayload
      : billOrPayload;

    if (!bill) {
      return { valid: false, errors: ['Bill not found'] };
    }

    if (bill.status === BillStatus.DRAFT || bill.status === BillStatus.CANCELLED) {
      return { valid: false, errors: ['Draft or cancelled bills cannot be posted'] };
    }

    const validation = this.validateBill(companyId, {
      id: bill.id || bill.billId,
      vendorId: bill.vendorId,
      billNumber: bill.billNumber,
      items: bill.items,
      tax: bill.tax,
      status: bill.status,
    });

    if (!validation.valid) {
      return { valid: false, errors: validation.errors };
    }

    const apAccount = validation.apAccount;
    const debitLines = bill.items.map((item) => ({
      accountId: item.expenseAccount,
      amount: item.amount,
      entryType: EntryType.DEBIT,
      description: item.description,
    }));

    const journalResult = this.engine.postJournalEntry({
      companyId,
      date: bill.billDate,
      description: `Bill ${bill.billNumber}`,
      reference: bill.billNumber,
      status: TransactionStatus.POSTED,
      createdBy: bill.createdBy || 'system',
      modifiedBy: bill.modifiedBy || bill.createdBy || 'system',
      lines: [
        ...debitLines,
        { accountId: apAccount.id, amount: validation.total, entryType: EntryType.CREDIT, description: `AP for ${bill.billNumber}` },
      ],
    });

    if (!journalResult.valid) {
      return { valid: false, errors: journalResult.errors };
    }

    const savedBill = this.engine.bills.find((entry) => entry.id === bill.id || entry.billId === bill.billId) || bill;
    const paidTotal = this.engine.billPayments
      .filter((entry) => entry.companyId === companyId && entry.billId === (savedBill.id || savedBill.billId))
      .reduce((sum, entry) => sum + toSafeNumber(entry.amount), 0);
    const remaining = Math.max(savedBill.total - paidTotal, 0);
    savedBill.status = remaining <= 0 ? BillStatus.PAID : paidTotal > 0 ? BillStatus.PARTIALLY_PAID : (savedBill.dueDate && new Date(String(savedBill.dueDate)) < new Date() ? BillStatus.OVERDUE : BillStatus.RECEIVED);
    savedBill.updatedAt = new Date().toISOString();
    this.companyService.save();

    return { valid: true, bill: savedBill, journalEntry: journalResult.entry };
  }

  getBillBalance(companyId, billId) {
    const bill = this.getBillById(companyId, billId);
    if (!bill) return 0;
    const paid = this.engine.billPayments
      .filter((payment) => payment.companyId === companyId && payment.billId === billId)
      .reduce((sum, payment) => sum + toSafeNumber(payment.amount), 0);
    return Math.max(bill.total - paid, 0);
  }

  getVendorOutstandingBalance(companyId, vendorId) {
    const vendor = this.getVendorById(companyId, vendorId);
    if (!vendor) return 0;
    return this.listBills(companyId, { vendorId: vendor.vendorId })
      .reduce((sum, bill) => sum + this.getBillBalance(companyId, bill.id || bill.billId), 0);
  }

  getVendorBalance(companyId, vendorId) {
    return this.getVendorOutstandingBalance(companyId, vendorId);
  }

  getTotalAP(companyId) {
    const apAccounts = this.getCompanyAccounts(companyId)
      .filter((account) => account.type === AccountType.LIABILITY && (/payable/i.test(account.title) || account.code === '2000'));
    return apAccounts.reduce((sum, account) => sum + this.engine.getAccountBalance(account.id), 0);
  }

  getCurrentAP(companyId) {
    return this.listVendors(companyId).reduce((sum, vendor) => sum + this.getVendorOutstandingBalance(companyId, vendor.vendorId), 0);
  }

  getOverdueAP(companyId) {
    return this.listBills(companyId).reduce((sum, bill) => {
      const outstanding = this.getBillBalance(companyId, bill.id || bill.billId);
      const dueDate = new Date(String(bill.dueDate));
      const isPastDue = outstanding > 0 && dueDate < new Date() && bill.status !== BillStatus.PAID && bill.status !== BillStatus.CANCELLED;
      return sum + (isPastDue ? outstanding : 0);
    }, 0);
  }

  getAPAging(companyId) {
    const buckets = { Current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '91+ days': 0 };
    let total = 0;

    for (const bill of this.engine.bills.filter((entry) => entry.companyId === companyId)) {
      const outstanding = this.getBillBalance(companyId, bill.id || bill.billId);
      if (outstanding <= 0) continue;
      const dueDate = bill.dueDate ? new Date(String(bill.dueDate)) : null;
      const ageDays = dueDate && !Number.isNaN(dueDate.getTime()) ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000)) : 0;
      const bucket = getAgingBucket(ageDays);
      buckets[bucket] += outstanding;
      total += outstanding;
    }

    const result = { companyId, buckets, total, asOf: new Date().toISOString().slice(0, 10) };
    result.buckets.current = result.buckets.Current;
    return result;
  }

  getVendorLedger(companyId, vendorId, filters = {}) {
    const vendor = this.getVendorById(companyId, vendorId);
    if (!vendor) return [];

    const billFilter = filters.billId || null;
    const fromDate = filters.fromDate || null;
    const toDate = filters.toDate || null;

    const rows = [];
    for (const bill of this.listBills(companyId, { vendorId: vendor.vendorId })) {
      if (billFilter && bill.id !== billFilter && bill.billId !== billFilter) continue;
      if (fromDate && bill.billDate < fromDate) continue;
      if (toDate && bill.billDate > toDate) continue;
      const billId = bill.id || bill.billId;
      rows.push({
        companyId,
        vendorId: vendor.vendorId,
        date: bill.billDate,
        reference: bill.billNumber,
        bill: bill.billNumber,
        payment: '',
        debit: 0,
        credit: bill.total,
        runningBalance: 0,
        kind: 'bill',
        billId,
      });
    }

    for (const payment of this.engine.billPayments.filter((entry) => entry.companyId === companyId && entry.vendorId === vendor.vendorId)) {
      if (billFilter && payment.billId !== billFilter) continue;
      if (fromDate && payment.paymentDate < fromDate) continue;
      if (toDate && payment.paymentDate > toDate) continue;
      const billNumber = this.getBillById(companyId, payment.billId)?.billNumber || payment.billId || '';
      rows.push({
        companyId,
        vendorId: vendor.vendorId,
        date: payment.paymentDate,
        reference: payment.reference,
        bill: billNumber,
        payment: payment.reference,
        debit: payment.amount,
        credit: 0,
        runningBalance: 0,
        kind: 'payment',
        paymentId: payment.id || payment.paymentId,
        billId: payment.billId,
      });
    }

    rows.sort((left, right) => new Date(left.date) - new Date(right.date));
    let runningBalance = 0;
    for (const row of rows) {
      runningBalance += row.credit;
      runningBalance -= row.debit;
      row.runningBalance = runningBalance;
    }
    return rows;
  }

  exportCustomerLedger(companyId, customerId, filters = {}) {
    const rows = this.getCustomerLedger(companyId, customerId, filters);
    const header = ['Date', 'Reference', 'Invoice', 'Payment', 'Debit', 'Credit', 'Running Balance'];
    const lines = rows.map((row) => [row.date, row.reference, row.invoice, row.payment, row.debit, row.credit, row.runningBalance].join(','));
    return [header.join(','), ...lines].join('\n');
  }

  exportVendorLedger(companyId, vendorId, filters = {}) {
    const rows = this.getVendorLedger(companyId, vendorId, filters);
    const header = ['Date', 'Reference', 'Bill', 'Payment', 'Debit', 'Credit', 'Running Balance'];
    const lines = rows.map((row) => [row.date, row.reference, row.bill, row.payment, row.debit, row.credit, row.runningBalance].join(','));
    return [header.join(','), ...lines].join('\n');
  }

  createVendorPayment(companyId, payload = {}) {
    const company = this.getCompanyById(companyId);
    if (!company) return { valid: false, errors: ['Company is missing'] };

    const vendor = this.getVendorById(companyId, payload.vendorId);
    if (!vendor) return { valid: false, errors: ['Vendor is invalid or belongs to another company'] };

    const bill = this.getBillById(companyId, payload.billId);
    if (!bill) return { valid: false, errors: ['Bill not found'] };

    const paymentAccountId = payload.paymentAccount || payload.cashAccount || null;
    const cashAccount = paymentAccountId ? this.getAccountById(paymentAccountId) : null;
    if (!cashAccount || cashAccount.companyId !== companyId) {
      return { valid: false, errors: ['Cash account is invalid'] };
    }

    const amount = toSafeNumber(payload.amount);
    if (amount <= 0) return { valid: false, errors: ['Payment amount must be greater than zero'] };

    const outstanding = this.getBillBalance(companyId, bill.id || bill.billId);
    if (amount > outstanding) {
      return { valid: false, errors: ['Payment exceeds outstanding bill balance'] };
    }

    const payment = new VendorPaymentRecord({
      ...payload,
      companyId,
      vendorId: vendor.vendorId,
      billId: bill.id || bill.billId,
      paymentAccount: paymentAccountId,
      cashAccount: paymentAccountId,
      status: payload.status || PaymentStatus.POSTED,
      createdBy: payload.createdBy || 'system',
      modifiedBy: payload.modifiedBy || payload.createdBy || 'system',
    });

    const paymentRecord = payment;
    this.engine.billPayments.push(paymentRecord);

    const journalResult = this.engine.postJournalEntry({
      companyId,
      date: payment.paymentDate,
      description: `Vendor payment ${payment.reference || payment.paymentId}`,
      reference: payment.reference || payment.paymentId,
      status: TransactionStatus.POSTED,
      createdBy: payment.createdBy,
      modifiedBy: payment.modifiedBy,
      lines: [
        { accountId: this.findAPAccount(companyId).id, amount: payment.amount, entryType: EntryType.DEBIT, description: `AP settlement for ${bill.billNumber}` },
        { accountId: payment.cashAccount, amount: payment.amount, entryType: EntryType.CREDIT, description: `Vendor payment ${payment.reference}` },
      ],
    });

    if (!journalResult.valid) {
      return { valid: false, errors: journalResult.errors };
    }

    const paidTotal = this.engine.billPayments
      .filter((entry) => entry.companyId === companyId && entry.billId === (bill.id || bill.billId))
      .reduce((sum, entry) => sum + toSafeNumber(entry.amount), 0);

    const remaining = Math.max(bill.total - paidTotal, 0);
    bill.status = remaining <= 0 ? BillStatus.PAID : paidTotal > 0 ? BillStatus.PARTIALLY_PAID : (bill.dueDate && new Date(String(bill.dueDate)) < new Date() ? BillStatus.OVERDUE : BillStatus.RECEIVED);
    bill.updatedAt = new Date().toISOString();

    this.companyService.save();
    return { valid: true, payment: paymentRecord, bill, journalEntry: journalResult.entry };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    InvoiceStatus,
    BillStatus,
    PaymentStatus,
    CustomerRecord,
    VendorRecord,
    InvoiceRecord,
    BillRecord,
    CustomerPaymentRecord,
    VendorPaymentRecord,
    ARAPService,
  };
}

if (typeof window !== 'undefined') {
  window.InvoiceStatus = InvoiceStatus;
  window.BillStatus = BillStatus;
  window.PaymentStatus = PaymentStatus;
  window.ARAPService = ARAPService;
}
