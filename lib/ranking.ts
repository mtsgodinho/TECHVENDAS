export const ranks = [
  { name: "Bronze", min: 0, tone: "bronze", symbol: "B" },
  { name: "Prata", min: 10, tone: "silver", symbol: "P" },
  { name: "Ouro", min: 25, tone: "gold", symbol: "O" },
  { name: "Platina", min: 50, tone: "platinum", symbol: "P" },
  { name: "Diamante", min: 100, tone: "diamond", symbol: "D" },
] as const;
export function rankFor(total: number) {
  const index = ranks.findLastIndex((r) => total >= r.min);
  return { current: ranks[Math.max(0, index)], next: ranks[index + 1] || null };
}
export type Period = "daily" | "weekly" | "monthly" | "custom";
const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
export function rankingRange(
  period: Period,
  start = "",
  end = "",
  now = new Date(),
) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  let from = today,
    until = day(y, m, d + 1);
  if (period === "weekly") {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const monday = d - ((weekday + 6) % 7);
    from = day(y, m, monday);
    until = day(y, m, monday + 7);
  }
  if (period === "monthly") {
    from = day(y, m, 1);
    until = day(y, m + 1, 1);
  }
  if (period === "custom") {
    const valid = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
    if (!valid(start) || !valid(end) || start > end)
      throw Error("Selecione as datas inicial e final do período.");
    const [ey, em, ed] = end.split("-").map(Number);
    from = start;
    until = day(ey, em, ed + 1);
  }
  return { from: from + "T00:00:00-03:00", until: until + "T00:00:00-03:00" };
}
