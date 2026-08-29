const COA=[
["1000","Cash","Asset"],["1100","Accounts Receivable","Asset"],["1200","Equipment","Asset"],
["2000","Accounts Payable","Liability"],["3000","Owner Capital","Equity"],
["4000","Sales Revenue","Revenue"],["4100","Service Revenue","Revenue"],
["5000","Office Supplies Expense","Expense"],["5100","Rent Expense","Expense"],
["5200","Utilities Expense","Expense"],["5300","Salaries Expense","Expense"],["5400","Miscellaneous Expense","Expense"]
];
const KEY="bookkeeper_mobile_v1";
const sample=[
{"id":"J-0001","date":"2026-08-01","description":"Opening capital","debit":"Cash","debitAmount":50000,"credit":"Owner Capital","creditAmount":50000}
];
let state=JSON.parse(localStorage.getItem(KEY)||"null")||{transactions:sample};

const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const acctNames=COA.map(x=>x[1]);
function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
function typeOf(a){let x=COA.find(c=>c[1]===a);return x?x[2]:""}
function validTx(t){
 const dateOk=!!t.date && !Number.isNaN(new Date(t.date).getTime());
 const amtOk=Number(t.debitAmount)>0&&Number(t.creditAmount)>0&&Number.isFinite(Number(t.debitAmount))&&Number.isFinite(Number(t.creditAmount));
 const debitOk=acctNames.includes(t.debit),creditOk=acctNames.includes(t.credit);
 const balanced=Math.abs(Number(t.debitAmount)-Number(t.creditAmount))<0.005;
 return {dateOk,amtOk,debitOk,creditOk,balanced,ready:dateOk&&amtOk&&debitOk&&creditOk&&balanced};
}
function nextId(){let max=state.transactions.reduce((m,t)=>Math.max(m,parseInt((t.id||"J-0").split("-")[1])||0),0);return "J-"+String(max+1).padStart(4,"0")}
function balances(){
 let b={};COA.forEach(c=>b[c[1]]={type:c[2],debit:0,credit:0});
 state.transactions.forEach(t=>{if(!b[t.debit]||!b[t.credit])return;b[t.debit].debit+=+t.debitAmount;b[t.credit].credit+=+t.creditAmount});
 Object.values(b).forEach(x=>x.net=x.debit-x.credit);
 return b;
}
function checks(){
 const b=balances(), rows=state.transactions.map(validTx);
 const td=state.transactions.reduce((s,t)=>s+(+t.debitAmount||0),0),tc=state.transactions.reduce((s,t)=>s+(+t.creditAmount||0),0);
 const invalid=rows.filter(x=>!x.ready).length;
 const assets=COA.filter(c=>c[2]==="Asset").reduce((s,c)=>s+(b[c[1]].net),0);
 const liab=COA.filter(c=>c[2]==="Liability").reduce((s,c)=>s+(-b[c[1]].net),0);
 const equity=COA.filter(c=>c[2]==="Equity").reduce((s,c)=>s+(-b[c[1]].net),0);
 const rev=COA.filter(c=>c[2]==="Revenue").reduce((s,c)=>s+(-b[c[1]].net),0);
 const exp=COA.filter(c=>c[2]==="Expense").reduce((s,c)=>s+b[c[1]].net,0);
 const ni=rev-exp, bsDiff=assets-(liab+equity+ni);
 return {td,tc,diff:td-tc,invalid,assets,liab,equity,rev,exp,ni,bsDiff,ready:Math.abs(td-tc)<.005&&invalid===0&&Math.abs(bsDiff)<.005};
}
function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));document.getElementById(id).classList.add("active");document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===id))}
document.addEventListener("click",e=>{let b=e.target.closest("[data-go]");if(b)show(b.dataset.go)});
function renderAccounts(){["debitAccount","creditAccount"].forEach(id=>{let s=document.getElementById(id);s.innerHTML='<option value="">Select account</option>'+COA.map(c=>`<option>${c[1]}</option>`).join("")})}
function renderValidation(){
 const t={date:date.value,description:description.value,debit:debitAccount.value,debitAmount:debitAmount.value,credit:creditAccount.value,creditAmount:creditAmount.value};
 const v=validTx(t);document.getElementById("validation").innerHTML=`<b>Validation</b><br>${v.dateOk?'✓':'✗'} Date ${v.dateOk?'OK':'ERROR'}<br>${v.debitOk?'✓':'✗'} Debit account ${v.debitOk?'OK':'ERROR'}<br>${v.creditOk?'✓':'✗'} Credit account ${v.creditOk?'OK':'ERROR'}<br>${v.amtOk?'✓':'✗'} Amount ${v.amtOk?'OK':'ERROR'}<br>${v.balanced?'✓':'✗'} ${v.balanced?'Balanced':'Not Balanced'}<br><strong class="${v.ready?'ok':'err'}">${v.ready?'READY':'REVIEW'}</strong>`;
}
function renderDashboard(){let b=balances(),c=checks();cash.textContent=money(b.Cash.net);assets.textContent=money(c.assets);revenue.textContent=money(c.rev);expenses.textContent=money(c.exp);netIncome.textContent=money(c.ni);overallStatus.textContent=c.ready?"READY":"REVIEW";overallStatus.style.color=c.ready?"#16803c":"#b42318";recent.innerHTML=state.transactions.slice(-8).reverse().map(t=>`<div class="tx"><div><div class="desc">${t.description}</div><small>${t.id} • ${t.date}</small></div><div>${money(t.debitAmount)}<br><small class="${validTx(t).ready?'ok':'err'}">${validTx(t).ready?'READY':'REVIEW'}</small></div></div>`).join("")}
function renderTransactions(){allTransactions.innerHTML=state.transactions.slice().reverse().map(t=>`<div class="tx"><div><div class="desc">${t.description}</div><small>${t.id} • ${t.date}<br>Dr ${t.debit} • Cr ${t.credit}</small></div><div class="num">${money(t.debitAmount)}<br><small>${validTx(t).ready?'READY':'REVIEW'}</small></div></div>`).join("")}
function table(headers,rows){return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`}
function renderReport(kind){
 const b=balances(),c=checks();let title="",body="";
 if(kind==="gl"){title="General Ledger";body=table(["Account","Debit","Credit","Net"],COA.map(x=>`<tr><td>${x[1]}</td><td class="num">${money(b[x[1]].debit)}</td><td class="num">${money(b[x[1]].credit)}</td><td class="num">${money(b[x[1]].net)}</td></tr>`))}
 if(kind==="tb"){title="Trial Balance";body=table(["Account","Type","Debit","Credit","Net"],COA.map(x=>{let n=b[x[1]].net,d=n>0?n:0,cr=n<0?-n:0;return `<tr><td>${x[1]}</td><td>${x[2]}</td><td class="num">${money(d)}</td><td class="num">${money(cr)}</td><td class="num">${money(n)}</td></tr>`}).concat([`<tr><th>Total</th><th></th><th class="num">${money(COA.reduce((s,x)=>s+Math.max(b[x[1]].net,0),0))}</th><th class="num">${money(COA.reduce((s,x)=>s+Math.max(-b[x[1]].net,0),0))}</th><th class="num">${money(c.diff)}</th></tr>`]))}
 if(kind==="is"){title="Income Statement";body=`<div class="row"><b>Total Revenue</b><span style="float:right">${money(c.rev)}</span></div><div class="row"><b>Total Expenses</b><span style="float:right">${money(c.exp)}</span></div><div class="row"><b>Net Income</b><span style="float:right">${money(c.ni)}</span></div>`}
 if(kind==="bs"){title="Balance Sheet";body=`<div class="row"><b>Total Assets</b><span style="float:right">${money(c.assets)}</span></div><div class="row"><b>Total Liabilities</b><span style="float:right">${money(c.liab)}</span></div><div class="row"><b>Equity</b><span style="float:right">${money(c.equity+c.ni)}</span></div><div class="row"><b>Difference</b><span style="float:right">${money(c.bsDiff)}</span></div><div class="row"><b>Status</b><span style="float:right">${Math.abs(c.bsDiff)<.005?"BALANCED":"REVIEW"}</span></div>`}
 if(kind==="checks"){title="Bookkeeping Checks";body=table(["Check","Result"],[
`<tr><td>Journal Debit Total</td><td class="num">${money(c.td)}</td></tr>`,`<tr><td>Journal Credit Total</td><td class="num">${money(c.tc)}</td></tr>`,`<tr><td>Journal Difference</td><td class="num">${money(c.diff)}</td></tr>`,`<tr><td>Transactions Needing Review</td><td class="num">${c.invalid}</td></tr>`,`<tr><td>Balance Sheet Difference</td><td class="num">${money(c.bsDiff)}</td></tr>`,`<tr><th>Overall Status</th><th class="num">${c.ready?"READY":"REVIEW"}</th></tr>`])}
 reportBody.innerHTML=`<h3>${title}</h3>${body}`;
}
function renderCOA(){coaBody.innerHTML=table(["Code","Account","Type"],COA.map(c=>`<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`))}
function renderAll(){renderDashboard();renderTransactions();renderCOA();renderReport("checks")}
txForm.addEventListener("input",renderValidation);
txForm.addEventListener("submit",e=>{e.preventDefault();let t={id:nextId(),date:date.value,description:description.value.trim(),debit:debitAccount.value,debitAmount:+debitAmount.value,credit:creditAccount.value,creditAmount:+creditAmount.value};let v=validTx(t);if(!v.ready){renderValidation();return}state.transactions.push(t);save();txForm.reset();date.value=new Date().toISOString().slice(0,10);document.getElementById("validation").innerHTML='<strong class="ok">✓ Saved — READY</strong>';show("dashboard")});
document.querySelectorAll("[data-report]").forEach(b=>b.addEventListener("click",()=>renderReport(b.dataset.report)));
exportBtn.onclick=()=>{let blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bookkeeper-backup.json";a.click();URL.revokeObjectURL(a.href)};
importFile.onchange=e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let x=JSON.parse(r.result);if(!Array.isArray(x.transactions))throw 0;state=x;save();alert("Backup restored.");}catch{alert("Invalid backup file.")}};r.readAsText(f)};
resetBtn.onclick=()=>{if(confirm("Reset to sample data? This deletes data stored in this browser.")){state={transactions:sample};save()}};
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;installBtn.classList.remove("hidden")});installBtn.onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.classList.add("hidden")}};
if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
renderAccounts();date.value=new Date().toISOString().slice(0,10);renderAll();renderValidation();
