import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite(),
  admin = "00000000-0000-0000-0000-000000000001",
  seller = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
let lead;
const sql = (file) =>
  readFileSync(new URL("../supabase/" + file, import.meta.url), "utf8");
async function actor(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function save(amount, status = "sold") {
  return db.query(`select public.save_lead($1,$2,'',null,null,null,$3)`, [
    lead,
    status,
    amount,
  ]);
}
async function summary() {
  return (await db.query("select public.finance_summary() as data")).rows[0]
    .data;
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(sql("setup.sql"));
  await db.exec(
    `insert into auth.users values('${admin}','admin@techvendas.invalid'),('${seller}','seller@techvendas.invalid'),('${other}','other@techvendas.invalid');insert into public.profiles(id,auth_user_id,username,full_name,role) values('${admin}','${admin}','admin','Admin','admin'),('${seller}','${seller}','seller','Seller','attendant'),('${other}','${other}','other','Other','attendant');`,
  );
  await actor(admin);
  await db.query(`select public.import_leads($1::jsonb)`, [
    JSON.stringify([
      { name: "Contato", phone: "5511999999999", source: "Outro" },
    ]),
  ]);
  lead = (await db.query("select id from public.leads")).rows[0].id;
  await db.query("select public.release_leads($1,1,array[$2]::uuid[],false)", [
    seller,
    lead,
  ]);
});
after(() => db.close());
test("migração é repetível", async () => {
  await db.exec("reset role");
  await db.exec(sql("005_finance.sql"));
});
test("valor obrigatório e sem efeitos parciais", async () => {
  await actor(seller);
  for (const v of [null, 0, -1, 1.001, "NaN", 1000000000])
    await assert.rejects(save(v));
  assert.equal(
    (await db.query("select status from public.leads where id=$1", [lead]))
      .rows[0].status,
    "pending",
  );
});
test("venda gera faturamento e comissão fixa atomicamente", async () => {
  await save(149.9);
  let s = await summary();
  assert.equal(s.revenue, 149.9);
  assert.equal(s.commission, 20);
  assert.equal(s.sales, 1);
  await assert.rejects(save(200));
});
test("outro vendedor não recebe valores alheios", async () => {
  await actor(other);
  let s = await summary();
  assert.equal(s.commission, 0);
  assert.equal(s.sales, 0);
  await assert.rejects(save(200));
});
test("admin corrige sem duplicar, cancela e reabre com uma comissão", async () => {
  await actor(admin);
  await save(200);
  await save(200);
  assert.equal((await summary()).commission, 20);
  assert.equal((await summary()).revenue, 200);
  await save(null, "lost");
  assert.equal((await summary()).commission, 0);
  await save(300);
  assert.equal((await summary()).revenue, 300);
  assert.equal((await summary()).commission, 20);
});
test("escrita financeira direta negada", async () => {
  await actor(seller);
  await assert.rejects(db.query("update public.sales set commission=999"));
  await assert.rejects(
    db.query(
      "insert into public.sales(lead_id,seller_id,amount) values($1,$2,1)",
      [lead, seller],
    ),
  );
});
