"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/crm";
type User = {
  id: string;
  auth_user_id: string | null;
  username: string | null;
  full_name: string;
  role: "admin" | "attendant";
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};
type Draft = {
  id?: string;
  username: string;
  full_name: string;
  role: "admin" | "attendant";
  is_active: boolean;
  password: string;
};
const blank: Draft = {
  username: "",
  full_name: "",
  role: "attendant",
  is_active: true,
  password: "",
};
export default function UserManagement({
  actor,
  onChanged,
}: {
  actor: string;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [archived, setArchived] = useState(false),
    [version, setVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useCallback(
    async (method: string, body?: unknown) => {
      if (!supabase) throw new Error("Autenticação não configurada.");
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Entre novamente para continuar.");
      const res = await fetch(
        `/api/admin/users?page=${page}&archived=${archived}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
        },
      );
      const result = await res.json();
      if (!res.ok)
        throw new Error(
          result.error || "Não foi possível concluir a operação.",
        );
      return result;
    },
    [page, archived],
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request("GET")
      .then((result) => {
        if (active) {
          setUsers(result.users);
          setTotal(result.total);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setUsers([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, version]);
  useEffect(() => {
    if (draft) dialog.current?.showModal();
  }, [draft?.id, Boolean(draft)]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request(draft.id ? "PATCH" : "POST", draft);
      const self = draft.id === actor;
      setDraft(null);
      setNotice(
        result.warning ||
          (draft.id ? "Usuário atualizado." : "Usuário criado."),
      );
      setVersion((v) => v + 1);
      onChanged();
      if (self) await supabase?.auth.refreshSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(user: User) {
    if (user.id === actor || busy) return;
    if (
      !window.confirm(
        `Excluir o acesso de ${user.full_name} (${user.username || "usuário"})?\n\nEle perderá acesso ao sistema. Os contatos ativos voltarão ao estoque; vendas e histórico serão preservados.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("DELETE", { id: user.id });
      setNotice(
        result.warning ||
          `Acesso excluído. ${result.returned || 0} contatos devolvidos ao estoque.`,
      );
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel user-management">
      <div className="section-heading">
        <div>
          <h2>Administrar usuários</h2>
          <p className="muted">
            Crie acessos por usuário e senha, edite os perfis e gerencie a
            equipe.
          </p>
        </div>
        <button
          onClick={() => {
            setError("");
            setDraft({ ...blank });
          }}
          disabled={busy}
        >
          Criar usuário
        </button>
      </div>
      <div className="filters">
        <label>
          Mostrar
          <select
            aria-label="Mostrar usuários"
            value={archived ? "archived" : "current"}
            onChange={(e) => {
              setArchived(e.target.value === "archived");
              setPage(0);
              setNotice("");
            }}
          >
            <option value="current">Acessos atuais</option>
            <option value="archived">Acessos excluídos</option>
          </select>
        </label>
      </div>
      {error && !draft && (
        <p className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="loading-inline" role="status">
          Carregando usuários…
        </p>
      ) : !users.length && !error ? (
        <p className="empty-state muted">Nenhum usuário nesta lista.</p>
      ) : (
        <div className="user-list">
          {users.map((user) => (
            <article className="user-card" key={user.id}>
              <div>
                <h3>
                  {user.full_name}
                  {user.id === actor && <span className="tag"> VOCÊ</span>}
                </h3>
                <p className="muted">
                  Usuário:{" "}
                  <strong>{user.username || "Cadastro anterior"}</strong> ·{" "}
                  {user.role === "admin" ? "Administrador" : "Vendedor"}
                </p>
                <span className="status-pill">
                  {user.deleted_at
                    ? "Excluído"
                    : user.is_active
                      ? "Ativo"
                      : "Inativo"}
                </span>
                <p className="footnote">
                  Criado em {formatDate(user.created_at)}
                </p>
              </div>
              <div className="user-actions">
                {!user.deleted_at ? (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setDraft({
                          id: user.id,
                          username: user.username || "",
                          full_name: user.full_name,
                          role: user.role,
                          is_active: user.is_active,
                          password: "",
                        });
                      }}
                    >
                      Editar usuário
                    </button>
                    <button
                      className="danger-button"
                      disabled={busy || user.id === actor}
                      onClick={() => remove(user)}
                      title={
                        user.id === actor
                          ? "Você não pode excluir seu próprio acesso."
                          : undefined
                      }
                    >
                      Excluir acesso
                    </button>
                  </>
                ) : user.auth_user_id ? (
                  <button
                    className="danger-button"
                    onClick={() => remove(user)}
                    disabled={busy}
                  >
                    Concluir exclusão
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <span className="muted">
          {total} usuários · Página {page + 1}
        </span>
        <button
          className="secondary"
          onClick={() => setPage((p) => p - 1)}
          disabled={!page || loading || busy}
        >
          Anterior
        </button>
        <button
          className="secondary"
          onClick={() => setPage((p) => p + 1)}
          disabled={(page + 1) * 30 >= total || loading || busy}
        >
          Próxima
        </button>
      </div>
      <p className="footnote">
        Excluir remove as credenciais de acesso. A identificação histórica é
        mantida para preservar vendas, lotes e registros de atendimento. Você
        não pode excluir ou desativar seu próprio acesso administrativo.
      </p>
      {draft && (
        <dialog
          ref={dialog}
          className="lead-dialog user-dialog"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) {
              setDraft(null);
              setError("");
            }
          }}
          aria-labelledby="user-dialog-title"
        >
          <div className="dialog-header">
            <h2 id="user-dialog-title">
              {draft.id ? "Editar usuário" : "Criar usuário"}
            </h2>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Fechar
            </button>
          </div>
          <form onSubmit={save}>
            <label>
              Nome
              <input
                required
                maxLength={100}
                value={draft.full_name}
                onChange={(e) =>
                  setDraft({ ...draft, full_name: e.target.value })
                }
                disabled={busy}
              />
            </label>
            <label>
              Usuário
              <input
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z][a-zA-Z0-9._\-]{2,31}"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                value={draft.username}
                onChange={(e) =>
                  setDraft({ ...draft, username: e.target.value })
                }
                disabled={busy}
              />
            </label>
            <label>
              Perfil
              <select
                aria-label="Perfil do usuário"
                value={draft.role}
                onChange={(e) =>
                  setDraft({ ...draft, role: e.target.value as Draft["role"] })
                }
                disabled={busy || draft.id === actor}
              >
                <option value="attendant">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <label>
              {draft.id ? "Nova senha (opcional)" : "Senha"}
              <input
                type="password"
                required={!draft.id}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
                disabled={busy}
              />
            </label>
            <p className="footnote">
              Use de 8 a 128 caracteres.{" "}
              {draft.id
                ? "Deixe em branco para manter a senha atual."
                : "Defina a senha e compartilhe diretamente com o usuário."}
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) =>
                  setDraft({ ...draft, is_active: e.target.checked })
                }
                disabled={busy || draft.id === actor}
              />
              Acesso ativo
            </label>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar usuário"}
            </button>
          </form>
        </dialog>
      )}
    </section>
  );
}
