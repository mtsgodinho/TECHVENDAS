"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "../lib/supabase";
import { formatDate, type Profile } from "../lib/crm";
type Thread = {
  id: string;
  seller_id: string;
  status: string;
  full_name: string;
  updated_at: string;
  unread: number;
};
type Message = {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
};
export default function SupportCenter({
  profile,
  visible,
  onUnread,
}: {
  profile: Profile;
  visible: boolean;
  onUnread: (n: number) => void;
}) {
  const admin = profile.role === "admin";
  const [open, setOpen] = useState(false),
    [closed, setClosed] = useState(false),
    [page, setPage] = useState(0),
    [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState<Thread | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [count, setCount] = useState(0),
    [older, setOlder] = useState(false),
    [confirm, setConfirm] = useState(false);
  const shown = admin ? visible : open,
    request = useRef(0),
    messageRequest = useRef(0),
    chat = useRef<HTMLDivElement>(null);
  const unread = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("support_unread");
    if (!error) {
      setCount(Number(data) || 0);
      onUnread(Number(data) || 0);
    }
  }, [onUnread]);
  const load = useCallback(async () => {
    if (!supabase) return;
    const token = ++request.current;
    const { data, error } = await supabase.rpc("support_list", {
      p_closed: closed,
      p_offset: page * 30,
    });
    if (token !== request.current) return;
    if (error) {
      setError(
        "Não foi possível carregar os suportes. Confira a conexão e a atualização 007_support.sql.",
      );
      return;
    }
    setThreads(data || []);
    setError("");
  }, [closed, page]);
  useEffect(() => {
    void unread();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void unread();
    }, 5000);
    const focus = () => {
      void unread();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [unread]);
  useEffect(() => {
    if (!shown) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      clearInterval(timer);
      request.current++;
    };
  }, [shown, load]);
  const readMessages = useCallback(async () => {
    if (!supabase || !selected) return;
    const token = ++messageRequest.current;
    const state = await supabase
      .from("support_threads")
      .select("status")
      .eq("id", selected.id)
      .single();
    if (token !== messageRequest.current) return;
    if (!state.error && state.data.status !== selected.status)
      setSelected({ ...selected, status: state.data.status });
    const { data, error } = await supabase
      .from("support_messages")
      .select("id,sender_id,body,created_at")
      .eq("thread_id", selected.id)
      .order("id", { ascending: false })
      .limit(50);
    if (token !== messageRequest.current) return;
    if (error) {
      setError("Não foi possível carregar as mensagens.");
      return;
    }
    const rows = (data || []).reverse() as Message[];
    setMessages((prev) =>
      rows.length ? [...prev.filter((m) => m.id < rows[0].id), ...rows] : [],
    );
    setOlder(rows.length === 50);
    if (document.visibilityState === "visible" && rows.length) {
      await supabase.rpc("support_read", {
        p_thread: selected.id,
        p_through: rows[rows.length - 1].id,
      });
      void unread();
    }
  }, [selected, unread]);
  useEffect(() => {
    if (!shown || !selected) return;
    void readMessages();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void readMessages();
    }, 5000);
    return () => {
      clearInterval(timer);
      messageRequest.current++;
    };
  }, [shown, selected, readMessages]);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [messages[messages.length - 1]?.id]);
  useEffect(() => {
    if (selected) {
      const current = threads.find((t) => t.id === selected.id);
      if (current && current.status !== selected.status) setSelected(current);
    }
  }, [threads, selected]);
  function choose(t: Thread | null) {
    messageRequest.current++;
    setSelected(t);
    setMessages([]);
    setText("");
    setError("");
    setConfirm(false);
    setOlder(false);
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("support_send", {
        p_body: text.trim(),
        p_thread: selected?.id || null,
      });
      if (error) throw error;
      setText("");
      if (!selected)
        setSelected({
          id: data,
          seller_id: profile.id,
          status: "open",
          full_name: profile.full_name,
          updated_at: new Date().toISOString(),
          unread: 0,
        });
      else await readMessages();
      setClosed(false);
      setPage(0);
      await load();
    } catch {
      setError(
        "Não foi possível enviar. Confira a conexão; se o suporte foi finalizado, inicie um novo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (!supabase || !selected) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("support_close", {
        p_thread: selected.id,
      });
      if (error) throw error;
      setSelected({ ...selected, status: "closed" });
      setConfirm(false);
      await load();
    } catch {
      setError("Não foi possível finalizar. Atualize e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function previous() {
    if (!supabase || !selected || !messages.length) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("support_messages")
      .select("id,sender_id,body,created_at")
      .eq("thread_id", selected.id)
      .lt("id", messages[0].id)
      .order("id", { ascending: false })
      .limit(50);
    if (error) setError("Não foi possível carregar mensagens anteriores.");
    else {
      setMessages([...(data || []).reverse(), ...messages]);
      setOlder(data?.length === 50);
    }
    setBusy(false);
  }
  return (
    <>
      {!admin && (
        <button
          className="support-launch"
          aria-label={`Abrir suporte${count ? `, ${count} mensagens novas` : ""}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ✉ Suporte {count > 0 && <span className="nav-count">{count}</span>}
        </button>
      )}
      {shown && (
        <section
          className={admin ? "panel support-admin" : "support-widget"}
          aria-label="Chat de suporte"
        >
          <div className="support-heading">
            <h2>{admin ? "Atendimentos de suporte" : "Fale com o suporte"}</h2>
            {!admin && (
              <button
                className="secondary"
                onClick={() => setOpen(false)}
                aria-label="Fechar chat"
              >
                Fechar
              </button>
            )}
          </div>
          <p className="muted">
            {admin
              ? "Responda aos vendedores e finalize os atendimentos resolvidos."
              : "Envie sua dúvida para o administrador. As respostas aparecem aqui."}
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}{" "}
              <button
                className="text-button"
                onClick={() => {
                  void load();
                  void readMessages();
                }}
              >
                Tentar novamente
              </button>
            </p>
          )}
          <div className="support-layout">
            <div className="support-list">
              <label>
                Mostrar suportes
                <select
                  value={closed ? "closed" : "open"}
                  onChange={(e) => {
                    setClosed(e.target.value === "closed");
                    setPage(0);
                    choose(null);
                  }}
                >
                  <option value="open">Em aberto</option>
                  <option value="closed">Finalizados</option>
                </select>
              </label>
              {!admin && (
                <button
                  className="secondary"
                  onClick={() => {
                    choose(null);
                    setClosed(false);
                    setPage(0);
                  }}
                  disabled={busy}
                >
                  Nova mensagem
                </button>
              )}
              {threads.length === 0 && (
                <p className="muted">
                  Nenhum suporte {closed ? "finalizado" : "em aberto"}.
                </p>
              )}
              {threads.map((t) => (
                <button
                  key={t.id}
                  className={`support-ticket ${selected?.id === t.id ? "selected" : ""}`}
                  onClick={() => choose(t)}
                  disabled={busy}
                >
                  <strong>
                    {admin ? t.full_name : `Suporte #${t.id.slice(0, 8)}`}
                  </strong>
                  <span>
                    {t.status === "open" ? "Em aberto" : "Finalizado"} ·{" "}
                    {formatDate(t.updated_at)}
                  </span>
                  {t.unread > 0 && <span>{t.unread} nova(s) mensagem(ns)</span>}
                </button>
              ))}
              <div className="support-heading">
                <button
                  className="secondary"
                  disabled={page === 0 || busy}
                  onClick={() => {
                    setPage(page - 1);
                    choose(null);
                  }}
                >
                  Anterior
                </button>
                <button
                  className="secondary"
                  disabled={threads.length < 30 || busy}
                  onClick={() => {
                    setPage(page + 1);
                    choose(null);
                  }}
                >
                  Próxima
                </button>
              </div>
            </div>
            <div className="support-conversation">
              {selected && (
                <h3>
                  {admin ? selected.full_name : "Seu atendimento"} ·{" "}
                  {selected.status === "closed" ? "Finalizado" : "Em aberto"}
                </h3>
              )}
              {admin && !selected ? (
                <p className="muted">
                  Selecione um atendimento para conversar.
                </p>
              ) : (
                <>
                  <div
                    className="support-messages"
                    ref={chat}
                    role="log"
                    aria-label="Mensagens do suporte"
                    aria-live="polite"
                  >
                    {older && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={previous}
                      >
                        Mensagens anteriores
                      </button>
                    )}
                    {!messages.length && (
                      <p className="muted">
                        {selected
                          ? "Nenhuma mensagem carregada."
                          : "Como podemos ajudar?"}
                      </p>
                    )}
                    {messages.map((m) => (
                      <div
                        className={`support-message ${m.sender_id === profile.id ? "own" : ""}`}
                        key={m.id}
                      >
                        <strong>
                          {m.sender_id === profile.id
                            ? "Você"
                            : admin
                              ? "Vendedor"
                              : "Administrador"}
                        </strong>
                        <p>{m.body}</p>
                        <time>{formatDate(m.created_at)}</time>
                      </div>
                    ))}
                  </div>
                  {selected?.status === "closed" ? (
                    <p className="notice">
                      Atendimento finalizado. O histórico foi preservado.
                      {!admin &&
                        " Clique em Nova mensagem para solicitar ajuda novamente."}
                    </p>
                  ) : (
                    <form onSubmit={send}>
                      <label>
                        Mensagem
                        <textarea
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={2000}
                          required
                          rows={3}
                          disabled={busy}
                          placeholder="Escreva sua mensagem…"
                        />
                      </label>
                      <button disabled={busy || !text.trim()}>
                        {busy ? "Aguarde…" : "Enviar mensagem"}
                      </button>
                    </form>
                  )}
                  {admin &&
                    selected?.status === "open" &&
                    (confirm ? (
                      <div className="notice">
                        <p>Finalizar este atendimento?</p>
                        <button disabled={busy} onClick={finish}>
                          Confirmar finalização
                        </button>{" "}
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setConfirm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setConfirm(true)}
                      >
                        Finalizar suporte
                      </button>
                    ))}
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
