"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
type Summary = {
  revenue: number;
  commission: number;
  sales: number;
  legacy_sales: number;
  sellers: {
    seller_id: string;
    full_name: string;
    sales: number;
    revenue: number;
    commission: number;
  }[];
};
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
export default function FinancePanel({
  admin,
  refresh,
}: {
  admin: boolean;
  refresh: number;
}) {
  const [data, setData] = useState<Summary | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    supabase?.rpc("finance_summary").then(({ data, error }) => {
      if (active) {
        setError(!!error);
        if (!error) setData(data as Summary);
      }
    });
    return () => {
      active = false;
    };
  }, [refresh, retry]);
  return (
    <section
      className="panel"
      aria-label="Financeiro"
      style={{ marginBottom: 24, padding: 24 }}
    >
      <h2>{admin ? "Financeiro" : "Minhas comissões"}</h2>
      <p className="muted">
        Acumulado das vendas registradas com valor. Comissão fixa de R$ 20,00
        por venda. Valores de comissão gerados; pagamentos ainda não são
        registrados neste painel.
      </p>
      {error ? (
        <p role="alert" className="notice error">
          Não foi possível carregar o financeiro.{" "}
          <button className="text-button" onClick={() => setRetry(retry + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : !data ? (
        <p aria-live="polite">Carregando financeiro…</p>
      ) : (
        <>
          <div className="metric-grid">
            {admin && (
              <div className="metric-card">
                <p>Total vendido</p>
                <h2>{money(data.revenue)}</h2>
              </div>
            )}
            <div className="metric-card">
              <p>{admin ? "Comissões dos vendedores" : "Comissão a receber"}</p>
              <h2>{money(data.commission)}</h2>
            </div>
            <div className="metric-card">
              <p>Vendas com valor registrado</p>
              <h2>{data.sales}</h2>
            </div>
          </div>
          {admin &&
            data.sellers.map((s) => (
              <div className="notice" key={s.seller_id}>
                <strong>{s.full_name}</strong>
                <p>
                  {s.sales} vendas · Vendido: {money(s.revenue)} · Comissão:{" "}
                  {money(s.commission)}
                </p>
              </div>
            ))}
          {data.legacy_sales > 0 && (
            <p className="notice">
              {data.legacy_sales} venda(s) antiga(s) sem valor informado, fora
              destes totais. O administrador pode abrir o contato e registrar o
              valor para incluí-las.
            </p>
          )}
        </>
      )}
    </section>
  );
}
