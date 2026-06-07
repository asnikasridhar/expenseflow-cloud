const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json" }
});
const text = (data, status = 200) => new Response(data, { status });

function requirePin(request, env) {
  const expected = env.APP_PIN;
  if (!expected) return true;
  return request.headers.get("x-app-pin") === expected;
}
async function body(request) { try { return await request.json(); } catch { return {}; } }

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return text("D1 binding DB is missing", 500);
  if (!requirePin(request, env)) return text("Unauthorized", 401);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = request.method;

  try {
    if (path === "init" && method === "POST") return await init(env);
    if (path === "state" && method === "GET") return await getState(env, url.searchParams.get("month"));
    if (path === "expense" && method === "POST") return await saveExpense(env, await body(request));
    if (path === "expense" && method === "DELETE") return await deleteExpense(env, url.searchParams.get("id"));
    if (path === "clear-month" && method === "DELETE") return await clearMonth(env, url.searchParams.get("month"));
    if (path === "budget" && method === "POST") return await saveBudget(env, await body(request));
    if (path === "budget" && method === "DELETE") return await deleteBudget(env, url.searchParams.get("id"));
    if (path === "partner" && method === "POST") return await savePartner(env, await body(request));
    if (path === "loan" && method === "POST") return await saveLoan(env, await body(request));
    if (path === "prepay" && method === "POST") return await savePrepay(env, await body(request));
    if (path === "prepay" && method === "DELETE") return await deletePrepay(env, url.searchParams.get("id"));
    if (path === "reset" && method === "POST") return await reset(env);
    if (path === "seed-demo" && method === "POST") return await seedDemo(env);
    return text("Not found", 404);
  } catch (err) {
    return json({ error: err.message, stack: err.stack }, 500);
  }
}

async function init(env) {
  await createSchema(env);
  await seedIfNeeded(env);
  return json({ ok: true });
}

async function createSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS people (code TEXT PRIMARY KEY, name TEXT NOT NULL, monthly_income REAL NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, monthly_budget REAL NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, date TEXT NOT NULL, month TEXT NOT NULL, paid_by TEXT NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL, payment TEXT, description TEXT, reimburse TEXT DEFAULT 'No')`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS loan (id INTEGER PRIMARY KEY CHECK (id = 1), original REAL, balance REAL, emi REAL, rate REAL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS prepayments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount REAL NOT NULL, frequency TEXT)`)
  ]);
}

async function seedIfNeeded(env) {
  const peopleCount = await env.DB.prepare("SELECT COUNT(*) c FROM people").first("c");
  if (!peopleCount) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO people(code,name,monthly_income) VALUES ('A','A',140000)"),
      env.DB.prepare("INSERT INTO people(code,name,monthly_income) VALUES ('P','P',223000)")
    ]);
  }

  const budgetCount = await env.DB.prepare("SELECT COUNT(*) c FROM budgets").first("c");
  if (!budgetCount) {
    const budgets = [
      ["Home Loan EMI",52700],["Home Loan Prepayment",80000],["Compulsory Expenses",100000],
      ["Kids Supplies",25000],["Travel",10000],["Blinkit Wallet",16000],["Amazon Wallet",16000],
      ["Outing",8000],["Investments (Fixed)",55000],["Groceries",10000],["Medical",3000],["Miscellaneous",4000]
    ];
    for (const b of budgets) await env.DB.prepare("INSERT INTO budgets(name,monthly_budget) VALUES (?,?)").bind(b[0], b[1]).run();
  }

  const loanCount = await env.DB.prepare("SELECT COUNT(*) c FROM loan").first("c");
  if (!loanCount) await env.DB.prepare("INSERT INTO loan(id,original,balance,emi,rate) VALUES (1,3300000,3150000,52700,7.5)").run();

  const prepayCount = await env.DB.prepare("SELECT COUNT(*) c FROM prepayments").first("c");
  if (!prepayCount) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO prepayments(name,amount,frequency) VALUES ('Regular Prepayment',80000,'Monthly')"),
      env.DB.prepare("INSERT INTO prepayments(name,amount,frequency) VALUES ('Bonus Prepayment',100000,'Occasional')")
    ]);
  }
}

async function getState(env, month) {
  month = month || new Date().toISOString().slice(0,7);
  const prev = previousMonth(month);
  const people = (await env.DB.prepare("SELECT * FROM people ORDER BY code").all()).results;
  const budgets = (await env.DB.prepare("SELECT * FROM budgets ORDER BY id").all()).results;
  const loan = await env.DB.prepare("SELECT * FROM loan WHERE id=1").first();
  const prepayments = (await env.DB.prepare("SELECT * FROM prepayments ORDER BY id").all()).results;
  const expenses = (await env.DB.prepare("SELECT * FROM expenses WHERE month=? ORDER BY date DESC, id DESC").bind(month).all()).results;
  const previousExpenses = (await env.DB.prepare("SELECT * FROM expenses WHERE month=? ORDER BY date DESC, id DESC").bind(prev).all()).results;
  const allExpenses = (await env.DB.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC").all()).results;
  return json({ month, previousMonth: prev, people, budgets, loan, prepayments, expenses, previousExpenses, allExpenses });
}

async function saveExpense(env, x) {
  await env.DB.prepare(`INSERT INTO expenses(id,date,month,paid_by,amount,category,payment,description,reimburse)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET date=excluded.date, month=excluded.month, paid_by=excluded.paid_by, amount=excluded.amount, category=excluded.category, payment=excluded.payment, description=excluded.description, reimburse=excluded.reimburse`)
    .bind(x.id, x.date, x.month, x.paid_by, x.amount, x.category, x.payment, x.description, x.reimburse || "No").run();
  return json({ ok: true });
}
async function deleteExpense(env, id) { await env.DB.prepare("DELETE FROM expenses WHERE id=?").bind(id).run(); return json({ ok: true }); }
async function clearMonth(env, month) { await env.DB.prepare("DELETE FROM expenses WHERE month=?").bind(month).run(); return json({ ok: true }); }

async function saveBudget(env, b) {
  if (b.id) await env.DB.prepare("UPDATE budgets SET name=?, monthly_budget=? WHERE id=?").bind(b.name, b.monthly_budget, b.id).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO budgets(name,monthly_budget) VALUES (?,?)").bind(b.name, b.monthly_budget).run();
  return json({ ok: true });
}
async function deleteBudget(env, id) { await env.DB.prepare("DELETE FROM budgets WHERE id=?").bind(id).run(); return json({ ok: true }); }

async function savePartner(env, p) {
  await env.DB.batch([
    env.DB.prepare("UPDATE people SET name=?, monthly_income=? WHERE code='A'").bind(p.aName || "A", p.incomeA || 0),
    env.DB.prepare("UPDATE people SET name=?, monthly_income=? WHERE code='P'").bind(p.pName || "P", p.incomeP || 0)
  ]);
  return json({ ok: true });
}
async function saveLoan(env, l) {
  await env.DB.prepare("UPDATE loan SET original=?, balance=?, emi=?, rate=? WHERE id=1").bind(l.original || 0, l.balance || 0, l.emi || 0, l.rate || 0).run();
  return json({ ok: true });
}
async function savePrepay(env, p) {
  if (p.id) await env.DB.prepare("UPDATE prepayments SET name=?, amount=?, frequency=? WHERE id=?").bind(p.name, p.amount, p.frequency, p.id).run();
  else {
    await env.DB.prepare("INSERT INTO prepayments(name,amount,frequency) VALUES (?,?,?)").bind(p.name, p.amount, p.frequency).run();
    await env.DB.prepare("INSERT OR IGNORE INTO budgets(name,monthly_budget) VALUES (?,?)").bind(p.name, p.amount).run();
  }
  return json({ ok: true });
}
async function deletePrepay(env, id) { await env.DB.prepare("DELETE FROM prepayments WHERE id=?").bind(id).run(); return json({ ok: true }); }

async function reset(env) {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS people"), env.DB.prepare("DROP TABLE IF EXISTS budgets"),
    env.DB.prepare("DROP TABLE IF EXISTS expenses"), env.DB.prepare("DROP TABLE IF EXISTS loan"),
    env.DB.prepare("DROP TABLE IF EXISTS prepayments")
  ]);
  await createSchema(env); await seedIfNeeded(env);
  return json({ ok: true });
}

async function seedDemo(env) {
  const count = await env.DB.prepare("SELECT COUNT(*) c FROM expenses").first("c");
  if (count > 0) return json({ ok: true, skipped: true });
  const rows = [
    ["2026-05-02","A",42000,"Compulsory Expenses","May essentials","UPI"],
    ["2026-05-03","P",52700,"Home Loan EMI","May EMI","Bank Transfer"],
    ["2026-05-05","A",80000,"Home Loan Prepayment","May prepayment","Bank Transfer"],
    ["2026-05-08","P",25000,"Kids Supplies","Kids monthly supplies","UPI"],
    ["2026-05-10","A",16000,"Blinkit Wallet","Blinkit wallet","UPI"],
    ["2026-05-12","P",16000,"Amazon Wallet","Amazon wallet","Card"],
    ["2026-05-15","A",10000,"Travel","Travel","UPI"],
    ["2026-05-20","P",8500,"Outing","Outing","Card"],
    ["2026-06-02","A",35000,"Compulsory Expenses","June essentials","UPI"],
    ["2026-06-03","P",52700,"Home Loan EMI","June EMI","Bank Transfer"],
    ["2026-06-05","A",80000,"Home Loan Prepayment","June prepayment","Bank Transfer"],
    ["2026-06-08","P",6000,"Kids Supplies","School supplies","UPI"],
    ["2026-06-12","A",5500,"Groceries","Groceries","UPI"]
  ];
  for (let i=0;i<rows.length;i++) {
    const r = rows[i], date = r[0];
    await env.DB.prepare("INSERT INTO expenses(id,date,month,paid_by,amount,category,description,payment,reimburse) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(Date.now()+i, date, date.slice(0,7), r[1], r[2], r[3], r[4], r[5], "No").run();
  }
  return json({ ok: true });
}

function previousMonth(ym) { const d = new Date(ym + "-01T00:00:00"); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); }
