(function () {
const XLSX = typeof module !== 'undefined' && module.exports ? require('xlsx') : (window.XLSX || null);
const { ReportingSystem } = typeof module !== 'undefined' && module.exports ? require('./reporting-system.js') : window;
const { CompanySetupService } = typeof module !== 'undefined' && module.exports ? require('./company-setup.js') : window;
const { ARAPService } = typeof module !== 'undefined' && module.exports ? require('./ar-ap-system.js') : window;

function toCsv(rows = []) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      const normalized = value == null ? '' : String(value).replace(/"/g, '""');
      return `"${normalized}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

class ExportSystem {
  constructor(reportingSystem = null, companyService = null) {
    this.reportingSystem = reportingSystem || new ReportingSystem(companyService || new CompanySetupService('bookkeeper_mobile_company_setup_v1'));
    this.companyService = this.reportingSystem.companyService;
    this.engine = this.reportingSystem.engine;
  }

  exportAsCsv(reportName, companyId, options = {}) {
    const payload = this.exportReport(reportName, companyId, options);
    return toCsv(payload.rows || []);
  }

  exportReport(reportName, companyId, options = {}) {
    const rangeStart = options.startDate || null;
    const rangeEnd = options.endDate || null;
    const company = this.companyService.getCompanyById(companyId) || this.engine.getCompanyById(companyId);

    const reportMap = {
      'trial-balance': () => this.reportingSystem.getTrialBalance(companyId, rangeStart, rangeEnd),
      'income-statement': () => this.reportingSystem.getIncomeStatement(companyId, rangeStart, rangeEnd),
      'balance-sheet': () => this.reportingSystem.getBalanceSheet(companyId, rangeStart, rangeEnd),
      'cash-flow': () => this.reportingSystem.getCashFlowStatement(companyId, rangeStart, rangeEnd),
      'owner-equity': () => this.reportingSystem.getOwnersEquityStatement(companyId, rangeStart, rangeEnd),
      'general-ledger': () => ({ rows: this.reportingSystem.getGeneralLedger(companyId, rangeStart, rangeEnd) }),
      'general-journal': () => ({ rows: this.reportingSystem.getGeneralJournal(companyId, rangeStart, rangeEnd) }),
      'ar-report': () => this.reportingSystem.getARReport(companyId, rangeStart, rangeEnd),
      'ap-report': () => this.reportingSystem.getAPReport(companyId, rangeStart, rangeEnd),
      'customer-ledger': () => ({ rows: this.reportingSystem.getCustomerLedger(companyId, null, { fromDate: rangeStart, toDate: rangeEnd }) }),
      'vendor-ledger': () => ({ rows: this.reportingSystem.getVendorLedger(companyId, null, { fromDate: rangeStart, toDate: rangeEnd }) }),
      'chart-of-accounts': () => ({ rows: this.reportingSystem.getChartOfAccountsReport(companyId) }),
      'transactions': () => ({ rows: this.reportingSystem.getTransactionReport(companyId, rangeStart, rangeEnd) }),
      'ar-aging': () => this.reportingSystem.arapService.getARAging(companyId),
      'ap-aging': () => this.reportingSystem.arapService.getAPAging(companyId),
      'bank-reconciliation': () => this.reportingSystem.getBankReconciliationReport(companyId),
      'audit-trail': () => ({ rows: this.engine.getAuditLogs(companyId) }),
      'default': () => this.reportingSystem.getDashboardSummary(companyId, options.period || 'MONTH', rangeStart, rangeEnd),
    };

    const selected = reportMap[reportName] || reportMap['default'];
    const result = selected();
    const rows = Array.isArray(result) ? result : (result.rows || [result]);
    return {
      companyId,
      companyName: company ? company.name : '',
      reportTitle: result.reportTitle || reportName,
      reportingPeriod: options.period || 'MONTH',
      generatedDate: new Date().toISOString().slice(0, 10),
      rows,
      totals: result.totalAR !== undefined ? { totalAR: result.totalAR, totalAP: result.totalAP } : {},
      validationStatus: (result.validation && result.validation.status) || 'BALANCED',
      data: result,
    };
  }

  exportWorkbook(reportName, companyId, options = {}) {
    const report = this.exportReport(reportName, companyId, options);
    const workbook = XLSX.utils.book_new();
    const rows = report.rows || [report.data];
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, report.reportTitle || reportName);
    return workbook;
  }

  preparePdfExport(reportName, companyId, options = {}) {
    return {
      reportName,
      companyId,
      companyName: this.companyService.getCompanyById(companyId)?.name || '',
      reportTitle: (this.exportReport(reportName, companyId, options).reportTitle || reportName),
      period: options.period || 'MONTH',
      generatedDate: new Date().toISOString().slice(0, 10),
      format: 'PDF-ready',
      rows: this.exportReport(reportName, companyId, options).rows || [],
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  ExportSystem,
  toCsv,
};
if (typeof window !== 'undefined') window.ExportSystem = ExportSystem;
})();
