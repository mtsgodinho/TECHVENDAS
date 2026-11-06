"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import {
  brazilInstant,
  formatDate,
  localInput,
  origins,
  phoneLabel,
  statuses,
  type Activity,
  type Lead,
  type Profile,
  type Status,
} from "../lib/crm";
export default function LeadEditor({
  lead,
  profile,
  people,
  onClose,
  onSaved,
}: {
  lead: Lead;
  profile: Profile;
  people: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [status, setStatus] = useState<Status>(lead.status),
    [notes, setNotes] = useState(lead.notes),
    [saleAmount, setSaleAmount] = useState(lead.sale_amount?.toString() || ""),
    [date, setDate] = useState(localInput(lead.follow_up_at)),
    [assignee, setAssignee] = useState(lead.assigned_to || ""),
    [source, setSource] = useState(lead.source),
    [history, setHistory] = useState<Activity[]>([]),
    [hasMore, setHasMore] = useState(false),
    [historyBusy, setHistoryBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const readOnly =
    profile.role !== "admin" && ["sold", "lost"].includes(lead.status);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    supabase
      .from("lead_history")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 19)
      .then(({ data, error }) => {
        if (active) {
          if (error) setMessage("Não foi possível carregar o histórico.");
          else {
            setHistory(data || []);
            setHasMore(data?.length === 20);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [lead.id]);
  async function more() {
    if (!supabase) return;
    setHistoryBusy(true);
    try {
      const { data, error } = await supabase
        .from("lead_history")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(history.length, history.length + 19);
      if (error) throw error;
      setHistory([...history, ...data]);
      setHasMore(data.length === 20);
    } catch {
      setMessage("Não foi possível carregar mais atividades.");
    } finally {
      setHistoryBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("save_lead", {
        p_id: lead.id,
        p_sale_amount:
          status === "sold" ? Number(saleAmount.replace(",", ".")) : null,
        p_status: status,
        p_notes: notes,
        p_follow_up: status === "follow_up" ? brazilInstant(date) : null,
        p_source: profile.role === "admin" ? source : null,
        p_expected_updated_at: lead.updated_at,
      });
      if (error) throw error;
      onSaved();
    } catch (error) {
      const text =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "";
      setMessage(
        /lead|venda|valor|atendente|observação|retorno|origem|atualize/i.test(
          text,
        )
          ? text
          : "Não foi possível salvar. Confira a conexão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function transfer() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("transfer_lead", {
        p_id: lead.id,
        p_attendant: assignee,
        p_expected_updated_at: lead.updated_at,
      });
      if (error) throw error;
      onSaved();
    } catch {
      setMessage(
        "Não foi possível reatribuir. Atualize a lista e confira a atendente selecionada.",
      );
    } finally {
      setBusy(false);
    }
  }
  const person = (id: string) =>
    people.find((p) => p.id === id)?.full_name ||
    (id === profile.id ? profile.full_name : "Usuário da equipe");
  return (
    <dialog
      ref={dialog}
      className="lead-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="lead-title"
    >
      <div className="dialog-header">
        <div>
          <p className="eyebrow">DETALHES DO LEAD</p>
          <h2 id="lead-title">{lead.name}</h2>
          <p className="muted">{phoneLabel(lead.phone)}</p>
        </div>
        <button
          className="secondary"
          aria-label="Fechar detalhes"
          disabled={busy}
          onClick={onClose}
        >
          Fechar
        </button>
      </div>
      <div className="detail-meta">
        <span>Origem: {lead.source}</span>
        <span>Campanha: {lead.campaign || "Não informada"}</span>
        <span>Lote: {lead.batch_id?.slice(0, 8) || "Não atribuído"}</span>
        <span>Atualizado: {formatDate(lead.updated_at)}</span>
        {lead.returned_at && (
          <span>Última devolução: {formatDate(lead.returned_at)}</span>
        )}
      </div>
      <form onSubmit={save}>
        <div className="filters">
          <label>
            Status
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              disabled={busy || readOnly}
            >
              {Object.entries(statuses).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {profile.role === "admin" && (
            <label>
              Origem
              <select
                aria-label="Origem"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={busy}
              >
                {!origins.includes(source) && <option>{source}</option>}
                {origins.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {status === "sold" && (
          <label>
            Valor da venda (R$)
            <input
              type="number"
              min="0.01"
              max="999999999.99"
              step="0.01"
              required
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
              disabled={busy || readOnly}
            />
            <span className="muted">
              Comissão do vendedor: R$ 20,00 por venda confirmada.
            </span>
          </label>
        )}
        {status === "follow_up" && (
          <label>
            Retorno agendado (horário de Brasília)
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={busy || readOnly}
            />
          </label>
        )}
        <label>
          Observações
          <textarea
            value={notes}
            maxLength={10000}
            rows={4}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Registre o resultado da conversa…"
            disabled={busy || readOnly}
          />
        </label>
        {status === "no_response" && !readOnly && (
          <p className="notice">
            Ao salvar, o lead sairá da fila ativa e voltará ao administrador. O
            histórico será preservado.
          </p>
        )}
        {message && (
          <p role="alert" className="notice error">
            {message}
          </p>
        )}
        {!readOnly && (
          <button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      </form>
      {profile.role === "admin" &&
        lead.assigned_to &&
        !["sold", "lost", "no_response"].includes(lead.status) && (
          <section className="transfer-panel">
            <h3>Atribuição</h3>
            <p className="muted">
              Reatribuir preserva status e histórico. Alterações do formulário
              acima devem ser salvas antes.
            </p>
            <label>
              Atendente responsável
              <select
                aria-label="Atendente responsável"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={busy}
              >
                {people
                  .filter(
                    (p) =>
                      p.role === "attendant" &&
                      p.is_active !== false &&
                      !p.deleted_at,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="secondary"
              type="button"
              onClick={transfer}
              disabled={busy || assignee === lead.assigned_to || !assignee}
            >
              Reatribuir contato
            </button>
          </section>
        )}
      <h3>Histórico do contato</h3>
      {!history.length && (
        <p className="muted">Nenhuma alteração registrada.</p>
      )}
      <ol className="timeline">
        {history.map((item) => (
          <li key={item.id}>
            <div>
              <strong>
                {item.event_type === "recall"
                  ? "Retirado da fila — devolvido ao estoque"
                  : item.event_type === "assignment"
                    ? "Atribuição de lead"
                    : `${item.old_status ? statuses[item.old_status] + " → " : ""}${statuses[item.new_status]}`}
              </strong>
              <time>{formatDate(item.created_at)}</time>
            </div>
            <p className="muted">{person(item.actor_id)}</p>
            {item.notes && <p className="history-note">{item.notes}</p>}
          </li>
        ))}
      </ol>
      {hasMore && (
        <button className="secondary" onClick={more} disabled={historyBusy}>
          {historyBusy ? "Carregando…" : "Carregar mais histórico"}
        </button>
      )}
    </dialog>
  );
}
