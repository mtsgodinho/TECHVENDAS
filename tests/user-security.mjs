import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001",
  seller = "00000000-0000-0000-0000-000000000002",
  fresh = "00000000-0000-0000-0000-000000000003";
let activeId, soldId;
async function actor(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const file of [
    "001_initial.sql",
    "002_workflows.sql",
    "003_seller_batches.sql",
  ])
    await db.exec(
      readFileSync(new URL("../supabase/" + file, import.meta.url), "utf8"),
    );
  await db.exec(
    `insert into auth.users values ('${admin}','admin@techvendas.invalid'),('${seller}','atendente@techvendas.invalid');insert into public.profiles(id,full_name,role) values ('${admin}','Admin','admin'),('${seller}','Vendedor','attendant');`,
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/004_user_management.sql", import.meta.url),
      "utf8",
    ),
  );
});
after(() => db.close());
test("migração preserva usuários existentes e bloqueia promoção direta", async () => {
  await actor(admin);
  const p = (
    await db.query("select * from public.profiles where id=$1", [seller])
  ).rows[0];
  assert.equal(p.username, "atendente");
  assert.equal(p.auth_user_id, seller);
  assert.equal(p.is_active, true);
  await actor(seller);
  assert.equal(
    (await db.query("select * from public.profiles")).rows.length,
    1,
  );
  await assert.rejects(
    db.query("update public.profiles set role='admin' where id=$1", [seller]),
  );
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'atendente','Nome','admin',true)",
      [seller],
    ),
  );
  await assert.rejects(
    db.query("select public.admin_archive_user($1)", [admin]),
  );
});
test("administrador cadastra somente identidades existentes e com nome correspondente", async () => {
  await actor(admin);
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'novo','Novo','attendant',true)",
      [fresh],
    ),
  );
  await db.exec("reset role;");
  await db.query("insert into auth.users values ($1,$2)", [
    fresh,
    "novo@techvendas.invalid",
  ]);
  await actor(admin);
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'diferente','Novo','attendant',true)",
      [fresh],
    ),
  );
  await db.query(
    "select public.admin_save_user($1,'novo','Novo vendedor','attendant',true)",
    [fresh],
  );
  assert.equal(
    (
      await db.query("select full_name from public.profiles where id=$1", [
        fresh,
      ])
    ).rows[0].full_name,
    "Novo vendedor",
  );
});
test("protege o próprio acesso administrativo e valida renomeação", async () => {
  await actor(admin);
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'admin','Admin','attendant',true)",
      [admin],
    ),
  );
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'admin','Admin','admin',false)",
      [admin],
    ),
  );
  await assert.rejects(
    db.query("select public.admin_archive_user($1)", [admin]),
  );
  await db.exec("reset role;");
  await db.query("update auth.users set email=$1 where id=$2", [
    "bianca@techvendas.invalid",
    fresh,
  ]);
  await actor(admin);
  await db.query(
    "select public.admin_save_user($1,'bianca','Bianca','attendant',true)",
    [fresh],
  );
  assert.equal(
    (
      await db.query("select username from public.profiles where id=$1", [
        fresh,
      ])
    ).rows[0].username,
    "bianca",
  );
});
test("desativação bloqueia sessões antigas, consultas e recebimento de lotes", async () => {
  await actor(admin);
  await db.query(
    "select public.admin_save_user($1,'bianca','Bianca','attendant',false)",
    [fresh],
  );
  await actor(fresh);
  for (const table of [
    "profiles",
    "leads",
    "batches",
    "assignments",
    "lead_history",
  ])
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
    );
  await actor(admin);
  await db.query("select public.import_leads($1::jsonb)", [
    JSON.stringify([
      { name: "Contato A", phone: "5511988881111" },
      { name: "Contato B", phone: "5511988882222" },
    ]),
  ]);
  await assert.rejects(db.query("select public.release_leads($1)", [fresh]));
  await db.query(
    "select public.admin_save_user($1,'bianca','Bianca','attendant',true)",
    [fresh],
  );
  const result = (
    await db.query("select public.release_leads($1,2) as result", [fresh])
  ).rows[0].result;
  assert.equal(result.released, 2);
  await actor(fresh);
  const rows = (await db.query("select * from public.leads order by name"))
    .rows;
  activeId = rows[0].id;
  soldId = rows[1].id;
  await db.query(
    "select public.save_lead($1,'contacted','Manter observação')",
    [activeId],
  );
  await db.query("select public.save_lead($1,'sold','Venda preservada')", [
    soldId,
  ]);
});
test("usuário com lotes ativos precisa recolher a fila antes de mudar perfil ou desativar", async () => {
  await actor(admin);
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'bianca','Bianca','admin',true)",
      [fresh],
    ),
  );
  await assert.rejects(
    db.query(
      "select public.admin_save_user($1,'bianca','Bianca','attendant',false)",
      [fresh],
    ),
  );
});
test("exclusão bloqueia o acesso e preserva contatos, vendas e histórico", async () => {
  await actor(admin);
  const result = (
    await db.query("select public.admin_archive_user($1) as result", [fresh])
  ).rows[0].result;
  assert.equal(result.returned, 1);
  assert.equal(result.auth_user_id, fresh);
  const active = (
    await db.query("select * from public.leads where id=$1", [activeId])
  ).rows[0];
  assert.equal(active.assigned_to, null);
  assert.equal(active.status, "pending");
  assert.equal(active.notes, "Manter observação");
  const sold = (
    await db.query("select * from public.leads where id=$1", [soldId])
  ).rows[0];
  assert.equal(sold.status, "sold");
  assert.equal(sold.assigned_to, fresh);
  const historyCount = (
    await db.query("select count(*)::int n from public.lead_history")
  ).rows[0].n;
  assert.ok(historyCount >= 4);
  await actor(fresh);
  for (const table of [
    "profiles",
    "leads",
    "batches",
    "assignments",
    "lead_history",
  ])
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
    );
  await assert.rejects(
    db.query("select public.save_lead($1,'contacted','Acesso antigo')", [
      activeId,
    ]),
  );
  await actor(admin);
  assert.equal(
    (await db.query("select public.admin_archive_user($1) result", [fresh]))
      .rows[0].result.returned,
    0,
  );
  await db.exec("reset role;");
  await db.query("delete from auth.users where id=$1", [fresh]);
  assert.equal(
    (
      await db.query("select auth_user_id from public.profiles where id=$1", [
        fresh,
      ])
    ).rows[0].auth_user_id,
    null,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.lead_history")).rows[0]
      .n,
    historyCount,
  );
  await actor(admin);
  assert.equal(
    (await db.query("select count(*)::int n from public.leads")).rows[0].n,
    2,
  );
});
test("funções administrativas rejeitam anônimos e migração é repetível", async () => {
  await db.exec("reset role;set role anon;");
  await assert.rejects(
    db.query("select public.admin_archive_user($1)", [seller]),
  );
  await assert.rejects(
    db.query("select public.admin_save_user($1,'admin','Admin','admin',true)", [
      admin,
    ]),
  );
  await db.exec("reset role;");
  await db.exec(
    readFileSync(
      new URL("../supabase/004_user_management.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.leads")).rows[0].n,
    2,
  );
});
test("instalador completo permite provisionar o primeiro administrador sem perder o vínculo Auth", async () => {
  const freshDb = new PGlite();
  try {
    await freshDb.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    await freshDb.exec(
      readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
    );
    await freshDb.query("insert into auth.users values ($1,$2),($3,$4)", [
      admin,
      "bootstrap_admin@techvendas.invalid",
      seller,
      "bootstrap_seller@techvendas.invalid",
    ]);
    await freshDb.exec(
      readFileSync(
        new URL("../supabase/provision_profiles.sql", import.meta.url),
        "utf8",
      )
        .replace("SUBSTITUA_USUARIO_ADMIN", "bootstrap_admin")
        .replace("SUBSTITUA_USUARIO_ATENDENTE", "bootstrap_seller"),
    );
    await freshDb.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    assert.equal(
      (await freshDb.query("select public.is_admin() as allowed")).rows[0]
        .allowed,
      true,
    );
    const imported = (
      await freshDb.query("select public.import_leads($1::jsonb) as result", [
        JSON.stringify([{ name: "Novo lead", phone: "5511988883333" }]),
      ])
    ).rows[0].result;
    assert.equal(imported.imported, 1);
  } finally {
    await freshDb.close();
  }
});
