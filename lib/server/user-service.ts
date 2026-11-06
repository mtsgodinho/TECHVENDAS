import type { SupabaseClient, createClient } from "@supabase/supabase-js";
import { loginAddress } from "../username.ts";
type Connect = (
  url: string,
  key: string,
  options?: Parameters<typeof createClient>[2],
) => SupabaseClient;
type Config = { url?: string; publicKey?: string; adminKey?: string };
class Failure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const fields =
  "id,auth_user_id,username,full_name,role,is_active,deleted_at,created_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function databaseError(error: { code?: string; message?: string }): never {
  if (error.code === "P0001")
    throw new Failure(409, error.message || "Operação não permitida.");
  if (error.code === "23405")
    throw new Failure(409, "Esse nome de usuário já está em uso.");
  if (["PGRST202", "42703", "PGRST204"].includes(error.code || ""))
    throw new Failure(
      503,
      "Aplique a atualização 004_user_management.sql no Supabase para ativar a gestão de usuários.",
    );
  throw new Failure(
    500,
    "Não foi possível atualizar os usuários. Tente novamente.",
  );
}
function authError(error: { code?: string; message?: string }): never {
  if (
    ["email_exists", "user_already_exists"].includes(error.code || "") ||
    /already.*registered/i.test(error.message || "")
  )
    throw new Failure(409, "Esse nome de usuário já está em uso.");
  throw new Failure(
    400,
    "Não foi possível salvar o acesso no Supabase. Confira os dados e os requisitos de senha.",
  );
}
async function readInput(request: Request) {
  const text = await request.text();
  if (text.length > 16000) throw new Failure(413, "Dados muito extensos.");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Failure(400, "Dados inválidos.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Failure(400, "Dados inválidos.");
  return body as Record<string, unknown>;
}
function validated(body: Record<string, unknown>, create: boolean) {
  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  let email;
  try {
    email = loginAddress(username);
  } catch {
    throw new Failure(
      400,
      "Use um usuário de 3 a 32 caracteres, começando com uma letra, sem espaços ou acentos.",
    );
  }
  const name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (
    !name ||
    name.length > 100 ||
    !["admin", "attendant"].includes(String(body.role))
  )
    throw new Failure(400, "Informe nome e perfil válidos.");
  if (body.is_active !== undefined && typeof body.is_active !== "boolean")
    throw new Failure(400, "Situação do acesso inválida.");
  const password =
    body.password === undefined || body.password === ""
      ? undefined
      : body.password;
  if (
    (create && !password) ||
    (password !== undefined &&
      (typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128))
  )
    throw new Failure(400, "A senha deve ter de 8 a 128 caracteres.");
  if (!create && (typeof body.id !== "string" || !uuid.test(body.id)))
    throw new Failure(400, "Usuário inválido.");
  return {
    id: body.id as string | undefined,
    username,
    email,
    full_name: name,
    role: body.role as "admin" | "attendant",
    is_active: body.is_active !== false,
    password: password as string | undefined,
  };
}
export function createUserHandlers(
  connect: Connect,
  configuration: () => Config,
) {
  async function authorize(request: Request) {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new Failure(401, "Entre na sua conta para continuar.");
    const c = configuration();
    if (!c.url || !c.publicKey)
      throw new Failure(503, "Autenticação não configurada.");
    const caller = connect(c.url, c.publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: identity, error: identityError } =
      await caller.auth.getUser(token);
    if (identityError || !identity.user)
      throw new Failure(401, "Sua sessão expirou. Entre novamente.");
    const { data: profile, error } = await caller
      .from("profiles")
      .select("id,role,is_active,deleted_at")
      .eq("id", identity.user.id)
      .single();
    if (error) {
      if (["42703", "PGRST204"].includes(error.code)) databaseError(error);
      throw new Failure(403, "Acesso restrito ao administrador.");
    }
    if (profile?.role !== "admin" || !profile.is_active || profile.deleted_at)
      throw new Failure(403, "Acesso restrito ao administrador.");
    if (!c.adminKey)
      throw new Failure(
        503,
        "Configure TECHVENDAS_SUPABASE_ADMIN_KEY como segredo do servidor para ativar a gestão de usuários.",
      );
    const admin = connect(c.url, c.adminKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    return { caller, admin, actor: identity.user.id };
  }
  function wrap(action: (request: Request) => Promise<unknown>) {
    return async (request: Request) => {
      try {
        return Response.json(await action(request), {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        const known = error instanceof Failure;
        return Response.json(
          {
            error: known
              ? error.message
              : "Não foi possível concluir a operação. Tente novamente.",
          },
          {
            status: known ? error.status : 500,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    };
  }
  return {
    GET: wrap(async (request) => {
      const { caller } = await authorize(request);
      const url = new URL(request.url);
      const page = Math.max(
        0,
        Math.min(100000, Number(url.searchParams.get("page")) || 0),
      );
      const archived = url.searchParams.get("archived") === "true";
      let q = caller.from("profiles").select(fields, { count: "exact" });
      q = archived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 30, page * 30 + 29);
      if (error) databaseError(error);
      return { users: data, total: count || 0 };
    }),
    POST: wrap(async (request) => {
      const ctx = await authorize(request);
      const input = validated(await readInput(request), true);
      const { data, error } = await ctx.admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.full_name },
      });
      if (error) authError(error);
      if (!data.user)
        throw new Failure(500, "Não foi possível criar o acesso.");
      const { data: profile, error: profileError } = await ctx.caller.rpc(
        "admin_save_user",
        {
          p_id: data.user.id,
          p_username: input.username,
          p_name: input.full_name,
          p_role: input.role,
          p_active: input.is_active,
        },
      );
      if (profileError) {
        const rollback = await ctx.admin.auth.admin.deleteUser(data.user.id);
        if (rollback.error)
          throw new Failure(
            500,
            "Não foi possível finalizar o cadastro. Verifique o novo acesso no Supabase antes de tentar novamente.",
          );
        databaseError(profileError);
      }
      return { user: profile };
    }),
    PATCH: wrap(async (request) => {
      const ctx = await authorize(request);
      const input = validated(await readInput(request), false);
      const id = input.id!;
      if (id === ctx.actor && (input.role !== "admin" || !input.is_active))
        throw new Failure(
          409,
          "Você não pode remover seu próprio acesso administrativo.",
        );
      const { data: existing, error: readError } = await ctx.caller
        .from("profiles")
        .select(fields)
        .eq("id", id)
        .single();
      if (readError || !existing || existing.deleted_at)
        throw new Failure(404, "Usuário não encontrado.");
      let oldEmail: string | undefined;
      let renamed = false;
      if (existing.username !== input.username) {
        const { data, error } = await ctx.admin.auth.admin.getUserById(id);
        if (error || !data.user?.email)
          throw new Failure(404, "Acesso de autenticação não encontrado.");
        oldEmail = data.user.email;
        const updated = await ctx.admin.auth.admin.updateUserById(id, {
          email: input.email,
          email_confirm: true,
        });
        if (updated.error) authError(updated.error);
        renamed = true;
      }
      const { data: profile, error } = await ctx.caller.rpc("admin_save_user", {
        p_id: id,
        p_username: input.username,
        p_name: input.full_name,
        p_role: input.role,
        p_active: input.is_active,
      });
      if (error) {
        if (renamed) {
          const rollback = await ctx.admin.auth.admin.updateUserById(id, {
            email: oldEmail,
            email_confirm: true,
          });
          if (rollback.error)
            throw new Failure(
              500,
              "Não foi possível finalizar a edição. Verifique o nome de usuário no Supabase.",
            );
        }
        databaseError(error);
      }
      if (input.password) {
        const result = await ctx.admin.auth.admin.updateUserById(id, {
          password: input.password,
        });
        if (result.error)
          return {
            user: profile,
            warning:
              "Os dados foram atualizados, mas a senha não foi alterada. Edite o usuário e tente redefinir a senha novamente.",
          };
      }
      return { user: profile };
    }),
    DELETE: wrap(async (request) => {
      const ctx = await authorize(request);
      const body = await readInput(request);
      if (typeof body.id !== "string" || !uuid.test(body.id))
        throw new Failure(400, "Usuário inválido.");
      if (body.id === ctx.actor)
        throw new Failure(409, "Você não pode excluir seu próprio acesso.");
      const { data, error } = await ctx.caller.rpc("admin_archive_user", {
        p_id: body.id,
      });
      if (error) databaseError(error);
      if (data.auth_user_id) {
        const removed = await ctx.admin.auth.admin.deleteUser(
          data.auth_user_id,
        );
        if (removed.error)
          return {
            deleted: true,
            returned: data.returned,
            warning:
              "O acesso aos dados foi bloqueado. A exclusão no serviço de autenticação ficou pendente; use Concluir exclusão em Acessos excluídos.",
          };
      }
      return { deleted: true, returned: data.returned };
    }),
  };
}
