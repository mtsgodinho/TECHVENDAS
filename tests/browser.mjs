// UI integration tests: all Supabase requests are intercepted. No real users/leads are created.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const executable =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: executable,
  headless: true,
  args: ["--no-sandbox"],
});
const adminId = "00000000-0000-0000-0000-000000000001",
  attendantId = "00000000-0000-0000-0000-000000000002";
const now = "2026-11-05T15:00:00.000Z";
const profiles = [
  { id: adminId, full_name: "Admin de teste", role: "admin" },
  { id: attendantId, full_name: "Atendente de teste", role: "attendant" },
  {
    id: "00000000-0000-0000-0000-000000000003",
    full_name: "Outro vendedor",
    role: "attendant",
  },
];
const requests = [];
async function setup(role) {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const userId = role === "admin" ? adminId : attendantId;
  const managed = profiles.map((p) => ({
    ...p,
    auth_user_id: p.id,
    username:
      p.id === adminId ? "admin" : p.id === attendantId ? "atendente" : "outro",
    is_active: true,
    deleted_at: null,
    created_at: now,
  }));
  await page.route("**/api/admin/users?**", async (route) => {
    const method = route.request().method(),
      url = new URL(route.request().url()),
      body = route.request().postDataJSON() || {};
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (role !== "admin")
      return reply({ error: "Acesso restrito ao administrador." }, 403);
    if (method === "GET") {
      const rows = managed.filter((u) =>
        url.searchParams.get("archived") === "true"
          ? u.deleted_at
          : !u.deleted_at,
      );
      return reply({ users: rows, total: rows.length });
    }
    if (method === "POST") {
      const user = {
        id: "00000000-0000-0000-0000-000000000004",
        auth_user_id: "00000000-0000-0000-0000-000000000004",
        username: body.username,
        full_name: body.full_name,
        role: body.role,
        is_active: body.is_active,
        deleted_at: null,
        created_at: now,
      };
      managed.push(user);
      return reply({ user });
    }
    const user = managed.find((u) => u.id === body.id);
    if (method === "PATCH") {
      Object.assign(user, {
        username: body.username,
        full_name: body.full_name,
        role: body.role,
        is_active: body.is_active,
      });
      return reply({ user });
    }
    user.deleted_at = now;
    user.is_active = false;
    user.auth_user_id = null;
    return reply({ deleted: true, returned: 0 });
  });

  const make = (id, name, assigned_to, status = "pending") => ({
    id,
    name,
    phone: `55119${String(id).padStart(8, "0")}`,
    source: "Teste realizado",
    campaign: "Campanha de teste",
    source_date: null,
    status,
    assigned_to,
    batch_id: assigned_to ? "00000000-0000-0000-0000-000000000010" : null,
    returned_at: null,
    follow_up_at: null,
    notes: "",
    created_at: now,
    updated_at: now,
  });
  const leads = [
    {
      ...make("1", "Contato no estoque", null),
      source_date: "2026-01-10T12:00:00.000Z",
    },
    make("2", "Contato ativo", attendantId),
    make("3", "Oportunidade interessada", attendantId, "interested"),
    make("4", "Lead sem data", null),
    make("80", "Venda concluída", attendantId, "sold"),
    {
      ...make(
        "99",
        "Fila outro vendedor",
        "00000000-0000-0000-0000-000000000003",
      ),
      batch_id: "00000000-0000-0000-0000-000000000011",
    },
  ];
  const history = [];
  const recalledIds = new Set();
  const originalAssignments = new Map(
    leads
      .filter((l) => l.assigned_to)
      .map((l) => [l.id, { seller: l.assigned_to, batch: l.batch_id }]),
  );
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method();
    const body = route.request().postDataJSON() || {};
    const response = (data, status = 200, extra = {}) =>
      route.fulfill({
        status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range",
          ...extra,
        },
        body: status === 204 ? undefined : JSON.stringify(data),
      });
    if (method === "OPTIONS")
      return response(null, 204, { "access-control-allow-headers": "*" });
    if (path === "/auth/v1/token") {
      assert.equal(body.email, `${role}@techvendas.invalid`);
      if (body.password === "wrong-password")
        return response(
          {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          },
          400,
        );
      const encoded = (x) =>
        Buffer.from(JSON.stringify(x)).toString("base64url");
      const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.test-signature`;
      return response({
        access_token: token,
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: userId,
          email: `${role}@techvendas.invalid`,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "email" },
          user_metadata: {},
          created_at: now,
        },
      });
    }
    if (path === "/auth/v1/logout") return response(null, 204);
    if (path === "/auth/v1/user")
      return response({
        id: userId,
        email: `${role}@techvendas.invalid`,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
      });
    if (path === "/rest/v1/profiles") {
      let data =
        role === "admin" ? profiles : profiles.filter((p) => p.id === userId);
      if (url.searchParams.has("id"))
        data = data.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
      return response(
        route.request().headers().accept?.includes("object") ? data[0] : data,
      );
    }
    const visible = () =>
      leads.filter((l) => role === "admin" || l.assigned_to === userId);
    if (path === "/rest/v1/batches") {
      const data = [
        {
          id: "00000000-0000-0000-0000-000000000010",
          created_at: now,
          attendant_id: attendantId,
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          created_at: now,
          attendant_id: "00000000-0000-0000-0000-000000000003",
        },
        {
          id: "00000000-0000-0000-0000-000000000012",
          created_at: now,
          attendant_id: attendantId,
        },
      ];
      if (role !== "admin") {
        assert.ok(
          url.searchParams.get("select").includes("assignments!inner(id)"),
        );
        assert.equal(
          url.searchParams.get("assignments.attendant_id"),
          `eq.${userId}`,
        );
        assert.equal(url.searchParams.get("assignments.ended_at"), "is.null");
        return response(
          data.filter(
            (b) =>
              b.attendant_id === userId &&
              leads.some(
                (l) =>
                  l.batch_id === b.id &&
                  l.assigned_to === userId &&
                  !["sold", "lost", "no_response"].includes(l.status),
              ),
          ),
        );
      }
      return response(data);
    }
    if (path === "/rest/v1/leads") {
      let data = visible();
      for (const [key, value] of url.searchParams) {
        if (key === "assigned_to") {
          if (value === "is.null")
            data = data.filter((l) => l.assigned_to === null);
          if (value.startsWith("eq."))
            data = data.filter((l) => l.assigned_to === value.slice(3));
          if (value === "not.is.null")
            data = data.filter((l) => l.assigned_to !== null);
        }
        if (key === "batch_id" && value.startsWith("eq."))
          data = data.filter((l) => l.batch_id === value.slice(3));
        if (key === "returned_at" && value === "is.null")
          data = data.filter((l) => l.returned_at === null);
        if (key === "status") {
          if (value.startsWith("eq."))
            data = data.filter((l) => l.status === value.slice(3));
          if (value.startsWith("in."))
            data = data.filter((l) => value.includes(l.status));
          if (value.startsWith("not.in."))
            data = data.filter((l) => !value.includes(l.status));
        }
      }
      for (const [key, value] of url.searchParams) {
        if (key === "source_date" && value.startsWith("gte."))
          data = data.filter(
            (l) =>
              l.source_date &&
              new Date(l.source_date) >= new Date(value.slice(4)),
          );
        if (key === "source_date" && value.startsWith("lt."))
          data = data.filter(
            (l) =>
              l.source_date &&
              new Date(l.source_date) < new Date(value.slice(3)),
          );
      }
      const order = url.searchParams.get("order") || "";
      if (order.startsWith("source_date.")) {
        const ascending = order.startsWith("source_date.asc");
        data = [...data].sort((a, b) =>
          !a.source_date && !b.source_date
            ? 0
            : !a.source_date
              ? 1
              : !b.source_date
                ? -1
                : (new Date(a.source_date) - new Date(b.source_date)) *
                  (ascending ? 1 : -1),
        );
      }
      const total = data.length,
        offset = Number(url.searchParams.get("offset") || 0),
        limit = Number(url.searchParams.get("limit") || 1000);
      data = data.slice(offset, offset + limit);
      return response(data, 200, {
        "content-range": `${offset}-${Math.max(offset, offset + data.length - 1)}/${total}`,
      });
    }
    if (path === "/rest/v1/lead_history")
      return response(
        history
          .filter(
            (h) =>
              (!url.searchParams.has("lead_id") ||
                url.searchParams.get("lead_id") === `eq.${h.lead_id}`) &&
              visible().some((l) => l.id === h.lead_id),
          )
          .map((h) => ({
            ...h,
            leads: { name: leads.find((l) => l.id === h.lead_id)?.name },
          })),
      );
    if (path === "/rest/v1/rpc/seller_batches") {
      const batchIds = [
        ...new Set(
          [...originalAssignments.values()]
            .filter((a) => a.seller === body.p_seller)
            .map((a) => a.batch),
        ),
      ];
      return response(
        batchIds
          .map((batch) => {
            const rows = leads.filter(
              (l) =>
                originalAssignments.get(l.id)?.seller === body.p_seller &&
                originalAssignments.get(l.id)?.batch === batch,
            );
            const current = rows.filter(
              (l) => l.batch_id === batch && !recalledIds.has(l.id),
            );
            return {
              batch_id: batch,
              created_at: now,
              total: rows.length,
              active: current.filter(
                (l) =>
                  l.assigned_to === body.p_seller &&
                  !["sold", "lost", "no_response"].includes(l.status),
              ).length,
              recalled: rows.filter((l) => recalledIds.has(l.id)).length,
              transferred: 0,
              statuses: Object.fromEntries(
                [
                  "pending",
                  "contacted",
                  "interested",
                  "follow_up",
                  "no_response",
                  "sold",
                  "lost",
                ].map((status) => [
                  status,
                  current.filter((l) => l.status === status).length,
                ]),
              ),
            };
          })
          .slice(
            body.p_offset || 0,
            (body.p_offset || 0) + (body.p_limit || 20),
          ),
      );
    }
    if (path === "/rest/v1/rpc/recall_batch") {
      requests.push({ name: "recall", body });
      const rows = leads.filter(
        (l) =>
          l.assigned_to === body.p_seller &&
          l.batch_id === body.p_batch &&
          !["sold", "lost", "no_response"].includes(l.status),
      );
      for (const l of rows) {
        recalledIds.add(l.id);
        Object.assign(l, {
          assigned_to: null,
          batch_id: null,
          status: "pending",
        });
      }
      return response({ recalled: rows.length });
    }
    if (path === "/rest/v1/rpc/finance_summary") {
      return response({
        revenue: 300,
        commission: 40,
        sales: 2,
        legacy_sales: 0,
        sellers: [
          {
            seller_id: attendantId,
            full_name: "Atendente de teste",
            sales: 2,
            revenue: 300,
            commission: 40,
          },
        ],
      });
    }
    if (path === "/rest/v1/rpc/dashboard") {
      const v = visible();
      return response({
        total: v.length,
        stock: v.filter((l) => !l.assigned_to).length,
        assigned: v.filter(
          (l) => l.assigned_to && !["sold", "lost"].includes(l.status),
        ).length,
        statuses: Object.fromEntries(
          [
            "pending",
            "contacted",
            "interested",
            "follow_up",
            "no_response",
            "sold",
            "lost",
          ].map((s) => [s, v.filter((l) => l.status === s).length]),
        ),
        worked: history.length,
        worked_today: history.length,
        worked_week: history.length,
        sales: v.filter((l) => l.status === "sold").length,
      });
    }
    if (path === "/rest/v1/rpc/import_leads") {
      requests.push({ name: "import", body });
      let imported = 0,
        duplicates = 0;
      for (const r of body.p_rows) {
        if (leads.some((l) => l.phone === r.phone)) {
          duplicates++;
          continue;
        }
        leads.push({ ...make(String(leads.length + 1), r.name, null), ...r });
        imported++;
      }
      return response({ imported, duplicates, invalid: 0 });
    }
    if (path === "/rest/v1/rpc/release_leads") {
      requests.push({ name: "release", body });
      const stock = leads
        .filter(
          (l) =>
            !l.assigned_to &&
            l.status === "pending" &&
            (!body.p_ids || body.p_ids.includes(l.id)),
        )
        .slice(0, body.p_quantity);
      for (const l of stock) {
        l.assigned_to = body.p_attendant;
        l.batch_id = "00000000-0000-0000-0000-000000000010";
        originalAssignments.set(l.id, {
          seller: l.assigned_to,
          batch: l.batch_id,
        });
      }
      return response({
        released: stock.length,
        batch_id: "00000000-0000-0000-0000-000000000010",
      });
    }
    if (path === "/rest/v1/rpc/save_lead") {
      requests.push({ name: "save", body });
      const l = leads.find((l) => l.id === body.p_id);
      history.unshift({
        id: String(history.length + 1),
        lead_id: l.id,
        actor_id: userId,
        old_status: l.status,
        new_status: body.p_status,
        notes: body.p_notes,
        event_type: "update",
        created_at: now,
      });
      Object.assign(l, {
        status: body.p_status,
        notes: body.p_notes,
        follow_up_at: body.p_follow_up,
        updated_at: now,
      });
      if (l.status === "no_response") {
        l.assigned_to = null;
        l.returned_at = now;
      }
      return response(null);
    }
    return response({ message: "Unexpected test route " + path }, 500);
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
  await page.getByLabel("Usuário", { exact: true }).fill(role);
  await page.getByLabel("Senha", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Não foi possível entrar",
  );
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await page.getByRole("button", { name: "Atualizar dados" }).waitFor();
  await expect(page.locator(".notice[role=alert]")).toHaveCount(0);
  return { context, page, errors, leads };
}
try {
  const { context, page, errors, leads } = await setup("admin");
  await expect(page.getByRole("region", { name: "Financeiro" })).toContainText(
    "R$ 300,00",
  );
  await expect(page.locator(".digital-panel")).toHaveCount(4);
  await expect(page.locator(".digital-panel-value").first()).toHaveText("6");
  await expect(
    page.getByRole("heading", { name: "Últimas atividades", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".instrument-dial")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Visão geral." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar CSV", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "maria.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Nome;Telefone;Campanha;Data\nNovo contato;11988887777;Maria;05/11/2026 23:59\nContato no estoque;11900000001;Maria;05/11/2026\nInválido;123;Maria;05/11/2026",
    ),
  });
  await expect(
    page.getByText("2 válidos · 0 duplicados no arquivo · 1 inválidos.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar 2 leads para o estoque" })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "1 importados · 1 duplicados · 1 inválidos",
  );
  await page
    .getByRole("button", { name: "Estoque de leads", exact: true })
    .click();
  await expect(page.locator(".digital-panel")).toHaveCount(0);
  await expect(page.locator(".lead-card h3").first()).toHaveText(
    "Novo contato",
  );
  await expect(page.locator(".lead-card h3").last()).toHaveText(
    "Lead sem data",
  );
  await page
    .getByLabel("Ordem de liberação", { exact: true })
    .selectOption("oldest");
  await expect(page.locator(".lead-card h3").first()).toHaveText(
    "Contato no estoque",
  );
  await expect(page.locator(".filter-panel input[type=date]")).toHaveCount(0);
  await page
    .getByLabel("Ordem de liberação", { exact: true })
    .selectOption({ label: "Mais novos para mais antigos" });
  await expect(page.locator(".lead-card h3").first()).toHaveText(
    "Novo contato",
  );
  await page
    .getByLabel("Ordem de liberação", { exact: true })
    .selectOption({ label: "Mais antigos para mais novos" });
  await expect(page.locator(".lead-card h3").first()).toHaveText(
    "Contato no estoque",
  );
  await page.getByLabel("Quantidade", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Liberar 1 leads", exact: true })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "1 leads liberados",
  );
  assert.equal(requests.find((r) => r.name === "release").body.p_quantity, 1);
  assert.deepEqual(requests.find((r) => r.name === "release").body.p_ids, [
    "1",
  ]);
  console.log(
    "Estoque: calendários substituídos pelo seletor, ambas as ordens de data e liberação do lead mais antigo passaram.",
  );
  await page
    .getByRole("button", { name: "Fila de atendimento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir contato", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption("follow_up");
  await page
    .getByLabel("Retorno agendado (horário de Brasília)")
    .fill("2026-12-01T14:00");
  await page
    .getByLabel("Observações", { exact: true })
    .fill("Cliente pediu retorno amanhã.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Contato salvo com sucesso",
  );
  assert.equal(
    requests.find((r) => r.name === "save").body.p_follow_up,
    "2026-12-01T17:00:00.000Z",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  assert.match((await download).suggestedFilename(), /^techvendas-.*\.csv$/);
  await page
    .getByLabel("Vendedor", { exact: true })
    .selectOption("00000000-0000-0000-0000-000000000003");
  await expect(page.locator(".seller-batch")).toHaveCount(1);
  await expect(page.locator(".lead-card h3")).toHaveText("Fila outro vendedor");
  await page.getByLabel("Vendedor", { exact: true }).selectOption(attendantId);
  await expect(page.locator(".seller-batch")).toHaveCount(1);
  await expect(page.locator(".seller-batch")).toContainText(
    "Venda realizada: 1",
  );
  await expect(page.locator(".seller-batch")).toContainText("3 na fila");
  await expect(
    page.getByRole("heading", { name: "Fila outro vendedor", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver fila deste lote" }).click();
  await expect(page.locator(".lead-card")).toHaveCount(3);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Retirar lote da fila" }).click();
  assert.equal(requests.filter((r) => r.name === "recall").length, 0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retirar lote da fila" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "3 contatos retirados",
  );
  await expect(page.locator(".seller-batch")).toContainText("0 na fila");
  await expect(page.locator(".seller-batch")).toContainText("Retirados: 3");
  await expect(page.locator(".lead-card")).toHaveCount(0);
  assert.equal(leads.find((l) => l.id === "80").status, "sold");
  assert.equal(leads.find((l) => l.id === "80").assigned_to, attendantId);
  assert.equal(
    leads.find((l) => l.id === "99").assigned_to,
    "00000000-0000-0000-0000-000000000003",
  );
  console.log(
    "Fila: seleção de vendedor, lotes/status, confirmação e retirada sem apagar vendas passaram.",
  );
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await expect(page.locator(".digital-panel")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Criar usuário", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("Novo Vendedor");
  await page
    .getByRole("dialog")
    .getByLabel("Usuário", { exact: true })
    .fill("vendedor_novo");
  await page
    .getByRole("dialog")
    .getByLabel("Senha", { exact: true })
    .fill("test-new-password");
  await page
    .getByRole("button", { name: "Salvar usuário", exact: true })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Usuário criado",
  );
  const userCard = page
    .locator(".user-card")
    .filter({ hasText: "Novo Vendedor" });
  await userCard
    .getByRole("button", { name: "Editar usuário", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("Vendedor Editado");
  await page
    .getByRole("dialog")
    .getByLabel("Usuário", { exact: true })
    .fill("vendedor_editado");
  await page
    .getByRole("dialog")
    .getByLabel("Nova senha (opcional)", { exact: true })
    .fill("test-updated-password");
  await page
    .getByRole("button", { name: "Salvar usuário", exact: true })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Usuário atualizado",
  );
  await expect(
    page
      .locator(".user-card")
      .filter({ hasText: "Admin de teste" })
      .getByRole("button", { name: "Excluir acesso" }),
  ).toBeDisabled();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".user-card")
    .filter({ hasText: "Vendedor Editado" })
    .getByRole("button", { name: "Excluir acesso" })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Acesso excluído",
  );
  await expect(
    page.locator(".user-card").filter({ hasText: "Vendedor Editado" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Mostrar usuários", { exact: true })
    .selectOption("archived");
  await expect(
    page.locator(".user-card").filter({ hasText: "Vendedor Editado" }),
  ).toHaveCount(1);
  console.log(
    "Usuários: criação, edição, redefinição de senha, exclusão com confirmação e preservação do histórico passaram.",
  );
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("heading", { name: "Visão geral." }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    console.log(`Admin: layout ${width}px sem overflow.`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const expectedReadouts = [
    leads.length,
    leads.filter((l) => !l.assigned_to).length,
    leads.filter((l) => l.assigned_to && !["sold", "lost"].includes(l.status))
      .length,
    leads.filter((l) => l.status === "sold").length,
  ];
  for (let i = 0; i < 4; i++)
    await expect(page.locator(".digital-panel-value").nth(i)).toHaveText(
      expectedReadouts[i].toLocaleString("pt-BR"),
    );
  await page.screenshot({ path: "/tmp/techvendas-admin.png", fullPage: true });
  console.log(
    "Painel: números reais estáticos na visão geral, sem velocímetros nem feed de atividades.",
  );
  assert.deepEqual(errors, []);
  await context.close();
  const attendant = await setup("attendant");
  const p = attendant.page;
  await expect(
    p.getByRole("button", { name: "Usuários", exact: true }),
  ).toHaveCount(0);
  await expect(p.getByLabel("Vendedor", { exact: true })).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Importar CSV", exact: true }),
  ).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Estoque de leads", exact: true }),
  ).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Exportar CSV", exact: true }),
  ).toHaveCount(0);
  const batchOptions = await p
    .getByLabel("Filtrar por lote", { exact: true })
    .locator("option")
    .evaluateAll((options) => options.map((o) => o.value));
  assert.deepEqual(batchOptions, ["", "00000000-0000-0000-0000-000000000010"]);
  console.log(
    "Atendente: lote retirado e lote de outro vendedor não aparecem no filtro.",
  );
  await p.getByRole("button", { name: "Abrir contato" }).first().click();
  await p
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption("sold");
  await expect(p.getByLabel("Valor da venda (R$)")).toBeVisible();
  await p.getByLabel("Valor da venda (R$)").fill("149.90");
  await p
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption("no_response");
  await expect(p.getByLabel("Valor da venda (R$)")).toHaveCount(0);
  await p
    .getByLabel("Observações", { exact: true })
    .fill("Não respondeu ao contato.");
  await p.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(p.locator(".notice[role=status]")).toContainText(
    "Contato salvo",
  );
  await expect(
    p.getByRole("heading", { name: "Contato ativo", exact: true }),
  ).toHaveCount(0);
  await p
    .getByLabel("Filtrar por lote", { exact: true })
    .selectOption("00000000-0000-0000-0000-000000000010");
  for (const lead of attendant.leads) {
    if (
      lead.assigned_to === attendantId &&
      !["sold", "lost", "no_response"].includes(lead.status)
    )
      Object.assign(lead, {
        assigned_to: null,
        batch_id: null,
        status: "pending",
      });
  }
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(p.getByLabel("Filtrar por lote", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    p.getByLabel("Filtrar por lote", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(p.locator(".lead-card")).toHaveCount(0);
  console.log(
    "Atendente: retirada do lote selecionado limpa o filtro e remove contatos após atualizar.",
  );
  await p.getByRole("button", { name: "Sair", exact: true }).click();
  await p.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
  assert.deepEqual(attendant.errors, []);
  await attendant.context.close();
  console.log(
    "UI passou: login e erro, CSV/mapeamento, liberação, agendamento, exportação, perfis, devolução e logout. Supabase interceptado; nenhum dado remoto foi alterado.",
  );
} finally {
  await browser.close();
}
