import { rankFor, ranks } from "../lib/ranking";
export default function RankBadge({
  sales,
  small = false,
}: {
  sales: number;
  small?: boolean;
}) {
  const { current } = rankFor(sales);
  const level = ranks.findIndex((r) => r.name === current.name) + 1;
  return (
    <span
      className={`rank-badge rank-${current.tone} ${small ? "rank-small" : ""}`}
      aria-label={`Patente ${current.name}`}
    >
      <svg viewBox="0 0 72 84" aria-hidden="true">
        <path
          d="M36 3 65 15v26c0 19-14 31-29 39C21 72 7 60 7 41V15Z"
          fill="currentColor"
          fillOpacity=".12"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d={
            current.tone === "diamond"
              ? "M36 15 52 30 36 48 20 30Z"
              : "m36 15 5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2Z"
          }
          fill="currentColor"
        />
        {Array.from({ length: level }, (_, i) => (
          <circle
            key={i}
            cx={36 + (i - (level - 1) / 2) * 8}
            cy="62"
            r="2.5"
            fill="currentColor"
          />
        ))}
      </svg>
      <strong>{current.name}</strong>
    </span>
  );
}
