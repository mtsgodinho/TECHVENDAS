import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  normalizePhone,
  parseSourceDate,
  exportCsv,
  guessColumn,
} from "../lib/csv.ts";
test("CSV Maria: BOM, ponto e vírgula, vírgula interna, aspas escapadas e quebra de linha", () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFNome;Telefone;Obs\r\n"Ana, Silva";11988887777;"Disse ""sim""\namanhã"\r\n',
    ),
    [
      ["Nome", "Telefone", "Obs"],
      ["Ana, Silva", "11988887777", 'Disse "sim"\namanhã'],
    ],
  );
});
test("detecta vírgula e tabulação respeitando campos entre aspas", () => {
  assert.deepEqual(parseCsv("Nome,Telefone\nAna,11988887777"), [
    ["Nome", "Telefone"],
    ["Ana", "11988887777"],
  ]);
  assert.deepEqual(parseCsv("Nome\tTelefone\nAna\t11988887777"), [
    ["Nome", "Telefone"],
    ["Ana", "11988887777"],
  ]);
});
test("rejeita arquivo malformado, cabeçalhos ambíguos e linhas inconsistentes", () => {
  for (const csv of [
    "",
    "Nome;Nome\nA;B",
    "Nome;\nA;B",
    "Nome;Telefone\nA",
    'Nome;Obs\nA;"aberto',
    'Nome;Obs\nA;"campo"resto',
  ])
    assert.throws(() => parseCsv(csv));
});
test("normalização brasileira identifica duplicados em diferentes formatos", () => {
  for (const value of [
    "(11) 98888-7777",
    "5511988887777",
    "+55 11 98888-7777",
    "0055 11 98888-7777",
  ])
    assert.equal(normalizePhone(value), "5511988887777");
  assert.equal(normalizePhone("(11) 3333-4444"), "551133334444");
  for (const value of ["123", "00000000000", "5511000000000", "9911988887777"])
    assert.equal(normalizePhone(value), null);
});
test("datas brasileiras e ISO usam Brasília e rejeitam datas impossíveis", () => {
  assert.equal(parseSourceDate("05/11/2026 14:30"), "2026-11-05T17:30:00.000Z");
  assert.equal(parseSourceDate("2026-11-05"), "2026-11-05T03:00:00.000Z");
  assert.equal(parseSourceDate("2026-11-05T14:30"), "2026-11-05T17:30:00.000Z");
  assert.equal(
    parseSourceDate("2026-11-05T14:30:00Z"),
    "2026-11-05T14:30:00.000Z",
  );
  assert.equal(parseSourceDate(""), null);
  for (const v of [
    "não-data",
    "31/02/2026",
    "2026-13-01",
    "2026-02-31T12:00:00Z",
    "2026-11-05T24:00:00Z",
  ])
    assert.throws(() => parseSourceDate(v));
});
test("exportação protege fórmulas em planilhas, aspas e caracteres especiais", () => {
  const text = exportCsv([
    ["Nome", "Obs"],
    ["José", ' =HYPERLINK("x")'],
  ]);
  assert.ok(text.startsWith("\uFEFF"));
  assert.deepEqual(parseCsv(text), [
    ["Nome", "Obs"],
    ["José", '\' =HYPERLINK("x")'],
  ]);
});
test("mapeamento ignora caixa, acentos e separadores", () => {
  assert.equal(
    guessColumn(["Nome Completo", "TELEFONE", "Campánha"], ["nome_completo"]),
    "0",
  );
  assert.equal(guessColumn(["Nome"], ["telefone"]), "");
});
