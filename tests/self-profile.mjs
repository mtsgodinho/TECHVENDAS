import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite(),
  seller = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
const sql = (f) =>
  readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
async function actor(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(sql("setup.sql"));
  await db.exec(
    `insert into auth.users values('${seller}','seller@techvendas.invalid'),('${other}','other@techvendas.invalid');insert into public.profiles(id,auth_user_id,username,full_name,role) values('${seller}','${seller}','seller','Seller','attendant'),('${other}','${other}','other','Other','attendant');`,
  );
});
after(() => db.close());
test("próprio nome e foto sem promoção ou alteração alheia", async () => {
  await actor(seller);
  await db.query("select public.update_my_profile($1,$2)", [
    " Bianca ",
    "data:image/jpeg;base64,/9j/2Q==",
  ]);
  const p = (await db.query("select * from public.profiles")).rows[0];
  assert.equal(p.full_name, "Bianca");
  assert.equal(p.role, "attendant");
  assert.equal(p.username, "seller");
  assert.match(p.avatar_url, /^data:image\/jpeg/);
  await assert.rejects(db.query("update public.profiles set role='admin'"));
  await db.exec("reset role");
  assert.equal(
    (
      await db.query("select full_name from public.profiles where id=$1", [
        other,
      ])
    ).rows[0].full_name,
    "Other",
  );
});
test("rejeita nomes inválidos, SVG, URL externa e foto grande", async () => {
  await actor(seller);
  for (const [name, photo] of [
    ["", null],
    ["x".repeat(101), null],
    ["Bianca", "https://example.com/x"],
    ["Bianca", "data:image/svg+xml;base64,AAAA"],
    ["Bianca", "data:image/jpeg;base64," + "A".repeat(65000)],
  ])
    await assert.rejects(
      db.query("select public.update_my_profile($1,$2)", [name, photo]),
    );
  await db.query("select public.update_my_profile('Bianca',null)");
  assert.equal(
    (await db.query("select avatar_url from public.profiles")).rows[0]
      .avatar_url,
    null,
  );
});
test("desativados e anônimos não editam e migração é repetível", async () => {
  await db.exec("reset role");
  await db.exec(sql("006_self_profile.sql"));
  await db.query("update public.profiles set is_active=false where id=$1", [
    seller,
  ]);
  await actor(seller);
  await assert.rejects(
    db.query("select public.update_my_profile('Nome',null)"),
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query("select public.update_my_profile('Nome',null)"),
  );
});
