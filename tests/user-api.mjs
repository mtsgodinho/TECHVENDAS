import { test } from "node:test";
import assert from "node:assert/strict";
import { createUserHandlers } from "../lib/server/user-service.ts";
const adminId = "00000000-0000-0000-0000-000000000001",
  sellerId = "00000000-0000-0000-0000-000000000002",
  newId = "00000000-0000-0000-0000-000000000003";
function fixture({ role = "admin", configured = true } = {}) {
  const profiles = [
    {
      id: adminId,
      auth_user_id: adminId,
      username: "admin",
      full_name: "Admin",
      role,
      is_active: true,
      deleted_at: null,
      created_at: "2026-01-01",
    },
    {
      id: sellerId,
      auth_user_id: sellerId,
      username: "bianca",
      full_name: "Bianca",
      role: "attendant",
      is_active: true,
      deleted_at: null,
      created_at: "2026-01-01",
    },
  ];
  const auth = new Map(
    profiles.map((p) => [
      p.id,
      {
        id: p.id,
        email: p.username + "@techvendas.invalid",
        password: "previous-password",
      },
    ]),
  );
  const state = {
    rpcError: null,
    deleteFail: false,
    privateConnections: 0,
    created: null,
  };
  class Query {
    constructor() {
      this.filters = [];
    }
    select() {
      return this;
    }
    eq(k, v) {
      this.filters.push((p) => p[k] === v);
      return this;
    }
    is(k, v) {
      this.filters.push((p) => p[k] === v);
      return this;
    }
    not(k, _op, v) {
      this.filters.push((p) => p[k] !== v);
      return this;
    }
    order() {
      return this;
    }
    async single() {
      const data = profiles.find((p) => this.filters.every((f) => f(p)));
      return { data, error: data ? null : { code: "PGRST116" } };
    }
    async range() {
      const data = profiles.filter((p) => this.filters.every((f) => f(p)));
      return { data, count: data.length, error: null };
    }
  }
  const caller = {
    auth: {
      getUser: async (token) => ({
        data: { user: token === "valid-admin" ? { id: adminId } : null },
        error: token === "valid-admin" ? null : {},
      }),
    },
    from: () => new Query(),
    rpc: async (name, args) => {
      if (state.rpcError) return { data: null, error: state.rpcError };
      if (name === "admin_save_user") {
        let p = profiles.find((p) => p.id === args.p_id);
        if (!p) {
          p = {
            id: args.p_id,
            auth_user_id: args.p_id,
            deleted_at: null,
            created_at: "2026-01-01",
          };
          profiles.push(p);
        }
        Object.assign(p, {
          username: args.p_username,
          full_name: args.p_name,
          role: args.p_role,
          is_active: args.p_active,
        });
        return { data: { ...p }, error: null };
      }
      const p = profiles.find((p) => p.id === args.p_id);
      p.deleted_at = "2026-11-05";
      p.is_active = false;
      return {
        data: { auth_user_id: p.auth_user_id, returned: 2 },
        error: null,
      };
    },
  };
  const privileged = {
    auth: {
      admin: {
        createUser: async (args) => {
          state.created = args;
          if ([...auth.values()].some((u) => u.email === args.email))
            return { data: { user: null }, error: { code: "email_exists" } };
          const user = { id: newId, ...args };
          auth.set(newId, user);
          return { data: { user }, error: null };
        },
        deleteUser: async (id) => {
          if (state.deleteFail) return { error: {} };
          auth.delete(id);
          const p = profiles.find((p) => p.id === id);
          if (p) p.auth_user_id = null;
          return { error: null };
        },
        getUserById: async (id) => ({
          data: { user: auth.get(id) },
          error: null,
        }),
        updateUserById: async (id, updates) => {
          Object.assign(auth.get(id), updates);
          return { data: { user: auth.get(id) }, error: null };
        },
      },
    },
  };
  const connect = (_url, key) => {
    if (key === "private-key") {
      state.privateConnections++;
      return privileged;
    }
    return caller;
  };
  const handlers = createUserHandlers(connect, () => ({
    url: "https://project.supabase.co",
    publicKey: "public-key",
    adminKey: configured ? "private-key" : undefined,
  }));
  const req = (method, body, token = "valid-admin") =>
    new Request("http://example.test/api/admin/users", {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { handlers, req, state, profiles, auth };
}
const input = {
  username: "bianca_nova",
  full_name: "Bianca Nova",
  role: "attendant",
  password: "safe-test-password",
  is_active: true,
};
test("API rejeita anônimos, token inválido e vendedor antes de acessar chave privada", async () => {
  for (const [options, token, status] of [
    [{}, null, 401],
    [{}, "bad", 401],
    [{ role: "attendant" }, "valid-admin", 403],
  ]) {
    const f = fixture(options);
    const r = await f.handlers.POST(f.req("POST", input, token));
    assert.equal(r.status, status);
    assert.equal(f.state.privateConnections, 0);
  }
});
test("API informa configuração ausente somente ao administrador autenticado", async () => {
  const f = fixture({ configured: false });
  const r = await f.handlers.GET(f.req("GET"));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /TECHVENDAS_SUPABASE_ADMIN_KEY/);
});
test("criação usa identificador interno, confirma acesso e nunca retorna senha", async () => {
  const f = fixture();
  const r = await f.handlers.POST(f.req("POST", input));
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(input.password));
  assert.ok(!text.includes("private-key"));
  assert.equal(f.state.created.email, "bianca_nova@techvendas.invalid");
  assert.equal(f.state.created.email_confirm, true);
  assert.equal(f.profiles.find((p) => p.id === newId).role, "attendant");
});
test("falha no cadastro do perfil desfaz a criação na autenticação", async () => {
  const f = fixture();
  f.state.rpcError = { code: "P0001", message: "Operação recusada." };
  const r = await f.handlers.POST(f.req("POST", input));
  assert.equal(r.status, 409);
  assert.equal(f.auth.has(newId), false);
});
test("edição altera nome de acesso, perfil e senha com verificação do servidor", async () => {
  const f = fixture();
  const r = await f.handlers.PATCH(f.req("PATCH", { ...input, id: sellerId }));
  assert.equal(r.status, 200);
  assert.equal(f.auth.get(sellerId).email, "bianca_nova@techvendas.invalid");
  assert.equal(f.auth.get(sellerId).password, input.password);
  assert.equal(
    f.profiles.find((p) => p.id === sellerId).full_name,
    input.full_name,
  );
  const own = await f.handlers.PATCH(
    f.req("PATCH", { ...input, id: adminId, role: "attendant" }),
  );
  assert.equal(own.status, 409);
  const del = await f.handlers.DELETE(f.req("DELETE", { id: adminId }));
  assert.equal(del.status, 409);
});
test("falha de edição restaura o identificador anterior e mantém senha", async () => {
  const f = fixture();
  f.state.rpcError = { code: "P0001", message: "Retire os lotes ativos." };
  const r = await f.handlers.PATCH(f.req("PATCH", { ...input, id: sellerId }));
  assert.equal(r.status, 409);
  assert.equal(f.auth.get(sellerId).email, "bianca@techvendas.invalid");
  assert.equal(f.auth.get(sellerId).password, "previous-password");
});
test("exclusão remove credenciais, preserva perfil histórico e permite concluir falha parcial", async () => {
  const f = fixture();
  f.state.deleteFail = true;
  let r = await f.handlers.DELETE(f.req("DELETE", { id: sellerId }));
  assert.equal(r.status, 200);
  assert.ok((await r.json()).warning);
  assert.equal(f.profiles.find((p) => p.id === sellerId).is_active, false);
  assert.equal(f.auth.has(sellerId), true);
  f.state.deleteFail = false;
  r = await f.handlers.DELETE(f.req("DELETE", { id: sellerId }));
  assert.equal(r.status, 200);
  assert.equal(f.auth.has(sellerId), false);
  assert.equal(f.profiles.find((p) => p.id === sellerId).auth_user_id, null);
});
test("validação não permite senha fraca, perfil arbitrário ou email no lugar de usuário", async () => {
  for (const extra of [
    { password: "short" },
    { role: "owner" },
    { username: "user@email.com" },
    { full_name: "" },
  ]) {
    const f = fixture();
    const r = await f.handlers.POST(f.req("POST", { ...input, ...extra }));
    assert.equal(r.status, 400);
    assert.equal(f.state.created, null);
  }
});
