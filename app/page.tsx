"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import Workspace from "../components/Workspace";
import Brand from "../components/Brand";
import { loginAddress } from "../lib/username";
type Profile = { id: string; full_name: string; role: "admin" | "attendant" };
function Icon({
  kind = "arrow",
}: {
  kind?: "arrow" | "check" | "shield" | "grid" | "menu";
}) {
  const paths = {
    arrow: "M7 17 17 7M7 7h10v10",
    check: "m5 12 4 4L19 6",
    shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    menu: "M3 6h18M3 12h18M3 18h18",
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [hasSession, setHasSession] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    async function load(id?: string) {
      if (active) setHasSession(Boolean(id));
      if (!id) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data, error } = await client!
        .from("profiles")
        .select("id,full_name,role")
        .eq("id", id)
        .single();
      if (active) {
        setProfile(data);
        setMessage(
          error
            ? "Seu perfil ainda não foi provisionado. Solicite acesso ao administrador."
            : "",
        );
        setLoading(false);
      }
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setMessage("Não foi possível verificar sua sessão.");
        setLoading(false);
      } else void load(data.session?.user.id);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (active) void load(session?.user.id);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginAddress(username),
        password,
      });
      if (error)
        setMessage("Não foi possível entrar. Confira seu usuário e senha.");
    } catch {
      setMessage("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) setMessage("Não foi possível sair. Tente novamente.");
    else {
      setProfile(null);
      setHasSession(false);
      setMessage("");
    }
    setBusy(false);
  }
  if (loading)
    return (
      <main className="loading" role="status">
        Carregando TechVendas…
      </main>
    );
  if (!profile)
    return (
      <main className="login-shell">
        <section className="brand-story">
          <Brand />
          <div>
            <p className="eyebrow">CONEXÕES QUE GERAM RESULTADOS</p>
            <h1>
              Seu próximo
              <br />
              resultado começa
              <br />
              com uma <em>conversa.</em>
            </h1>
            <p className="muted">
              Organize contatos. Acompanhe oportunidades.
              <br />
              Mantenha sua equipe na mesma direção.
            </p>
          </div>
          <p className="muted">TECHVENDAS · PLATAFORMA INTERNA</p>
        </section>
        <section className="login-card">
          <span className="icon">
            <Icon />
          </span>
          <p className="eyebrow">BEM-VINDO À TECHVENDAS</p>
          <h2>Acesse sua conta</h2>
          <p className="muted">
            Seu espaço para transformar contatos em oportunidades.
          </p>
          {!supabase ? (
            <div className="notice">
              <strong>Configuração necessária</strong>
              <p>
                Configure a URL e a chave pública do Supabase no ambiente e
                aplique a migração do banco. O acesso será habilitado após essa
                configuração.
              </p>
            </div>
          ) : (
            <form onSubmit={login}>
              <label>
                Usuário
                <input
                  type="text"
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z][a-zA-Z0-9._\-]{2,31}"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Seu usuário"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  minLength={6}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                />
              </label>
              <button disabled={busy}>
                {busy ? "Entrando…" : "Entrar na plataforma"}
              </button>
            </form>
          )}
          {message && (
            <p role="alert" className="notice">
              {message}
            </p>
          )}
          {hasSession && (
            <button className="logout" onClick={logout} disabled={busy}>
              Sair desta sessão
            </button>
          )}
          <p className="footnote">
            Acesso exclusivo para usuários autorizados.
            <br />
            Precisa de acesso? Fale com o administrador.
          </p>
        </section>
      </main>
    );
  return <Workspace profile={profile} onLogout={logout} loggingOut={busy} />;
}
