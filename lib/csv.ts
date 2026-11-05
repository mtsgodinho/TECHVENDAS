// RFC 4180 quoting, embedded newlines and Brazilian spreadsheet delimiters.
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const first = input.split(/\r?\n/)[0];
  const counts = (d: string) => {
    let quoted = false,
      n = 0;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') quoted = !quoted;
      else if (!quoted && first[i] === d) n++;
    }
    return n;
  };
  const delimiter = [";", ",", "\t"].sort((a, b) => counts(b) - counts(a))[0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell.length || closed)
        throw new Error("CSV inválido: aspas fora do início de um campo.");
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell.trim());
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && !/\s/.test(c))
        throw new Error("CSV inválido após fechamento de aspas.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error("CSV inválido: campo com aspas não foi fechado.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) throw new Error("O arquivo CSV está vazio.");
  if (new Set(rows[0]).size !== rows[0].length || rows[0].some((h) => !h))
    throw new Error("As colunas precisam ter nomes únicos e não vazios.");
  if (rows.slice(1).some((r) => r.length !== rows[0].length))
    throw new Error(
      "Há linhas com quantidade de colunas diferente do cabeçalho.",
    );
  return rows;
}
export function normalizePhone(value: string) {
  let phone = value.replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.length === 10 || phone.length === 11) phone = "55" + phone;
  return /^55[1-9]\d[2-9]\d{7,8}$/.test(phone) ? phone : null;
}
export function parseSourceDate(value: string) {
  if (!value.trim()) return null;
  let v = value.trim();
  const br = v.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (br)
    v = `${br[3]}-${br[2]}-${br[1]}T${br[4] || "00"}:${br[5] || "00"}:${br[6] || "00"}-03:00`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T00:00:00-03:00";
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(v))
    v = v.replace(" ", "T") + (v.length === 16 ? ":00" : "") + "-03:00";
  else if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v))
    throw new Error("Data inválida. Use DD/MM/AAAA ou ISO.");
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) throw new Error("Data inválida.");
  const day = v.slice(0, 10),
    calendar = new Date(`${day}T00:00:00Z`);
  if (
    Number.isNaN(calendar.valueOf()) ||
    calendar.toISOString().slice(0, 10) !== day ||
    Number(v.slice(11, 13)) > 23 ||
    Number(v.slice(14, 16)) > 59
  )
    throw new Error("Data inválida.");
  return d.toISOString();
}
export function exportCsv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export function guessColumn(headers: string[], aliases: string[]) {
  const normal = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[ _-]/g, "");
  const index = headers.findIndex((h) =>
    aliases.some((a) => normal(h) === normal(a)),
  );
  return index < 0 ? "" : String(index);
}
