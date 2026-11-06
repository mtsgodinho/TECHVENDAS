import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { rankFor, rankingRange } from "../lib/ranking.ts";
const db = new PGlite(),
  admin = "00000000-0000-0000-0000-000000000001",
  seller = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
const sql = (f) =>
  readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
async function actor(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function board(
  from = "2026-11-01T00:00:00-03:00",
  until = "2026-12-01T00:00:00-03:00",
) {
  return (
    await db.query("select public.seller_ranking($1,$2) as data", [from, until])
  ).rows[0].data;
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(sql("setup.sql"));
  await db.exec(`insert into auth.users values('${admin}','admin@techvendas.invalid'),('${seller}','seller@techvendas.invalid'),('${other}','other@techvendas.invalid');insert into public.profiles(id,auth_user_id,username,full_name,role) values('${admin}','${admin}','admin','Admin','admin'),('${seller}','${seller}','seller','Bianca','attendant'),('${other}','${other}','other','Outra','attendant');
insert into public.leads(name,phone,status,assigned_to,sale_amount) select 'Lead '||i,'55119'||lpad(i::text,8,'0'),'sold',case when i<=27 then '${seller}'::uuid else '${other}'::uuid end,100 from generate_series(1,37)i;
insert into public.sales(lead_id,seller_id,amount,sold_at) select id,assigned_to,100,case when name in ('Lead 1','Lead 28') then '2026-11-06T03:00:00Z'::timestamptz when name='Lead 2' then '2026-11-07T03:00:00Z'::timestamptz else '2026-10-01T00:00:00Z'::timestamptz end from public.leads;`);
});
after(() => db.close());
test("limiares de patentes e progresso", () => {
  for (const [n, name] of [
    [0, "Bronze"],
    [9, "Bronze"],
    [10, "Prata"],
    [24, "Prata"],
    [25, "Ouro"],
    [49, "Ouro"],
    [50, "Platina"],
    [99, "Platina"],
    [100, "Diamante"],
  ])
    assert.equal(rankFor(n).current.name, name);
  assert.equal(rankFor(100).next, null);
});
test("períodos Brasília, segunda-feira e intervalo personalizado inclusivo", () => {
  assert.deepEqual(
    rankingRange("daily", "", "", new Date("2026-11-06T02:00:00Z")),
    { from: "2026-11-05T00:00:00-03:00", until: "2026-11-06T00:00:00-03:00" },
  );
  assert.equal(
    rankingRange("weekly", "", "", new Date("2026-11-08T15:00:00Z")).from,
    "2026-11-02T00:00:00-03:00",
  );
  assert.equal(
    rankingRange("monthly", "", "", new Date("2026-12-15T15:00Z")).until,
    "2027-01-01T00:00:00-03:00",
  );
  assert.equal(
    rankingRange("custom", "2026-11-06", "2026-11-06").until,
    "2026-11-07T00:00:00-03:00",
  );
  assert.throws(() => rankingRange("custom", "2026-02-30", "2026-03-01"));
});
test("ranking diário exclui início do dia seguinte e respeita empates", async () => {
  await actor(seller);
  const b = await board(
    "2026-11-06T00:00:00-03:00",
    "2026-11-07T00:00:00-03:00",
  );
  assert.equal(b.period_sales, 2);
  assert.equal(b.rows[0].position, 1);
  assert.equal(b.rows[1].position, 1);
  assert.equal(b.self.total_sales, 27);
  assert.equal(b.self.period_sales, 1);
  assert.equal(JSON.stringify(b).includes("amount"), false);
  assert.equal(JSON.stringify(b).includes("commission"), false);
});
test("ranking mensal, cancelamento e venda fora do período preservam patente acumulada", async () => {
  await actor(admin);
  let b = await board();
  assert.equal(b.period_sales, 3);
  assert.equal(b.rows[0].id, seller);
  assert.equal(b.rows[0].period_sales, 2);
  await db.exec("reset role");
  await db.query(
    "update public.sales set cancelled_at=now() where lead_id=(select id from public.leads where name='Lead 1')",
  );
  await actor(seller);
  b = await board();
  assert.equal(b.self.total_sales, 26);
  assert.equal(b.self.period_sales, 1);
  assert.equal(b.rows[0].position, b.rows[1].position);
});
test("anonimos, inativos, períodos inválidos e migração repetida", async () => {
  await assert.rejects(board("2026-12-01", "2026-11-01"));
  await db.exec("reset role");
  await db.exec(sql("008_rankings.sql"));
  await db.query("update public.profiles set is_active=false where id=$1", [
    seller,
  ]);
  await actor(seller);
  await assert.rejects(board());
  await db.exec("reset role;set role anon");
  await assert.rejects(board());
});
