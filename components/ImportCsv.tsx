"use client";
import { useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabase";
import {
  guessColumn,
  normalizePhone,
  parseCsv,
  parseSourceDate,
} from "../lib/csv";
import { origins } from "../lib/crm";
const fields = {
  name: "Nome *",
  phone: "Telefone *",
  source_date: "Data",
  campaign: "Campanha",
  source: "Origem",
};
type Mapping = Record<keyof typeof fields, string>;
const blank: Mapping = {
  name: "",
  phone: "",
  source_date: "",
  campaign: "",
  source: "",
};
export default function ImportCsv({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Mapping>(blank),
    [origin, setOrigin] = useState(origins[3]),
    [filename, setFilename] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<{
      imported: number;
      duplicates: number;
      invalid: number;
    } | null>(null);
  const preview = useMemo(() => {
    const seen = new Set<string>();
    let invalid = 0,
      duplicates = 0;
    const data = rows.slice(1).flatMap((row) => {
      const value = (field: keyof Mapping) =>
        mapping[field] === "" ? "" : row[Number(mapping[field])] || "";
      const phone = normalizePhone(value("phone"));
      const name = value("name").trim();
      let date: string | null = null;
      try {
        date = parseSourceDate(value("source_date"));
      } catch {
        invalid++;
        return [];
      }
      if (!phone || !name) {
        invalid++;
        return [];
      }
      if (seen.has(phone)) {
        duplicates++;
        return [];
      }
      seen.add(phone);
      return [
        {
          name,
          phone,
          source_date: date,
          campaign: value("campaign"),
          source: value("source") || origin,
          metadata: Object.fromEntries(
            rows[0].map((h, i) => [h, row[i] || ""]),
          ),
        },
      ];
    });
    return { data, invalid, duplicates };
  }, [rows, mapping, origin]);
  const mapped = Object.values(mapping).filter(Boolean);
  const validMapping =
    mapping.name !== "" &&
    mapping.phone !== "" &&
    new Set(mapped).size === mapped.length;
  async function read(e: ChangeEvent<HTMLInputElement>) {
    setMessage("");
    setResult(null);
    setRows([]);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Selecione um CSV de até 5 MB.");
      return;
    }
    try {
      const text = await file.text();
      if (text.includes("\uFFFD"))
        throw new Error(
          "O arquivo contém caracteres inválidos. Salve-o como CSV UTF-8 e tente novamente.",
        );
      const parsed = parseCsv(text);
      if (parsed.length < 2 || parsed.length > 5001)
        throw new Error(
          "O arquivo deve ter de 1 a 5000 registros. Divida arquivos maiores.",
        );
      setRows(parsed);
      setFilename(file.name);
      const headers = parsed[0];
      setMapping({
        name: guessColumn(headers, [
          "nome",
          "name",
          "nome completo",
          "cliente",
        ]),
        phone: guessColumn(headers, [
          "telefone",
          "phone",
          "celular",
          "whatsapp",
          "numero",
        ]),
        source_date: guessColumn(headers, [
          "data",
          "date",
          "created_at",
          "data cadastro",
        ]),
        campaign: guessColumn(headers, ["campanha", "campaign"]),
        source: guessColumn(headers, ["origem", "source"]),
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível ler o CSV.",
      );
    }
  }
  async function submit() {
    if (!supabase || !validMapping || !preview.data.length) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("import_leads", {
        p_rows: preview.data,
      });
      if (error) throw error;
      setResult({
        ...data,
        duplicates: data.duplicates + preview.duplicates,
        invalid: data.invalid + preview.invalid,
      });
      setRows([]);
      onImported();
    } catch {
      setMessage(
        "Não foi possível importar. Confira a conexão e se as migrações do banco foram aplicadas. Você pode tentar novamente sem duplicar os leads já importados.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="import-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ABASTEÇA SEU ESTOQUE</p>
          <h2>Importar leads da Maria</h2>
          <p className="muted">
            Confira as colunas e a prévia antes de importar. Nenhum lead será
            liberado automaticamente.
          </p>
        </div>
      </div>
      <label className="upload">
        Selecionar arquivo CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={read}
          disabled={busy}
        />
        <span className="muted">
          UTF-8 · vírgula, ponto e vírgula ou tabulação · até 5000 linhas / 5 MB
        </span>
      </label>
      {message && (
        <p className="notice error" role="alert">
          {message}
        </p>
      )}
      {result && (
        <div className="notice" role="status">
          <strong>Importação concluída</strong>
          <p>
            {result.imported} importados · {result.duplicates} duplicados ·{" "}
            {result.invalid} inválidos.
          </p>
          <p>
            Status, observações e histórico dos leads existentes foram
            preservados.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <h3>
            {filename} · {rows.length - 1} registros
          </h3>
          <div className="filters mapping">
            {Object.entries(fields).map(([field, label]) => (
              <label key={field}>
                {label}
                <select
                  value={mapping[field as keyof Mapping]}
                  disabled={busy}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field]: e.target.value });
                    setResult(null);
                  }}
                >
                  <option value="">
                    {field === "name" || field === "phone"
                      ? "Selecione a coluna"
                      : "Não informado"}
                  </option>
                  {rows[0].map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Origem padrão
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                disabled={busy}
              >
                {origins.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          {!validMapping ? (
            <p className="notice">
              Selecione uma coluna diferente para cada campo, incluindo nome e
              telefone.
            </p>
          ) : (
            <>
              <p className="muted">
                {preview.data.length} válidos · {preview.duplicates} duplicados
                no arquivo · {preview.invalid} inválidos. Duplicados existentes
                no banco serão identificados ao importar.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Telefone normalizado</th>
                      <th>Origem</th>
                      <th>Campanha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.slice(0, 5).map((lead, i) => (
                      <tr key={i}>
                        <td>{lead.name}</td>
                        <td>{lead.phone}</td>
                        <td>{lead.source}</td>
                        <td>{lead.campaign || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="footnote">
                Prévia dos primeiros 5 registros válidos. Datas sem fuso serão
                interpretadas no horário de Brasília.
              </p>
              <button onClick={submit} disabled={busy || !preview.data.length}>
                {busy
                  ? "Importando…"
                  : `Importar ${preview.data.length} leads para o estoque`}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
