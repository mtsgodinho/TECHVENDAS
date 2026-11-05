"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { exportCsv } from "../lib/csv";
import {
  formatDate,
  phoneLabel,
  statuses,
  type Activity,
  type Batch,
  type Lead,
  type Metrics,
  type Profile,
  type Status,
} from "../lib/crm";
import ImportCsv from "./ImportCsv";
import LeadEditor from "./LeadEditor";
type View =
  | "dashboard"
  | "stock"
  | "leads"
  | "returned"
  | "followup"
  | "finished"
  | "import";
const viewTitles: Record<View, string> = {
  dashboard: "Visão geral",
  stock: "Estoque de leads",
  leads: "Fila de atendimento",
  returned: "Sem resposta",
  followup: "Em acompanhamento",
  finished: "Finalizados",
  import: "Importar CSV",
};
const initialMetrics: Metrics = {
  total: 0,
  stock: 0,
  assigned: 0,
  statuses: {},
  worked: 0,
  worked_today: 0,
  worked_week: 0,
  sales: 0,
};
function Glyph({ kind }: { kind: View | "refresh" }) {
  const paths = {
    dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    stock: "m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10",
    leads:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    returned: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
    followup: "M12 8v4l3 3M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    finished: "m5 12 4 4L19 6",
    import: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    refresh: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
export default function Workspace({
  profile,
  onLogout,
  loggingOut,
}: {
  profile: Profile;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const admin = profile.role === "admin";
  const [view, setView] = useState<View>(admin ? "dashboard" : "leads"),
    [menu, setMenu] = useState(false),
    [metrics, setMetrics] = useState<Metrics>(initialMetrics),
    [leads, setLeads] = useState<Lead[]>([]),
    [people, setPeople] = useState<Profile[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [batch, setBatch] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<Lead | null>(null),
    [quantity, setQuantity] = useState(50),
    [attendant, setAttendant] = useState(""),
    [refresh, setRefresh] = useState(0),
    [copied, setCopied] = useState("");
  const request = useRef(0);
  const pageSize = 20;
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const refreshOnFocus = () => setRefresh((n) => n + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);
  const range = useCallback(
    () => ({
      since: since ? `${since}T00:00:00-03:00` : null,
      until: until
        ? new Date(
            new Date(`${until}T00:00:00-03:00`).valueOf() + 86400000,
          ).toISOString()
        : null,
    }),
    [since, until],
  );
  const buildQuery = useCallback(() => {
    let q = supabase!.from("leads").select("*", { count: "exact" });
    if (view === "stock")
      q = q
        .is("assigned_to", null)
        .is("returned_at", null)
        .eq("status", "pending");
    if (view === "returned")
      q = q.eq("status", "no_response").not("returned_at", "is", null);
    if (view === "leads")
      q = q
        .not("assigned_to", "is", null)
        .not("status", "in", "(sold,lost,no_response)");
    if (view === "followup") q = q.in("status", ["interested", "follow_up"]);
    if (view === "finished") q = q.in("status", ["sold", "lost"]);
    if (status) q = q.eq("status", status);
    if (batch) q = q.eq("batch_id", batch);
    const dates = range();
    if (dates.since) q = q.gte("updated_at", dates.since);
    if (dates.until) q = q.lt("updated_at", dates.until);
    if (query) {
      const text = query
        .replace(/[,%_().\\"\r\n]/g, " ")
        .trim()
        .slice(0, 100);
      const digits = query.replace(/\D/g, "");
      if (text)
        q = digits
          ? q.or(`name.ilike.%${text}%,phone.ilike.%${digits}%`)
          : q.ilike("name", `%${text}%`);
    }
    return q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  }, [view, status, batch, range, query]);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const token = ++request.current;
    setLoading(true);
    setError("");
    setSelected([]);
    async function load() {
      try {
        const dates = range();
        let activityQuery = client!
          .from("lead_history")
          .select("*,leads!inner(name,batch_id,status)")
          .order("created_at", { ascending: false })
          .limit(8);
        if (dates.since)
          activityQuery = activityQuery.gte("created_at", dates.since);
        if (dates.until)
          activityQuery = activityQuery.lt("created_at", dates.until);
        if (batch) activityQuery = activityQuery.eq("leads.batch_id", batch);
        if (status) activityQuery = activityQuery.eq("leads.status", status);
        const [m, p, b, list, a] = await Promise.all([
          client!.rpc("dashboard", {
            p_since: dates.since,
            p_until: dates.until,
            p_batch: batch || null,
            p_status: status || null,
          }),
          client!.from("profiles").select("id,full_name,role"),
          client!
            .from("batches")
            .select("id,created_at,attendant_id")
            .order("created_at", { ascending: false })
            .limit(500),
          view === "import" || view === "dashboard"
            ? Promise.resolve({ data: [], count: 0, error: null })
            : buildQuery().range(
                page * pageSize,
                page * pageSize + pageSize - 1,
              ),
          activityQuery,
        ]);
        for (const r of [m, p, b, list, a]) if (r.error) throw r.error;
        if (!active || token !== request.current) return;
        setMetrics(m.data as Metrics);
        setPeople(p.data as Profile[]);
        setBatches(b.data as Batch[]);
        setLeads(list.data as Lead[]);
        setTotal(list.count || 0);
        if (page > 0 && (list.count || 0) <= page * pageSize)
          setPage(Math.max(0, Math.ceil((list.count || 0) / pageSize) - 1));
        setActivities(a.data as Activity[]);
        setAttendant(
          (current) =>
            current ||
            (p.data as Profile[]).find((x) => x.role === "attendant")?.id ||
            "",
        );
      } catch {
        if (active) {
          setError(
            "Não foi possível carregar os dados. Confira a conexão e se as duas migrações foram aplicadas no Supabase.",
          );
          setLeads([]);
          setMetrics(initialMetrics);
          setActivities([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [view, page, batch, status, range, buildQuery, refresh]);
  function navigate(next: View) {
    setView(next);
    setMenu(false);
    setPage(0);
    setStatus("");
    setBatch("");
    setSearch("");
    setQuery("");
    setSelected([]);
    setNotice("");
    setEditing(null);
    setRefresh((n) => n + 1);
  }
  function reload() {
    setRefresh((n) => n + 1);
  }
  async function release() {
    if (!supabase || busy) return;
    if (view === "returned" && !selected.length) {
      setError("Selecione os leads que deseja liberar novamente.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("release_leads", {
        p_attendant: attendant,
        p_quantity: selected.length || quantity,
        p_ids: selected.length ? selected : null,
        p_returned: view === "returned",
      });
      if (error) throw error;
      setNotice(
        data.released
          ? `${data.released} leads liberados. Lote ${data.batch_id.slice(0, 8)}.`
          : "Nenhum lead disponível para essa liberação.",
      );
      setSelected([]);
      reload();
    } catch {
      setError(
        "Não foi possível liberar os leads. Selecione uma atendente, de 1 a 50 leads disponíveis e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(lead: Lead) {
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(lead.id);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setError(
        "Não foi possível copiar automaticamente. Selecione o número e copie manualmente.",
      );
    }
  }
  async function download() {
    if (!supabase || !admin || busy) return;
    setBusy(true);
    setError("");
    try {
      const records: Lead[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await buildQuery().range(offset, offset + 499);
        if (error) throw error;
        records.push(...(data as Lead[]));
        if (data.length < 500) break;
        offset += 500;
      }
      const rows = [
        [
          "Nome",
          "Telefone",
          "Origem",
          "Campanha",
          "Status",
          "Observações",
          "Atendente",
          "Lote",
          "Última atualização",
          "Retorno",
        ],
        ...records.map((lead) => [
          lead.name,
          lead.phone,
          lead.source,
          lead.campaign,
          statuses[lead.status],
          lead.notes,
          people.find((p) => p.id === lead.assigned_to)?.full_name || "",
          lead.batch_id,
          formatDate(lead.updated_at),
          formatDate(lead.follow_up_at),
        ]),
      ];
      const url = URL.createObjectURL(
        new Blob([exportCsv(rows)], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `techvendas-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${records.length} leads exportados com os filtros atuais.`);
    } catch {
      setError("Não foi possível exportar os resultados. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  const nav: View[] = admin
    ? [
        "dashboard",
        "stock",
        "leads",
        "returned",
        "followup",
        "finished",
        "import",
      ]
    : ["leads", "followup", "finished"];
  const cards = admin
    ? [
        ["Total importado", metrics.total],
        ["Disponíveis no estoque", metrics.stock],
        ["Em atendimento", metrics.assigned],
        ["Vendas realizadas", metrics.statuses.sold || 0],
      ]
    : [
        ["Pendentes", metrics.statuses.pending || 0],
        ["Interessados", metrics.statuses.interested || 0],
        ["Retornos", metrics.statuses.follow_up || 0],
        [
          "Finalizados",
          (metrics.statuses.sold || 0) + (metrics.statuses.lost || 0),
        ],
      ];
  const canSelect = admin && (view === "stock" || view === "returned");
  const invalidDates = Boolean(since && until && since > until);
  return (
    <div className="workspace">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a href="/" className="brand">
          Tech<span>Vendas</span>
          <small>GESTÃO DE LEADS</small>
        </a>
        <p className="eyebrow">ÁREA DE TRABALHO</p>
        <nav className="crm-nav">
          {nav.map((item) => (
            <button
              key={item}
              className={view === item ? "nav-item active" : "nav-item"}
              aria-current={view === item ? "page" : undefined}
              onClick={() => navigate(item)}
            >
              <Glyph kind={item} />
              {viewTitles[item]}
              {item === "returned" && !!metrics.statuses.no_response && (
                <span className="nav-count">
                  {metrics.statuses.no_response}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="dot" /> Ambiente seguro
          <p className="muted">
            {profile.full_name}
            <br />
            {admin ? "Administrador" : "Atendente"}
          </p>
        </div>
      </aside>
      <main className="main">
        <header>
          <button
            className="menu"
            aria-label="Abrir menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            Menu
          </button>
          <span className="muted">
            {admin ? "Administração" : "Atendimento"} /{" "}
            <strong>{viewTitles[view]}</strong>
          </span>
          <button className="logout" onClick={onLogout} disabled={loggingOut}>
            Sair
          </button>
        </header>
        <section className="content crm-content">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {admin ? "CADA OPORTUNIDADE CONTA" : "UMA CONVERSA DE CADA VEZ"}
              </p>
              <h1>
                {viewTitles[view]}
                <span className="cyan">.</span>
              </h1>
              <p className="muted">
                {view === "dashboard"
                  ? `Olá, ${profile.full_name}. Acompanhe os resultados da sua equipe.`
                  : view === "stock"
                    ? "Os leads ficam aqui até você autorizar a liberação."
                    : view === "returned"
                      ? "Contatos devolvidos pela atendente. Uma nova liberação exige sua autorização."
                      : view === "followup"
                        ? "Oportunidades interessadas e retornos agendados."
                        : view === "finished"
                          ? "Vendas e contatos encerrados, com histórico preservado."
                          : view === "leads"
                            ? "Copie o número, faça o contato manualmente e registre o resultado."
                            : ""}
              </p>
            </div>
            <div className="toolbar">
              <button
                className="secondary"
                onClick={reload}
                disabled={loading || busy}
                aria-label="Atualizar dados"
              >
                <Glyph kind="refresh" />
              </button>
              {admin && view !== "import" && view !== "dashboard" && (
                <button
                  className="secondary"
                  onClick={download}
                  disabled={busy || loading || Boolean(error)}
                >
                  Exportar CSV
                </button>
              )}
              {admin && view === "dashboard" && (
                <button onClick={() => navigate("import")}>Importar CSV</button>
              )}
            </div>
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}{" "}
              <button className="text-button" onClick={reload}>
                Tentar novamente
              </button>
            </p>
          )}
          {view === "import" ? (
            <ImportCsv
              onImported={() => {
                reload();
              }}
            />
          ) : (
            <>
              <div className="metric-grid" aria-busy={loading}>
                {cards.map(([label, value]) => (
                  <article className="metric-card" key={label}>
                    <span>{label}</span>
                    <strong>
                      {loading ? "—" : Number(value).toLocaleString("pt-BR")}
                    </strong>
                    <span className="metric-hint">
                      {admin ? "Situação atual" : "Seus leads"}
                    </span>
                  </article>
                ))}
              </div>
              <div className="filters filter-panel">
                {view !== "dashboard" && (
                  <label className="search-field">
                    Buscar por nome ou telefone
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar contato…"
                      type="search"
                    />
                  </label>
                )}
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todos os status</option>
                    {Object.entries(statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lote
                  <select
                    value={batch}
                    onChange={(e) => {
                      setBatch(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todos os lotes</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id.slice(0, 8)} · {formatDate(b.created_at)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {view === "dashboard"
                    ? "Atividades a partir de"
                    : "Atualizados a partir de"}
                  <input
                    type="date"
                    value={since}
                    onChange={(e) => {
                      setSince(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    min={since || undefined}
                    value={until}
                    onChange={(e) => {
                      setUntil(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                {(status || batch || since || until || search) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setStatus("");
                      setBatch("");
                      setSince("");
                      setUntil("");
                      setSearch("");
                      setPage(0);
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
              {invalidDates && (
                <p className="notice error" role="alert">
                  A data final deve ser igual ou posterior à data inicial.
                </p>
              )}
              {view === "dashboard" ? (
                <>
                  <div className="dashboard-columns">
                    <section className="panel">
                      <div className="section-heading">
                        <h3>Funil de contatos</h3>
                        <span className="muted">Situação atual</span>
                      </div>
                      {Object.entries(statuses).map(([key, label]) => (
                        <button
                          key={key}
                          className="funnel-row"
                          onClick={() => {
                            navigate(
                              key === "no_response"
                                ? "returned"
                                : key === "sold" || key === "lost"
                                  ? "finished"
                                  : "leads",
                            );
                            setStatus(key);
                          }}
                        >
                          <span>
                            <i className={`status-dot ${key}`} />
                            {label}
                          </span>
                          <div className="funnel-track">
                            <span
                              style={{
                                width: `${Math.max(0, metrics.total ? (100 * (metrics.statuses[key as Status] || 0)) / metrics.total : 0)}%`,
                              }}
                            />
                          </div>
                          <strong>
                            {loading
                              ? "—"
                              : metrics.statuses[key as Status] || 0}
                          </strong>
                        </button>
                      ))}
                    </section>
                    <section className="panel">
                      <h3>Ritmo de atendimento</h3>
                      <p className="muted">
                        Leads únicos; o mesmo contato conta uma vez por período.
                      </p>
                      <div className="performance">
                        <span>Trabalhados hoje</span>
                        <strong>{loading ? "—" : metrics.worked_today}</strong>
                      </div>
                      <div className="performance">
                        <span>Últimos 7 dias</span>
                        <strong>{loading ? "—" : metrics.worked_week}</strong>
                      </div>
                      <div className="performance">
                        <span>Trabalhados no período</span>
                        <strong>{loading ? "—" : metrics.worked}</strong>
                      </div>
                      <div className="performance">
                        <span>Vendas no período</span>
                        <strong>{loading ? "—" : metrics.sales}</strong>
                      </div>
                      <div className="performance conversion">
                        <span>Conversão no período</span>
                        <strong>
                          {loading
                            ? "—"
                            : `${metrics.worked ? ((metrics.sales / metrics.worked) * 100).toFixed(1) : "0,0"}%`}
                        </strong>
                      </div>
                      <p className="footnote">
                        Datas filtram as atividades. Os totais e o funil mostram
                        a situação atual, filtrada por lote e status.
                      </p>
                    </section>
                  </div>
                  <section className="panel activity-panel">
                    <div className="section-heading">
                      <h3>Últimas atividades</h3>
                      <span className="muted">Mais recentes da equipe</span>
                    </div>
                    {!loading && !activities.length && (
                      <Empty
                        title="Nenhuma atividade por enquanto"
                        description="As alterações dos contatos aparecerão aqui automaticamente."
                      />
                    )}
                    {activities.map((a) => (
                      <div className="activity-row" key={a.id}>
                        <span className={`status-dot ${a.new_status}`} />
                        <div>
                          <strong>{a.leads?.name || "Lead"}</strong>
                          <p className="muted">
                            {people.find((p) => p.id === a.actor_id)
                              ?.full_name || "Equipe"}{" "}
                            ·{" "}
                            {a.event_type === "assignment"
                              ? "Atribuição"
                              : statuses[a.new_status]}
                          </p>
                        </div>
                        <time>{formatDate(a.created_at)}</time>
                      </div>
                    ))}
                  </section>
                </>
              ) : (
                <>
                  {canSelect && (
                    <section className="release-bar">
                      <div>
                        <h3>
                          {view === "returned"
                            ? "Autorizar nova liberação"
                            : "Liberar um lote"}
                        </h3>
                        <p className="muted">
                          {selected.length
                            ? `${selected.length} selecionados`
                            : view === "returned"
                              ? "Selecione os contatos abaixo."
                              : "Libere os próximos disponíveis ou selecione os contatos."}
                        </p>
                      </div>
                      <div className="release-controls">
                        <label>
                          Atendente
                          <select
                            value={attendant}
                            onChange={(e) => setAttendant(e.target.value)}
                            disabled={busy}
                          >
                            <option value="">Selecione</option>
                            {people
                              .filter((p) => p.role === "attendant")
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.full_name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {!selected.length && view === "stock" && (
                          <label>
                            Quantidade
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={quantity}
                              onChange={(e) =>
                                setQuantity(Number(e.target.value))
                              }
                              disabled={busy}
                            />
                          </label>
                        )}
                        <button
                          onClick={release}
                          disabled={
                            busy ||
                            loading ||
                            !attendant ||
                            Boolean(error) ||
                            (!selected.length && view === "returned") ||
                            (!selected.length &&
                              (quantity < 1 || quantity > 50))
                          }
                        >
                          {busy
                            ? "Liberando…"
                            : `Liberar ${selected.length || quantity} leads`}
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="list-panel" aria-busy={loading}>
                    <div className="section-heading">
                      <h3>
                        Contatos <span className="muted">({total})</span>
                      </h3>
                      {canSelect && leads.length > 0 && (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={leads.every((l) =>
                              selected.includes(l.id),
                            )}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked ? leads.map((l) => l.id) : [],
                              )
                            }
                            disabled={busy}
                          />
                          Selecionar esta página
                        </label>
                      )}
                    </div>
                    {loading ? (
                      <p className="loading-inline" role="status">
                        Carregando contatos…
                      </p>
                    ) : !leads.length ? (
                      <Empty
                        title="Nenhum contato encontrado"
                        description={
                          view === "stock"
                            ? "Importe um CSV ou ajuste os filtros para ver os leads disponíveis."
                            : "Novos contatos aparecerão aqui quando forem liberados ou quando corresponderem aos filtros."
                        }
                      />
                    ) : (
                      <div className="lead-list">
                        {leads.map((lead) => (
                          <article className="lead-card" key={lead.id}>
                            {canSelect && (
                              <input
                                aria-label={`Selecionar ${lead.name}`}
                                type="checkbox"
                                className="lead-checkbox"
                                checked={selected.includes(lead.id)}
                                disabled={busy}
                                onChange={(e) =>
                                  setSelected(
                                    e.target.checked
                                      ? [...selected, lead.id]
                                      : selected.filter((id) => id !== lead.id),
                                  )
                                }
                              />
                            )}
                            <div className="lead-main">
                              <div className="lead-top">
                                <h3>{lead.name}</h3>
                                <span className={`status-pill ${lead.status}`}>
                                  {statuses[lead.status]}
                                </span>
                              </div>
                              <p className="phone">
                                {phoneLabel(lead.phone)}
                                <button
                                  className="text-button"
                                  onClick={() => copy(lead)}
                                >
                                  {copied === lead.id
                                    ? "Copiado!"
                                    : "Copiar número"}
                                </button>
                              </p>
                              <p className="muted lead-origin">
                                {lead.source}
                                {lead.campaign ? ` · ${lead.campaign}` : ""}
                                {lead.batch_id
                                  ? ` · Lote ${lead.batch_id.slice(0, 8)}`
                                  : ""}
                              </p>
                              {lead.notes && (
                                <p className="lead-note">{lead.notes}</p>
                              )}
                              <div className="lead-footer">
                                <span>
                                  Atualizado {formatDate(lead.updated_at)}
                                </span>
                                {lead.follow_up_at && (
                                  <span
                                    className={
                                      new Date(lead.follow_up_at) < new Date()
                                        ? "overdue"
                                        : "cyan"
                                    }
                                  >
                                    Retorno: {formatDate(lead.follow_up_at)}
                                  </span>
                                )}
                                <button
                                  className="secondary"
                                  onClick={() => setEditing(lead)}
                                >
                                  Abrir contato
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    <div className="pagination">
                      <span className="muted">
                        Página {page + 1} de{" "}
                        {Math.max(1, Math.ceil(total / pageSize))}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => setPage((p) => p - 1)}
                        disabled={!page || loading}
                      >
                        Anterior
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={(page + 1) * pageSize >= total || loading}
                      >
                        Próxima
                      </button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          {editing && (
            <LeadEditor
              key={editing.id}
              lead={editing}
              profile={profile}
              people={people}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                setNotice("Contato salvo com sucesso.");
                reload();
              }}
            />
          )}
          <footer className="app-footer">
            TechVendas · Contatos manuais, resultados organizados.
            <span>Horário de Brasília</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Glyph kind="leads" />
      </span>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}
