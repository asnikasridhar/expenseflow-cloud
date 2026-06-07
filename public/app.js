const el = id => document.getElementById(id);
const rupee = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const todayISO = () => new Date().toISOString().slice(0,10);
const monthOf = date => (date || todayISO()).slice(0,7);
const monthName = ym => new Date(ym + "-01T00:00:00").toLocaleString("en-IN", { month:"long", year:"numeric" });
const previousMonth = ym => { const d = new Date(ym + "-01T00:00:00"); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); };

let state = null;
let activeMonth = localStorage.getItem("activeMonth") || todayISO().slice(0,7);
let pin = localStorage.getItem("appPin") || "";

window.addEventListener("load", () => {
  el("monthPicker").value = activeMonth;
  el("date").value = todayISO();
  wire();
  if (pin) login();
});

function wire(){
  el("loginBtn").onclick = () => {
    pin = el("pinInput").value.trim();
    if (!pin) return toast("Enter PIN");
    localStorage.setItem("appPin", pin);
    login();
  };
  document.querySelectorAll("nav button").forEach(btn => btn.onclick = () => show(btn.dataset.screen));
  el("monthPicker").onchange = e => { activeMonth = e.target.value; localStorage.setItem("activeMonth", activeMonth); loadState(); };
  el("expenseForm").onsubmit = saveExpense;
  el("cancelEdit").onclick = cancelEdit;
  el("clearMonth").onclick = clearMonth;
  el("addBudget").onclick = addBudget;
  el("savePartner").onclick = savePartner;
  el("saveLoan").onclick = saveLoan;
  el("addPrepay").onclick = addPrepay;
  el("exportCsv").onclick = exportCsv;
  el("logout").onclick = logout;
  el("resetDemo").onclick = resetDemo;
  el("seedDemo").onclick = seedDemo;
}

async function login(){
  try{
    await api("/api/init", { method:"POST" });
    el("login").classList.add("hidden");
    el("main").classList.remove("hidden");
    el("nav").classList.remove("hidden");
    await loadState();
  }catch(e){
    console.error(e);
    localStorage.removeItem("appPin");
    pin = "";
    toast("Login failed. Check APP_PIN and DB binding.");
  }
}

async function api(path, options = {}){
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type":"application/json",
      "x-app-pin": pin,
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.headers.get("content-type")?.includes("application/json") ? res.json() : res.text();
}

async function loadState(){
  state = await api(`/api/state?month=${activeMonth}`);
  renderAll();
}

function show(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  el(id).classList.add("active");
  renderAll();
}

function renderAll(){
  if(!state) return;
  refreshDropdowns();
  renderDashboard();
  renderExpenses();
  renderBudget();
  renderPartner();
  renderLoan();
  renderQuickAdd();
}

function refreshDropdowns(){
  el("paidBy").innerHTML = state.people.map(p => `<option value="${p.code}">${escapeHtml(p.name)}</option>`).join("");
  el("category").innerHTML = state.budgets.map(b => `<option>${escapeHtml(b.name)}</option>`).join("");
}

function summary(month = activeMonth){
  const income = state.people.reduce((s,p)=>s+Number(p.monthly_income || 0),0);
  const list = month === activeMonth ? state.expenses : state.previousExpenses;
  const expense = list.reduce((s,e)=>s+Number(e.amount || 0),0);
  const budget = state.budgets.reduce((s,b)=>s+Number(b.monthly_budget || 0),0);
  return { income, expense, surplus: income-expense, rate: income ? (income-expense)/income*100 : 0, budgetUsed: budget ? expense/budget*100 : 0, budget };
}

function renderDashboard(){
  const s = summary();
  el("monthLabel").textContent = monthName(activeMonth);
  el("surplusKpi").textContent = rupee(s.surplus);
  el("incomeKpi").textContent = rupee(s.income);
  el("expenseKpi").textContent = rupee(s.expense);
  el("rateKpi").textContent = Math.round(s.rate) + "%";
  el("budgetKpi").textContent = Math.round(s.budgetUsed) + "%";

  el("budgetBars").innerHTML = state.budgets.map(b => {
    const spent = state.expenses.filter(e => e.category === b.name).reduce((s,e)=>s+Number(e.amount),0);
    const pct = b.monthly_budget ? Math.min(100, spent/b.monthly_budget*100) : 0;
    return `<div class="bar-row ${spent > b.monthly_budget ? "over":""}">
      <div class="bar-top"><span>${escapeHtml(b.name)}</span><span>${rupee(spent)} / ${rupee(b.monthly_budget)}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join("");

  const personTotals = {};
  state.people.forEach(p => personTotals[p.code] = 0);
  state.expenses.forEach(e => personTotals[e.paid_by] = (personTotals[e.paid_by] || 0) + Number(e.amount));
  const max = Math.max(...Object.values(personTotals), 1);
  el("partnerSplit").innerHTML = state.people.map(p => `<div class="bar-row">
    <div class="bar-top"><span>${escapeHtml(p.name)}</span><span>${rupee(personTotals[p.code])}</span></div>
    <div class="bar"><i style="width:${personTotals[p.code]/max*100}%"></i></div>
  </div>`).join("");

  const prev = summary(previousMonth(activeMonth));
  el("monthCompare").innerHTML = `<table class="table">
    <tr><th>Metric</th><th>${monthName(previousMonth(activeMonth))}</th><th>${monthName(activeMonth)}</th></tr>
    <tr><td>Income</td><td>${rupee(prev.income)}</td><td>${rupee(s.income)}</td></tr>
    <tr><td>Expense</td><td>${rupee(prev.expense)}</td><td>${rupee(s.expense)}</td></tr>
    <tr><td>Surplus</td><td>${rupee(prev.surplus)}</td><td>${rupee(s.surplus)}</td></tr>
    <tr><td>Savings Rate</td><td>${Math.round(prev.rate)}%</td><td>${Math.round(s.rate)}%</td></tr>
  </table>`;
}

async function saveExpense(e){
  e.preventDefault();
  const id = el("editingId").value ? Number(el("editingId").value) : Date.now();
  const payload = {
    id,
    date: el("date").value,
    month: monthOf(el("date").value),
    paid_by: el("paidBy").value,
    amount: Number(el("amount").value),
    category: el("category").value,
    payment: el("payment").value,
    description: el("description").value,
    reimburse: el("reimburse").value
  };
  await api("/api/expense", { method:"POST", body:JSON.stringify(payload) });
  activeMonth = payload.month;
  el("monthPicker").value = activeMonth;
  localStorage.setItem("activeMonth", activeMonth);
  cancelEdit();
  await loadState();
  show("expenses");
}

function renderExpenses(){
  el("expenseList").innerHTML = state.expenses.map(e => `<div class="entry">
    <div><b>${escapeHtml(e.category)}</b><br><small>${escapeHtml(e.description || e.payment || "")} • ${e.date}</small><br>
    <small>Paid by ${escapeHtml(personName(e.paid_by))}${e.reimburse==="Yes"?" • Reimburse":""}</small>
    <div class="actions"><button class="secondary" onclick="editExpense(${e.id})">Edit</button><button class="danger" onclick="deleteExpense(${e.id})">Delete</button></div></div>
    <div class="amt">${rupee(e.amount)}</div>
  </div>`).join("") || `<p>No expenses for ${monthName(activeMonth)}.</p>`;
}

function personName(code){
  const p = state.people.find(x=>x.code===code);
  return p ? p.name : code;
}

function editExpense(id){
  const e = state.expenses.find(x=>Number(x.id)===Number(id));
  if(!e) return;
  show("add");
  el("editingId").value = e.id;
  el("date").value = e.date;
  el("paidBy").value = e.paid_by;
  el("amount").value = e.amount;
  el("category").value = e.category;
  el("payment").value = e.payment;
  el("description").value = e.description || "";
  el("reimburse").value = e.reimburse || "No";
  el("formTitle").textContent = "Edit Expense";
  el("saveExpense").textContent = "Update Expense";
  el("cancelEdit").classList.remove("hidden");
}

async function deleteExpense(id){
  if(!confirm("Delete this expense?")) return;
  await api(`/api/expense?id=${id}`, { method:"DELETE" });
  await loadState();
}

function cancelEdit(){
  el("expenseForm").reset();
  el("editingId").value = "";
  el("date").value = todayISO();
  el("formTitle").textContent = "Add Expense";
  el("saveExpense").textContent = "Save Expense";
  el("cancelEdit").classList.add("hidden");
  refreshDropdowns();
}

async function clearMonth(){
  if(!confirm(`Clear all expenses for ${monthName(activeMonth)}?`)) return;
  await api(`/api/clear-month?month=${activeMonth}`, { method:"DELETE" });
  await loadState();
}

function renderBudget(){
  el("budgetEditor").innerHTML = state.budgets.map(b => {
    const spent = state.expenses.filter(e => e.category === b.name).reduce((s,e)=>s+Number(e.amount),0);
    const pct = b.monthly_budget ? Math.min(100, spent/b.monthly_budget*100) : 0;
    return `<div class="bar-row ${spent>b.monthly_budget?'over':''}">
      <div class="bar-top"><span>${escapeHtml(b.name)}</span><span>${rupee(spent)} / ${rupee(b.monthly_budget)}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="actions"><button class="secondary" onclick="editBudget(${b.id})">Edit</button><button class="danger" onclick="deleteBudget(${b.id})">Delete</button></div>
    </div>`;
  }).join("");
}

async function addBudget(){
  const name = prompt("Budget item name");
  if(!name) return;
  const monthly_budget = Number(prompt("Monthly budget amount", "0") || 0);
  await api("/api/budget", { method:"POST", body:JSON.stringify({ name, monthly_budget }) });
  await loadState();
}

async function editBudget(id){
  const b = state.budgets.find(x=>Number(x.id)===Number(id));
  const name = prompt("Name", b.name);
  if(!name) return;
  const monthly_budget = Number(prompt("Budget amount", b.monthly_budget) || 0);
  await api("/api/budget", { method:"POST", body:JSON.stringify({ id, name, monthly_budget }) });
  await loadState();
}

async function deleteBudget(id){
  if(!confirm("Delete budget item?")) return;
  await api(`/api/budget?id=${id}`, { method:"DELETE" });
  await loadState();
}

function renderPartner(){
  const a = state.people.find(p=>p.code==="A");
  const p = state.people.find(p=>p.code==="P");
  el("personA").value = a?.name || "A";
  el("personP").value = p?.name || "P";
  el("incomeA").value = a?.monthly_income || 0;
  el("incomeP").value = p?.monthly_income || 0;
}

async function savePartner(){
  await api("/api/partner", { method:"POST", body:JSON.stringify({
    aName:el("personA").value, pName:el("personP").value,
    incomeA:Number(el("incomeA").value), incomeP:Number(el("incomeP").value)
  }) });
  await loadState();
  toast("Partner saved");
}

function renderLoan(){
  el("loanOriginal").value = state.loan.original || 0;
  el("loanBalance").value = state.loan.balance || 0;
  el("loanEmi").value = state.loan.emi || 0;
  el("loanRate").value = state.loan.rate || 0;

  el("prepayList").innerHTML = state.prepayments.map(p => `<div class="entry">
    <div><b>${escapeHtml(p.name)}</b><br><small>${rupee(p.amount)} • ${escapeHtml(p.frequency || "")}</small></div>
    <div class="actions"><button class="secondary" onclick="addPrepayExpense(${p.id})">Add Expense</button><button class="secondary" onclick="editPrepay(${p.id})">Edit</button><button class="danger" onclick="deletePrepay(${p.id})">Delete</button></div>
  </div>`).join("");
}

async function saveLoan(){
  await api("/api/loan", { method:"POST", body:JSON.stringify({
    original:Number(el("loanOriginal").value), balance:Number(el("loanBalance").value),
    emi:Number(el("loanEmi").value), rate:Number(el("loanRate").value)
  }) });
  await loadState();
  toast("Loan saved");
}

async function addPrepay(){
  const name = prompt("Prepayment name", "Extra Prepayment");
  if(!name) return;
  const amount = Number(prompt("Amount", "50000") || 0);
  const frequency = prompt("Frequency", "Monthly") || "Monthly";
  await api("/api/prepay", { method:"POST", body:JSON.stringify({ name, amount, frequency }) });
  await loadState();
}

async function editPrepay(id){
  const p = state.prepayments.find(x=>Number(x.id)===Number(id));
  const name = prompt("Name", p.name);
  if(!name) return;
  const amount = Number(prompt("Amount", p.amount) || 0);
  const frequency = prompt("Frequency", p.frequency || "Monthly") || "Monthly";
  await api("/api/prepay", { method:"POST", body:JSON.stringify({ id, name, amount, frequency }) });
  await loadState();
}

async function deletePrepay(id){
  if(!confirm("Delete prepayment option?")) return;
  await api(`/api/prepay?id=${id}`, { method:"DELETE" });
  await loadState();
}

function addPrepayExpense(id){
  const p = state.prepayments.find(x=>Number(x.id)===Number(id));
  show("add");
  el("amount").value = p.amount;
  el("category").value = state.budgets.some(b=>b.name===p.name) ? p.name : "Home Loan Prepayment";
  el("description").value = p.name;
  el("payment").value = "Bank Transfer";
  el("date").value = activeMonth + "-01";
}

function renderQuickAdd(){
  const items = [
    {name:"EMI", amount:state.loan.emi, cat:"Home Loan EMI", desc:"Monthly EMI"},
    ...state.prepayments.map(p => ({name:p.name, amount:p.amount, cat:p.name, desc:p.name}))
  ];
  el("quickAdd").innerHTML = items.map((it,i)=>`<button onclick="quick(${i})"><b>${escapeHtml(it.name)}</b><br><small>${rupee(it.amount)} • ${escapeHtml(it.cat)}</small></button>`).join("");
  window.quickItems = items;
}

function quick(i){
  const it = window.quickItems[i];
  show("add");
  el("amount").value = it.amount;
  el("category").value = it.cat;
  el("description").value = it.desc;
  el("payment").value = "Bank Transfer";
  el("date").value = activeMonth + "-01";
}

function exportCsv(){
  const rows = [["Date","Month","Paid By","Amount","Category","Description","Payment","Reimburse"], ...state.allExpenses.map(e => [e.date,e.month,personName(e.paid_by),e.amount,e.category,e.description,e.payment,e.reimburse])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  a.download = "expenseflow-cloud-expenses.csv";
  a.click();
}

async function resetDemo(){
  if(!confirm("Reset all cloud data?")) return;
  await api("/api/reset", { method:"POST" });
  await loadState();
}

async function seedDemo(){
  await api("/api/seed-demo", { method:"POST" });
  await loadState();
  toast("May/June demo data added");
}

function logout(){
  localStorage.removeItem("appPin");
  location.reload();
}

function toast(msg){
  el("toast").textContent = msg;
  el("toast").style.display = "block";
  setTimeout(()=>el("toast").style.display="none", 2500);
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}
