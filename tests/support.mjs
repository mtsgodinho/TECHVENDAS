import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite(),
  admin = "00000000-0000-0000-0000-000000000001",
  seller = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
let thread;
const sql = (f) =>
  readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
async function actor(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
const rpc = async (s, args = []) => (await db.query(s, args)).rows[0];
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(sql("setup.sql"));
  await db.exec(
    `insert into auth.users values('${admin}','admin@techvendas.invalid'),('${seller}','seller@techvendas.invalid'),('${other}','other@techvendas.invalid');insert into public.profiles(id,auth_user_id,username,full_name,role) values('${admin}','${admin}','admin','Admin','admin'),('${seller}','${seller}','seller','Bianca','attendant'),('${other}','${other}','other','Outra','attendant');`,
  );
});
after(() => db.close());
test("vendedor inicia chamado e mensagens reutilizam um único atendimento aberto", async () => {
  await actor(seller);
  thread = (
    await rpc("select public.support_send('Preciso de ajuda',null) as id")
  ).id;
  const next = await rpc(
    "select public.support_send('Outra mensagem',null) as id",
  );
  assert.equal(next.id, thread);
  assert.equal(
    (await db.query("select * from public.support_messages")).rows.length,
    2,
  );
  await assert.rejects(rpc("select public.support_send(' ',null)"));
  await assert.rejects(
    rpc("select public.support_send($1,null)", ["a".repeat(2001)]),
  );
});
test("outro vendedor não lê nem responde nem marca como lido", async () => {
  await actor(other);
  assert.equal(
    (await db.query("select * from public.support_messages")).rows.length,
    0,
  );
  assert.deepEqual(
    (await rpc("select public.support_list() as list")).list,
    [],
  );
  await assert.rejects(
    rpc("select public.support_send('Invasão',$1)", [thread]),
  );
  await assert.rejects(rpc("select public.support_read($1,999999)", [thread]));
  await assert.rejects(rpc("select public.support_close($1)", [thread]));
});
test("administrador recebe notificação, lê e responde; vendedor recebe aviso", async () => {
  await actor(admin);
  assert.equal((await rpc("select public.support_unread() as n")).n, 2);
  let list = (await rpc("select public.support_list() as list")).list;
  assert.equal(list[0].full_name, "Bianca");
  assert.equal(list[0].unread, 2);
  await rpc("select public.support_read($1,99999)", [thread]);
  assert.equal((await rpc("select public.support_unread() as n")).n, 0);
  await rpc("select public.support_send('Olá, vou ajudar',$1)", [thread]);
  await actor(seller);
  assert.equal((await rpc("select public.support_unread() as n")).n, 1);
  await rpc("select public.support_read($1,99999)", [thread]);
  assert.equal((await rpc("select public.support_unread() as n")).n, 0);
});
test("finalização preserva mensagens e bloqueia novos envios; novo chamado separado", async () => {
  await actor(admin);
  await rpc("select public.support_close($1)", [thread]);
  assert.equal(
    (await rpc("select public.support_list(true) as list")).list.length,
    1,
  );
  await assert.rejects(
    rpc("select public.support_send('Depois',$1)", [thread]),
  );
  await actor(seller);
  assert.equal(
    (await db.query("select * from public.support_messages")).rows.length,
    3,
  );
  await assert.rejects(
    rpc("select public.support_send('Depois',$1)", [thread]),
  );
  const next = (
    await rpc("select public.support_send('Nova dúvida',null) as id")
  ).id;
  assert.notEqual(next, thread);
});
test("sem escrita direta, migração repetível e contas inativas bloqueadas", async () => {
  await actor(seller);
  await assert.rejects(
    db.query("update public.support_threads set status='closed'"),
  );
  await assert.rejects(
    db.query(
      "insert into public.support_messages(thread_id,sender_id,body) values($1,$2,'Falsa')",
      [thread, admin],
    ),
  );
  await db.exec("reset role");
  await db.exec(sql("007_support.sql"));
  await db.query("update public.profiles set is_active=false where id=$1", [
    seller,
  ]);
  await actor(seller);
  assert.equal(
    (await db.query("select * from public.support_messages")).rows.length,
    0,
  );
  await assert.rejects(rpc("select public.support_send('Oi',null)"));
  await db.exec("reset role;set role anon");
  await assert.rejects(rpc("select public.support_list()"));
});
