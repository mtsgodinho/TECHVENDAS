import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
);
await db.exec(
  readFileSync(new URL("../supabase/001_initial.sql", import.meta.url), "utf8"),
);
const admin = "00000000-0000-0000-0000-000000000001",
  attendant = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
await db.exec(
  `insert into auth.users values ('${admin}'),('${attendant}'),('${other}'); insert into public.profiles(id,full_name,role) values ('${admin}','Admin','admin'),('${attendant}','Atendente','attendant'),('${other}','Outra','attendant'); insert into public.leads(name,phone,assigned_to) values ('Estoque','5511999999999',null),('Meu lead','5511988888888','${attendant}'),('Outro lead','5511977777777','${other}');`,
);
async function asUser(id) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
await asUser(attendant);
assert.equal((await db.query("select * from public.leads")).rows.length, 1);
assert.equal((await db.query("select * from public.profiles")).rows.length, 1);
assert.equal(
  (
    await db.query(
      `update public.profiles set role='admin' where id='${attendant}' returning id`,
    )
  ).rows.length,
  0,
);
assert.equal(
  (await db.query("update public.leads set notes='forbidden' returning id"))
    .rows.length,
  0,
);
await assert.rejects(
  db.exec(
    "insert into public.leads(name,phone) values ('forbidden','5511966666666')",
  ),
);
await asUser(admin);
assert.equal((await db.query("select * from public.leads")).rows.length, 3);
await db.exec(
  "update public.leads set status='contacted',notes='Tentativa' where name='Meu lead'",
);
assert.equal(
  (await db.query("select * from public.lead_history")).rows.length,
  1,
);
await asUser(attendant);
assert.equal(
  (await db.query("select * from public.lead_history")).rows.length,
  1,
);
await asUser(admin);
await db.exec(
  "update public.leads set status='no_response', assigned_to=null,returned_at=now() where name='Meu lead'",
);
await asUser(attendant);
assert.equal((await db.query("select * from public.leads")).rows.length, 0);
assert.equal(
  (await db.query("select * from public.lead_history")).rows.length,
  0,
);
await db.exec("reset role; set role anon;");
await assert.rejects(db.query("select * from public.leads"));
console.log(
  "11 verificações passaram: migração, isolamento, estoque, promoção de perfil, escrita, histórico, devolução e acesso anônimo.",
);
await db.close();
