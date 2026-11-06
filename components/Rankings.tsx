"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { rankFor, rankingRange, ranks, type Period } from "../lib/ranking";
import type { Profile } from "../lib/crm";
import RankBadge from "./RankBadge";
type Row = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  total_sales: number;
  period_sales: number;
  position: number;
  archived: boolean;
};
type Board = {
  rows: Row[];
  self: Row | null;
  period_sales: number;
  total_sellers: number;
};
export default function Rankings({
  profile,
  refresh,
}: {
  profile: Profile;
  refresh: number;
}) {
  const [period, setPeriod] = useState<Period>("monthly"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [page, setPage] = useState(0),
    [data, setData] = useState<Board | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    let range;
    try {
      range = rankingRange(period, start, end);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    supabase
      ?.rpc("seller_ranking", {
        p_from: range.from,
        p_until: range.until,
        p_offset: page * 30,
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setError(
            "Não foi possível carregar o ranking. Confira a conexão e a atualização 008_rankings.sql.",
          );
        else setData(data as Board);
      });
    return () => {
      active = false;
    };
  }, [period, start, end, page, refresh, retry]);
  const personal = data?.self,
    progression = rankFor(personal?.total_sales || 0),
    progress = progression.next
      ? Math.min(
          100,
          Math.max(
            0,
            (((personal?.total_sales || 0) - progression.current.min) /
              (progression.next.min - progression.current.min)) *
              100,
          ),
        )
      : 100;
  return (
    <section className="ranking-panel" aria-label="Ranking de vendedores">
      <p className="muted">
        Vendas confirmadas com valor registrado. Períodos no horário de
        Brasília; semana de segunda a domingo. As patentes usam o total
        acumulado, independentemente do período.
      </p>
      {profile.role !== "admin" && personal && (
        <div className="panel rank-personal">
          <RankBadge sales={personal.total_sales} />
          <div>
            <p className="eyebrow">SUA PATENTE</p>
            <h2>{progression.current.name}</h2>
            <p>{personal.total_sales} vendas acumuladas</p>
            <progress
              max="100"
              value={progress}
              aria-label="Progresso da patente"
            />
            <p>
              {progression.next
                ? `Faltam ${progression.next.min - personal.total_sales} vendas para ${progression.next.name}.`
                : "Você alcançou a patente máxima: Diamante!"}
            </p>
          </div>
        </div>
      )}
      <div className="rank-levels">
        {ranks.map((r, i) => (
          <div className="panel" key={r.name}>
            <RankBadge sales={r.min} small />
            <span>
              {r.min}
              {ranks[i + 1] ? ` a ${ranks[i + 1].min - 1}` : "+"} vendas
            </span>
          </div>
        ))}
      </div>
      <div className="panel ranking-board">
        <div className="section-heading">
          <div>
            <h2>Ranking de vendas</h2>
            <p className="muted">Empates recebem a mesma posição.</p>
          </div>
          <label>
            Período do ranking
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as Period);
                setPage(0);
              }}
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
        </div>
        {period === "custom" && (
          <div className="filters">
            <label>
              Data inicial
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
        )}
        {error ? (
          <p className="notice" role="alert">
            {error}{" "}
            <button className="text-button" onClick={() => setRetry(retry + 1)}>
              Tentar novamente
            </button>
          </p>
        ) : !data ? (
          <p aria-live="polite">Carregando ranking…</p>
        ) : (
          <>
            <p className="notice">
              {data.period_sales} vendas no período · {data.total_sellers}{" "}
              vendedores
            </p>
            {data.rows.length === 0 && (
              <p className="muted">
                Nenhum vendedor para mostrar neste período.
              </p>
            )}
            <ol className="rank-list">
              {data.rows.map((row) => (
                <li
                  className={
                    row.id === profile.id ? "rank-row rank-self" : "rank-row"
                  }
                  key={row.id}
                >
                  <span className="rank-position">{row.position}º</span>
                  {row.avatar_url && (
                    <img
                      src={row.avatar_url}
                      width="44"
                      height="44"
                      className="profile-avatar"
                      alt=""
                    />
                  )}
                  <div className="rank-name">
                    <strong>
                      {row.full_name}
                      {row.id === profile.id ? " (você)" : ""}
                    </strong>
                    {row.archived && (
                      <span className="muted">Acesso arquivado</span>
                    )}
                    <RankBadge sales={row.total_sales} small />
                  </div>
                  <div className="rank-score">
                    <strong>{row.period_sales}</strong>
                    <span>vendas no período</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="pagination">
              <span>Página {page + 1}</span>
              <button
                className="secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <button
                className="secondary"
                disabled={(page + 1) * 30 >= data.total_sellers}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
