(function () {
  const ApplicationService = window.BookkeeperApplicationService;
  const Phase8OperationsService = window.Phase8OperationsService;
  let app;
  let phase8;

  const byId = (id) => document.getElementById(id);
  const money = (value) => `${app?.getCurrentCompany()?.baseCurrency === 'PHP' ? 'PHP ' : ''}${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => new Date().toISOString().slice(0, 10);

  function show(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
    document.querySelectorAll('.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.go === id));
    if (id === 'dashboard') renderDashboard();
    if (id === 'journal') renderJournal();
    if (id === 'coa') renderAccounts();
    if (id === 'reports') renderReports('checks');
    if (id === 'arap') renderARAP();
    if (id === 'more') renderMore();
  }

  function renderSetup() {
    byId('setupStatus').textContent = '';
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === 'setup'));
    byId('appShell').classList.add('hidden');
  }

  function renderDashboard() {
    const company = app.getCurrentCompany();
    if (!company) return renderSetup();
    const summary = app.getDashboardSummary(company.id);
    byId('companyName').textContent = company.name;
    byId('overallStatus').textContent = summary.status;
    byId('overallStatus').style.color = summary.status === 'GREEN' ? '#16803c' : '#b42318';
    byId('cash').textContent = money(summary.balances.cash);
    byId('assets').textContent = money(summary.balances.totalAssets);
    byId('revenue').textContent = money(summary.reports.incomeStatement.totalRevenue);
    byId('expenses').textContent = money(summary.reports.incomeStatement.totalExpenses);
    byId('netIncome').textContent = money(summary.balances.netIncome);
    byId('recent').innerHTML = app.transactionService.listTransactions(company.id).slice(0, 8).map((entry) => `<div class="tx"><div><div class="desc">${entry.description}</div><small>${entry.type} • ${entry.date}</small></div><div class="num">${money(app.transactionService.getTransactionTotal(entry))}<br><small>${entry.status}</small></div></div>`).join('') || '<p class="muted">No transactions yet.</p>';
  }

  function accountOptions() {
    const company = app.getCurrentCompany();
    return app.companyService.engine.getCompanyAccounts(company.id).filter((account) => !account.archived).map((account) => `<option value="${account.id}">${account.code} ${account.title}</option>`).join('');
  }

  function renderJournal() {
    const company = app.getCurrentCompany();
    if (!company) return;
    const debit = byId('journalDebit');
    const credit = byId('journalCredit');
    if (debit && !debit.dataset.ready) { debit.innerHTML = accountOptions(); credit.innerHTML = accountOptions(); debit.dataset.ready = '1'; }
    byId('journalRows').innerHTML = app.transactionService.listTransactions(company.id).map((entry) => `<div class="tx"><div><div class="desc">${entry.description}</div><small>${entry.date} • ${entry.status}</small></div><div class="num">${money(app.transactionService.getTransactionTotal(entry))}</div></div>`).join('') || '<p class="muted">No journal entries yet.</p>';
  }

  function renderAccounts() {
    const company = app.getCurrentCompany();
    if (!company) return;
    byId('coaRows').innerHTML = app.companyService.engine.getCompanyAccounts(company.id).map((account) => `<tr><td>${account.code}</td><td>${account.title}</td><td>${account.type}</td><td>${account.archived ? 'Archived' : 'Active'}</td></tr>`).join('');
    byId('coaCompany').textContent = company.name;
    const type = byId('accountType');
    if (type && !type.dataset.ready) { type.innerHTML = Object.values(window.AccountType).map((value) => `<option>${value}</option>`).join(''); type.dataset.ready = '1'; }
  }

  function renderReports(kind) {
    const company = app.getCurrentCompany();
    if (!company) return renderSetup();
    const report = app.reportingService;
    let data;
    if (kind === 'gl') data = report.getGeneralLedger(company.id);
    if (kind === 'tb') data = report.getTrialBalance(company.id);
    if (kind === 'is') data = report.getIncomeStatement(company.id);
    if (kind === 'bs') data = report.getBalanceSheet(company.id);
    if (kind === 'checks') data = report.getTrialBalance(company.id);
    byId('reportBody').innerHTML = `<h3>${kind.toUpperCase()}</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
  }

  function renderARAP() {
    const company = app.getCurrentCompany();
    if (!company) return renderSetup();
    const ar = app.arapService;
    byId('customerRows').innerHTML = ar.listCustomers(company.id).map((record) => `<div class="tx"><div>${record.customerCode} • ${record.name}</div><small>${record.email || 'No email'}</small></div>`).join('') || '<p class="muted">No customers yet.</p>';
    byId('vendorRows').innerHTML = ar.listVendors(company.id).map((record) => `<div class="tx"><div>${record.vendorCode} • ${record.name}</div><small>${record.email || 'No email'}</small></div>`).join('') || '<p class="muted">No vendors yet.</p>';
    byId('invoiceRows').innerHTML = ar.listInvoices(company.id).map((record) => `<div class="tx"><div>${record.invoiceNumber}</div><div class="num">${money(record.total)}<br><small>${record.status}</small></div></div>`).join('') || '<p class="muted">No invoices yet.</p>';
    byId('billRows').innerHTML = ar.listBills(company.id).map((record) => `<div class="tx"><div>${record.billNumber}</div><div class="num">${money(record.total)}<br><small>${record.status}</small></div></div>`).join('') || '<p class="muted">No bills yet.</p>';
  }

  function renderMore() {
    const company = app.getCurrentCompany();
    if (!company) return renderSetup();
    byId('moreCompany').textContent = `${company.name} • ${company.businessType}`;
    byId('integrity').textContent = app.backupSystem.dataIntegrityCheck(company.id).message;
  }

  function phase8Action(action) {
    const company = app.getCurrentCompany();
    const account = app.companyService.engine.getCompanyAccounts(company.id).find((item) => item.type === 'ASSET');
    try {
      if (action === 'reconciliation') {
        let bank = phase8.engine.bankAccounts.find((item) => item.companyId === company.id);
        if (!bank) bank = phase8.createBankAccount(company.id, { name: 'Primary Checking', accountNumber: '1001', type: 'checking', balance: 0, ledgerAccountId: account?.id, createdBy: 'mobile' });
        phase8.createReconciliation(company.id, bank.id, { statementDate: today(), startingBalance: 0, endingBalance: 0, bookBalance: 0, outstandingItems: 0, createdBy: 'mobile' });
      } else if (action === 'adjusting') {
        const expense = app.companyService.engine.getCompanyAccounts(company.id).find((item) => item.type === 'EXPENSE');
        phase8.createAdjustingEntry(company.id, { description: 'Mobile adjusting entry', date: today(), status: 'DRAFT', createdBy: 'mobile', lines: [{ accountId: expense.id, entryType: 'debit', amount: 1 }, { accountId: account.id, entryType: 'credit', amount: 1 }] });
      } else if (action === 'closing') {
        phase8.closePeriod(company.id, { startDate: today(), endDate: today(), closingDate: today(), reason: 'Mobile period close', closedBy: 'mobile' });
      }
      byId('phase8Status').textContent = `${action} completed through Phase8OperationsService.`;
      if (action === 'audit') byId('phase8Status').textContent = `${phase8.getAuditTrail(company.id).length} audit events available.`;
      renderMore();
    } catch (error) { byId('phase8Status').textContent = error.message; }
  }

  function bind() {
    document.addEventListener('click', (event) => { const button = event.target.closest('[data-go]'); if (button) { event.preventDefault(); show(button.dataset.go); } });
    document.querySelectorAll('[data-report]').forEach((button) => button.addEventListener('click', () => renderReports(button.dataset.report)));
    document.querySelectorAll('[data-phase8-action]').forEach((button) => button.addEventListener('click', () => phase8Action(button.dataset.phase8Action)));
    byId('setupForm').addEventListener('submit', (event) => { event.preventDefault(); try { const data = Object.fromEntries(new FormData(event.target)); const company = app.initializeCompany(data); const templates = window.DEFAULT_ACCOUNT_TEMPLATES[company.businessType] || window.DEFAULT_ACCOUNT_TEMPLATES.Other || []; templates.forEach((item) => app.companyService.createAccount(company.id, { code: item.code, title: item.title, type: item.type, createdBy: 'mobile' })); byId('appShell').classList.remove('hidden'); show('dashboard'); } catch (error) { byId('setupStatus').textContent = error.message; } });
    byId('journalForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { app.createJournalEntry(app.getCurrentCompany().id, { description: data.description, date: data.date, lines: [{ accountId: data.debit, entryType: 'debit', amount: Number(data.amount) }, { accountId: data.credit, entryType: 'credit', amount: Number(data.amount) }] }); event.target.reset(); renderJournal(); renderDashboard(); } catch (error) { byId('journalStatus').textContent = error.message; } });
    byId('customerForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); app.arapService.createCustomer(app.getCurrentCompany().id, data); event.target.reset(); renderARAP(); });
    byId('vendorForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); app.arapService.createVendor(app.getCurrentCompany().id, data); event.target.reset(); renderARAP(); });
    byId('accountForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { app.companyService.createAccount(app.getCurrentCompany().id, data); event.target.reset(); renderAccounts(); renderJournal(); } catch (error) { byId('accountStatus').textContent = error.message; } });
    byId('invoiceForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { const account = app.companyService.engine.getCompanyAccounts(app.getCurrentCompany().id).find((item) => item.type === 'REVENUE'); app.arapService.createInvoice(app.getCurrentCompany().id, { customerId: data.customerId, invoiceNumber: data.invoiceNumber, invoiceDate: today(), dueDate: data.dueDate, items: [{ description: data.description, amount: Number(data.amount), revenueAccount: account?.id }] }); event.target.reset(); renderARAP(); } catch (error) { byId('arapStatus').textContent = error.message; } });
    byId('billForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { const account = app.companyService.engine.getCompanyAccounts(app.getCurrentCompany().id).find((item) => item.type === 'EXPENSE'); app.arapService.createBill(app.getCurrentCompany().id, { vendorId: data.vendorId, billNumber: data.billNumber, billDate: today(), dueDate: data.dueDate, items: [{ description: data.description, amount: Number(data.amount), expenseAccount: account?.id }] }); event.target.reset(); renderARAP(); } catch (error) { byId('arapStatus').textContent = error.message; } });
    byId('exportBtn').addEventListener('click', () => { const backup = app.getCompanySnapshot(app.getCurrentCompany().id); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(backup.backup, null, 2)], { type: 'application/json' })); link.download = `${app.getCurrentCompany().code}-backup.json`; link.click(); URL.revokeObjectURL(link.href); });
    byId('restoreFile').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const backup = JSON.parse(reader.result); const result = app.backupSystem.restoreBackup(backup, { mode: 'new', confirm: true }); if (!result.valid) throw new Error(result.errors.join('; ')); app.companyService.switchCompany(result.companyId); location.reload(); } catch (error) { byId('restoreStatus').textContent = error.message; } }; reader.readAsText(file); });
    byId('resetBtn').addEventListener('click', () => { if (confirm('Reset demo data? This explicitly replaces the current local application state.')) { localStorage.clear(); location.reload(); } });
  }

  function start() {
    if (!ApplicationService || !Phase8OperationsService) return;
    app = new ApplicationService(); phase8 = new Phase8OperationsService(); phase8.companyService = app.companyService; phase8.engine = app.companyService.engine; bind();
    if (app.getCurrentCompany()) { byId('appShell').classList.remove('hidden'); show('dashboard'); } else renderSetup();
  }
  start();
})();
