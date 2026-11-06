import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001",
  attendant = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
async function user(id) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function rpc(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
let ownId, ownUpdated, returnedId, firstBatch;
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const name of [
    "001_initial.sql",
    "002_workflows.sql",
    "003_seller_batches.sql",
  ])
    await db.exec(
      readFileSync(new URL("../supabase/" + name, import.meta.url), "utf8"),
    );
  await db.exec(
    `insert into auth.users values ('${admin}'),('${attendant}'),('${other}');insert into public.profiles(id,full_name,role) values ('${admin}','Admin','admin'),('${attendant}','Atendente','attendant'),('${other}','Outra','attendant');`,
  );
});
after(() => db.close());
test("importação normaliza telefone, preserva colunas extras e separa inválidos", async () => {
  await user(admin);
  const rows = Array.from({ length: 61 }, (_, i) => ({
    name: `Lead ${i}`,
    phone: `(11) 9${String(i).padStart(8, "0")}`,
    source: "Teste realizado",
    metadata: { extra: "preservado" },
  }));
  rows.push(
    { name: "Inválido", phone: "123" },
    { name: "", phone: "5511988877777" },
    {
      name: "Data inválida",
      phone: "5511988866666",
      source_date: "not-a-date",
    },
  );
  const r = await rpc("select public.import_leads($1::jsonb) result", [
    JSON.stringify(rows),
  ]);
  assert.deepEqual(r.result, { imported: 61, duplicates: 0, invalid: 3 });
  const sample = (
    await db.query("select * from public.leads order by name limit 1")
  ).rows[0];
  assert.equal(sample.assigned_to, null);
  assert.equal(sample.metadata.extra, "preservado");
  assert.equal(sample.status, "pending");
});
test("estoque é invisível para atendente; importação e liberação são negadas", async () => {
  await user(attendant);
  assert.equal((await db.query("select * from public.leads")).rows.length, 0);
  await assert.rejects(
    db.query("select public.import_leads($1::jsonb)", [JSON.stringify([])]),
  );
  await assert.rejects(
    db.query("select public.release_leads($1)", [attendant]),
  );
  assert.equal(
    (
      await db.query(
        `update public.profiles set role='admin' where id=$1 returning id`,
        [attendant],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into public.lead_history(lead_id,actor_id,new_status) values(gen_random_uuid(),$1,'sold')",
      [attendant],
    ),
  );
});
test("duas liberações não repetem leads; quantidade limitada a 50", async () => {
  await user(admin);
  await assert.rejects(
    db.query("select public.release_leads($1,51)", [attendant]),
  );
  const [a, b] = await Promise.all([
    rpc("select public.release_leads($1,50) result", [attendant]),
    rpc("select public.release_leads($1,50) result", [other]),
  ]);
  assert.equal(a.result.released, 50);
  assert.equal(b.result.released, 11);
  firstBatch = a.result.batch_id;
  const r = (
    await db.query(
      "select count(*)::int total,count(distinct lead_id)::int distinct_leads from public.assignments where ended_at is null",
    )
  ).rows[0];
  assert.equal(r.total, 61);
  assert.equal(r.distinct_leads, 61);
  assert.equal(
    (await rpc("select public.release_leads($1) result", [attendant])).result
      .released,
    0,
  );
});
test("RLS limita filas, lotes, atribuições e histórico por atendente", async () => {
  await user(attendant);
  const leads = (await db.query("select * from public.leads")).rows;
  assert.equal(leads.length, 50);
  ownId = leads[0].id;
  ownUpdated = leads[0].updated_at;
  assert.equal((await db.query("select * from public.batches")).rows.length, 1);
  assert.equal(
    (await db.query("select * from public.assignments")).rows.length,
    50,
  );
  assert.equal(
    (await db.query("select * from public.lead_history")).rows.length,
    50,
  );
  const metrics = (await rpc("select public.dashboard() result")).result;
  assert.equal(metrics.total, 50);
  assert.equal(metrics.stock, 0);
  assert.equal(metrics.worked, 0);
});
test("somente RPC permite mudanças; lead alheio e origem são protegidos", async () => {
  await user(attendant);
  await assert.rejects(
    db.query("update public.leads set notes='bypass' where id=$1", [ownId]),
  );
  await assert.rejects(
    db.query(
      "select public.save_lead($1,'contacted','tentativa',null,'origem indevida')",
      [ownId],
    ),
  );
  await user(other);
  await assert.rejects(
    db.query("select public.save_lead($1,'sold','indevido')", [ownId]),
  );
});
test("salvar observações e status registra autor; conflitos são detectados", async () => {
  await user(attendant);
  await db.query(
    "select public.save_lead($1,'contacted','Primeiro contato',null,null,$2)",
    [ownId, ownUpdated],
  );
  await assert.rejects(
    db.query(
      "select public.save_lead($1,'lost','versão antiga',null,null,$2)",
      [ownId, ownUpdated],
    ),
  );
  const h = (
    await db.query(
      "select * from public.lead_history where lead_id=$1 and event_type='update'",
      [ownId],
    )
  ).rows;
  assert.equal(h.length, 1);
  assert.equal(h[0].actor_id, attendant);
  assert.equal(h[0].old_status, "pending");
  assert.equal(h[0].new_status, "contacted");
  assert.equal(h[0].notes, "Primeiro contato");
});
test("retorno exige data; interessado e retorno ficam com a atendente", async () => {
  await user(attendant);
  await assert.rejects(
    db.query("select public.save_lead($1,'follow_up','Sem data')", [ownId]),
  );
  await db.query("select public.save_lead($1,'interested','Interessado')", [
    ownId,
  ]);
  await db.query(
    "select public.save_lead($1,'follow_up','Chamar depois','2026-12-01T14:00:00-03:00')",
    [ownId],
  );
  const r = (await db.query("select * from public.leads where id=$1", [ownId]))
    .rows[0];
  assert.equal(r.assigned_to, attendant);
  assert.equal(r.status, "follow_up");
  assert.equal(
    new Date(r.follow_up_at).toISOString(),
    "2026-12-01T17:00:00.000Z",
  );
  const m = (await rpc("select public.dashboard() result")).result;
  assert.equal(m.worked, 1);
  assert.equal(m.worked_today, 1);
  assert.equal(m.worked_week, 1);
});
test("sem resposta devolve lead, fecha atribuição e retira acesso", async () => {
  await user(attendant);
  await db.query("select public.save_lead($1,'no_response','Não respondeu')", [
    ownId,
  ]);
  assert.equal(
    (await db.query("select * from public.leads where id=$1", [ownId])).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query("select * from public.lead_history where lead_id=$1", [
        ownId,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select public.save_lead($1,'sold','Depois de devolver')", [
      ownId,
    ]),
  );
  await user(admin);
  const lead = (
    await db.query("select * from public.leads where id=$1", [ownId])
  ).rows[0];
  assert.equal(lead.assigned_to, null);
  assert.ok(lead.returned_at);
  assert.equal(lead.notes, "Não respondeu");
  returnedId = ownId;
  assert.ok(
    (
      await db.query(
        "select ended_at from public.assignments where lead_id=$1",
        [ownId],
      )
    ).rows[0].ended_at,
  );
});
test("devolvidos não entram em lote automático; nova liberação preserva histórico", async () => {
  await user(admin);
  assert.equal(
    (await rpc("select public.release_leads($1) result", [attendant])).result
      .released,
    0,
  );
  await assert.rejects(
    db.query("select public.release_leads($1,50,null,true)", [attendant]),
  );
  await assert.rejects(
    db.query("select public.save_lead($1,'pending','bypass')", [returnedId]),
  );
  const before = (
    await db.query("select * from public.lead_history where lead_id=$1", [
      returnedId,
    ])
  ).rows.length;
  const result = (
    await rpc("select public.release_leads($1,1,$2::uuid[],true) result", [
      attendant,
      [returnedId],
    ])
  ).result;
  assert.equal(result.released, 1);
  const lead = (
    await db.query("select * from public.leads where id=$1", [returnedId])
  ).rows[0];
  assert.equal(lead.status, "pending");
  assert.equal(lead.notes, "Não respondeu");
  assert.equal(lead.returned_at, null);
  assert.equal(
    (
      await db.query("select * from public.lead_history where lead_id=$1", [
        returnedId,
      ])
    ).rows.length,
    before + 1,
  );
});
test("reimportação mantém status, observações e histórico", async () => {
  await user(admin);
  const lead = (
    await db.query("select * from public.leads where id=$1", [ownId])
  ).rows[0];
  const h = (
    await db.query("select * from public.lead_history where lead_id=$1", [
      ownId,
    ])
  ).rows.length;
  const result = (
    await rpc("select public.import_leads($1::jsonb) result", [
      JSON.stringify([{ name: "Nome sobrescrito", phone: lead.phone }]),
    ])
  ).result;
  assert.equal(result.duplicates, 1);
  assert.equal(result.imported, 0);
  const after = (
    await db.query("select * from public.leads where id=$1", [ownId])
  ).rows[0];
  assert.equal(after.name, lead.name);
  assert.equal(after.notes, lead.notes);
  assert.equal(after.status, lead.status);
  assert.equal(
    (
      await db.query("select * from public.lead_history where lead_id=$1", [
        ownId,
      ])
    ).rows.length,
    h,
  );
});
test("venda finaliza atribuição, contabiliza e bloqueia edição pela atendente", async () => {
  await user(attendant);
  await db.query("select public.save_lead($1,'sold','Venda confirmada')", [
    ownId,
  ]);
  await assert.rejects(
    db.query("select public.save_lead($1,'pending','Reabrir')", [ownId]),
  );
  const metrics = (await rpc("select public.dashboard() result")).result;
  assert.equal(metrics.sales, 1);
  assert.equal(metrics.worked, 1);
  assert.equal(metrics.statuses.sold, 1);
  await user(admin);
  const active = (
    await db.query(
      "select * from public.assignments where lead_id=$1 and ended_at is null",
      [ownId],
    )
  ).rows.length;
  assert.equal(active, 0);
  const filtered = (
    await rpc("select public.dashboard(null,null,$1) result", [firstBatch])
  ).result;
  assert.equal(filtered.total, 49);
});
test("reatribuição administrativa preserva status e restringe o novo acesso", async () => {
  await user(attendant);
  const lead = (
    await db.query("select * from public.leads where status='pending' limit 1")
  ).rows[0];
  await assert.rejects(
    db.query("select public.transfer_lead($1,$2,$3)", [
      lead.id,
      other,
      lead.updated_at,
    ]),
  );
  await user(admin);
  await db.query("select public.transfer_lead($1,$2,$3)", [
    lead.id,
    other,
    lead.updated_at,
  ]);
  const updated = (
    await db.query("select * from public.leads where id=$1", [lead.id])
  ).rows[0];
  assert.equal(updated.status, "pending");
  assert.equal(updated.assigned_to, other);
  assert.equal(
    (
      await db.query(
        "select * from public.assignments where lead_id=$1 and ended_at is null",
        [lead.id],
      )
    ).rows.length,
    1,
  );
  await user(attendant);
  assert.equal(
    (await db.query("select * from public.leads where id=$1", [lead.id])).rows
      .length,
    0,
  );
  await user(other);
  assert.equal(
    (await db.query("select * from public.leads where id=$1", [lead.id])).rows
      .length,
    1,
  );
});
test("sem resposta como primeira ação conta como trabalho; perdido finaliza", async () => {
  await user(other);
  const leads = (
    await db.query("select * from public.leads where status='pending' limit 2")
  ).rows;
  await db.query(
    "select public.save_lead($1,'no_response','Primeira tentativa sem resposta')",
    [leads[0].id],
  );
  await user(admin);
  const activity = (
    await db.query(
      "select * from public.lead_history where lead_id=$1 and event_type='update'",
      [leads[0].id],
    )
  ).rows;
  assert.equal(activity.length, 1);
  await user(other);
  await db.query("select public.save_lead($1,'lost','Não tem interesse')", [
    leads[1].id,
  ]);
  await assert.rejects(
    db.query("select public.save_lead($1,'contacted','Reabrir')", [
      leads[1].id,
    ]),
  );
  const m = (await rpc("select public.dashboard() result")).result;
  assert.equal(m.statuses.lost, 1);
});
test("painel de vendedores resume lotes e recolhe somente contatos ativos", async () => {
  await user(admin);
  await db.query("select public.import_leads($1::jsonb)", [
    JSON.stringify(
      Array.from({ length: 6 }, (_, i) => ({
        name: `Recolher ${i}`,
        phone: `55119876543${String(i).padStart(2, "0")}`,
      })),
    ),
  ]);
  const targets = (
    await db.query(
      "select * from public.leads where name like 'Recolher %' order by name",
    )
  ).rows;
  const ids = targets.map((l) => l.id);
  const batch = (
    await rpc("select public.release_leads($1,6,$2::uuid[]) result", [
      attendant,
      ids,
    ])
  ).result.batch_id;
  await user(attendant);
  await db.query(
    "select public.save_lead($1,'interested','Interesse preservado')",
    [ids[1]],
  );
  await db.query(
    "select public.save_lead($1,'follow_up','Data preservada','2026-12-12T11:00:00-03:00')",
    [ids[2]],
  );
  await db.query("select public.save_lead($1,'sold','Venda preservada')", [
    ids[3],
  ]);
  await db.query("select public.save_lead($1,'lost','Perdido preservado')", [
    ids[4],
  ]);
  await assert.rejects(
    db.query("select * from public.seller_batches($1)", [attendant]),
  );
  await assert.rejects(
    db.query("select public.recall_batch($1,$2)", [batch, attendant]),
  );
  await user(admin);
  const moved = (
    await db.query("select * from public.leads where id=$1", [ids[5]])
  ).rows[0];
  await db.query("select public.transfer_lead($1,$2,$3)", [
    moved.id,
    other,
    moved.updated_at,
  ]);
  let summary = (
    await db.query("select * from public.seller_batches($1)", [attendant])
  ).rows.find((b) => b.batch_id === batch);
  assert.equal(Number(summary.total), 6);
  assert.equal(Number(summary.active), 3);
  assert.equal(Number(summary.transferred), 1);
  assert.equal(summary.statuses.sold, 1);
  assert.equal(summary.statuses.lost, 1);
  const countBefore = (
    await db.query("select count(*)::int n from public.leads")
  ).rows[0].n;
  const workedBefore = (await rpc("select public.dashboard() result")).result
    .worked;
  assert.equal(
    (await rpc("select public.recall_batch($1,$2) result", [batch, other]))
      .result.recalled,
    0,
  );
  const result = (
    await rpc("select public.recall_batch($1,$2) result", [batch, attendant])
  ).result;
  assert.equal(result.recalled, 3);
  const after = (
    await db.query(
      "select * from public.leads where id=any($1::uuid[]) order by name",
      [ids],
    )
  ).rows;
  for (const l of after.slice(0, 3)) {
    assert.equal(l.assigned_to, null);
    assert.equal(l.batch_id, null);
    assert.equal(l.status, "pending");
    assert.equal(l.returned_at, null);
  }
  assert.equal(after[1].notes, "Interesse preservado");
  assert.equal(after[2].notes, "Data preservada");
  assert.equal(
    new Date(after[2].follow_up_at).toISOString(),
    "2026-12-12T14:00:00.000Z",
  );
  assert.equal(after[3].status, "sold");
  assert.equal(after[3].assigned_to, attendant);
  assert.equal(after[4].status, "lost");
  assert.equal(after[5].assigned_to, other);
  assert.equal(
    (await db.query("select count(*)::int n from public.leads")).rows[0].n,
    countBefore,
  );
  assert.equal(
    (await rpc("select public.dashboard() result")).result.worked,
    workedBefore,
  );
  const audit = (
    await db.query(
      "select * from public.lead_history where lead_id=any($1::uuid[]) and event_type='recall'",
      [ids],
    )
  ).rows;
  assert.equal(audit.length, 3);
  assert.ok(audit.every((h) => h.actor_id === admin && h.batch_id === batch));
  summary = (
    await db.query("select * from public.seller_batches($1)", [attendant])
  ).rows.find((b) => b.batch_id === batch);
  assert.equal(Number(summary.active), 0);
  assert.equal(Number(summary.recalled), 3);
  assert.equal(summary.statuses.sold, 1);
  assert.equal(
    (await rpc("select public.recall_batch($1,$2) result", [batch, attendant]))
      .result.recalled,
    0,
  );
  const a = (
    await db.query(
      "select * from public.assignments where batch_id=$1 and end_reason='recalled'",
      [batch],
    )
  ).rows;
  assert.equal(a.length, 3);
  assert.ok(a.every((x) => x.ended_at));
  await user(attendant);
  for (const id of ids.slice(0, 3))
    assert.equal(
      (await db.query("select * from public.leads where id=$1", [id])).rows
        .length,
      0,
    );
  await assert.rejects(
    db.query("select public.save_lead($1,'sold','Após retirada')", [ids[0]]),
  );
  await user(admin);
  await assert.rejects(
    db.query("select * from public.seller_batches($1,-1)", [attendant]),
  );
});
test("anônimos não têm acesso a tabelas nem funções de escrita", async () => {
  await db.exec("reset role;set role anon;");
  for (const table of [
    "profiles",
    "leads",
    "batches",
    "assignments",
    "lead_history",
  ])
    await assert.rejects(db.query(`select * from public.${table}`));
  await assert.rejects(db.query("select public.import_leads('[]'::jsonb)"));
  await assert.rejects(
    db.query("select public.release_leads($1)", [attendant]),
  );
  await assert.rejects(db.query("select public.dashboard()"));
  await assert.rejects(
    db.query("select * from public.seller_batches($1)", [attendant]),
  );
  await assert.rejects(
    db.query("select public.recall_batch($1,$2)", [firstBatch, attendant]),
  );
});
