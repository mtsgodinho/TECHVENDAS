"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDate, statuses, type Profile, type Status } from "../lib/crm";
type SellerBatch = {
  batch_id: string;
  created_at: string;
  total: number;
  active: number;
  recalled: number;
  transferred: number;
  statuses: Partial<Record<Status, number>>;
};
export default function SellerBatches({
  people,
  seller,
  onSellerChange,
  onBatchSelect,
  onChanged,
  refresh,
}: {
  people: Profile[];
  seller: string;
  onSellerChange: (id: string) => void;
  onBatchSelect: (id: string) => void;
  onChanged: (message: string) => void;
  refresh: number;
}) {
  const [batches, setBatches] = useState<SellerBatch[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [version, setVersion] = useState(0);
  const request = useRef(0);
  const sellerName =
    people.find((p) => p.id === seller)?.full_name || "vendedor";
  useEffect(() => {
    let active = true;
    const token = ++request.current;
    setBatches([]);
    setHasMore(false);
    setError("");
    if (!seller || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc("seller_batches", { p_seller: seller, p_offset: 0, p_limit: 20 })
      .then(({ data, error }) => {
        if (!active || token !== request.current) return;
        if (error)
          setError(
            "Não foi possível consultar os lotes. Confira a conexão e se a atualização do painel de vendedores foi aplicada no Supabase.",
          );
        else {
          setBatches(data as SellerBatch[]);
          setHasMore(data.length === 20);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [seller, refresh, version]);
  async function more() {
    if (!supabase || !seller) return;
    const token = request.current;
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("seller_batches", {
        p_seller: seller,
        p_offset: batches.length,
        p_limit: 20,
      });
      if (error) throw error;
      if (token !== request.current) return;
      setBatches((current) => [...current, ...(data as SellerBatch[])]);
      setHasMore(data.length === 20);
    } catch {
      if (token === request.current)
        setError("Não foi possível carregar mais lotes. Tente novamente.");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  async function recall(batch: SellerBatch) {
    if (!supabase || busy) return;
    const confirmed = window.confirm(
      `Retirar o lote ${batch.batch_id.slice(0, 8)} da fila de ${sellerName}?\n\nAté ${batch.active} contatos ativos voltarão ao estoque como Pendentes. Observações, datas de retorno e histórico serão preservados. Vendas, perdidos e contatos já transferidos não serão alterados.`,
    );
    if (!confirmed) return;
    setBusy(batch.batch_id);
    setError("");
    try {
      const { data, error } = await supabase.rpc("recall_batch", {
        p_batch: batch.batch_id,
        p_seller: seller,
      });
      if (error) throw error;
      onChanged(
        data.recalled
          ? `${data.recalled} contatos retirados da fila e devolvidos ao estoque. Histórico preservado.`
          : "Este lote já não tem contatos ativos com o vendedor.",
      );
      setVersion((v) => v + 1);
    } catch {
      setError(
        "Não foi possível retirar o lote. Atualize os dados e tente novamente.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className="panel seller-panel"
      aria-labelledby="seller-panel-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">GESTÃO DA EQUIPE</p>
          <h2 id="seller-panel-title">Vendedores e lotes</h2>
          <p className="muted">
            Selecione o vendedor para acompanhar os lotes, seus status e
            administrar a fila.
          </p>
        </div>
        <label className="seller-choice">
          Vendedor
          <select
            aria-label="Vendedor"
            value={seller}
            disabled={Boolean(busy)}
            onChange={(e) => onSellerChange(e.target.value)}
          >
            <option value="">Todos os vendedores</option>
            {people
              .filter(
                (p) =>
                  p.role === "attendant" &&
                  p.is_active !== false &&
                  !p.deleted_at,
              )
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {!seller ? (
        <p className="muted">
          Escolha um vendedor para visualizar seus lotes. A lista abaixo mostra
          a fila de toda a equipe.
        </p>
      ) : (
        <>
          {loading && !batches.length ? (
            <p role="status" className="loading-inline">
              Carregando lotes do vendedor…
            </p>
          ) : !batches.length && !error ? (
            <p className="muted">Este vendedor ainda não recebeu lotes.</p>
          ) : (
            <div className="seller-batches">
              {batches.map((batch) => (
                <article className="seller-batch" key={batch.batch_id}>
                  <div className="section-heading">
                    <div>
                      <h3>Lote {batch.batch_id.slice(0, 8)}</h3>
                      <p className="muted">
                        Liberado em {formatDate(batch.created_at)} ·{" "}
                        {batch.total} contatos recebidos
                      </p>
                    </div>
                    <span className="status-pill">{batch.active} na fila</span>
                  </div>
                  <div className="batch-statuses">
                    {Object.entries(statuses).map(([key, label]) => (
                      <span className={`status-pill ${key}`} key={key}>
                        {label}:{" "}
                        <strong>{batch.statuses[key as Status] || 0}</strong>
                      </span>
                    ))}
                    {!!batch.recalled && (
                      <span className="status-pill">
                        Retirados: {batch.recalled}
                      </span>
                    )}
                    {!!batch.transferred && (
                      <span className="status-pill">
                        Fora deste lote: {batch.transferred}
                      </span>
                    )}
                  </div>
                  <div className="batch-actions">
                    <button
                      className="secondary"
                      disabled={loading || Boolean(busy) || !batch.active}
                      onClick={() => onBatchSelect(batch.batch_id)}
                    >
                      Ver fila deste lote
                    </button>
                    <button
                      className="danger-button"
                      disabled={loading || Boolean(busy) || !batch.active}
                      onClick={() => recall(batch)}
                    >
                      {busy === batch.batch_id
                        ? "Retirando lote…"
                        : "Retirar lote da fila"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              className="secondary"
              onClick={more}
              disabled={loading || Boolean(busy)}
            >
              {loading ? "Carregando…" : "Carregar mais lotes"}
            </button>
          )}
        </>
      )}
      <p className="footnote">
        Retirar um lote não apaga leads. Os contatos ativos voltam ao estoque
        como Pendentes; vendas e perdidos são preservados. Os status refletem os
        contatos que ainda pertencem ao lote; retirados e transferidos aparecem
        separados.
      </p>
    </section>
  );
}
