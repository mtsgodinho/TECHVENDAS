"use client";
import { useEffect, useId, useRef, useState } from "react";

type Tone = "cyan" | "blue" | "violet" | "green";
const colors: Record<Tone, string> = {
  cyan: "#00ddff",
  blue: "#5e9bff",
  violet: "#b19aff",
  green: "#43e6b0",
};

function useCounter(target: number, loading: boolean) {
  const [display, setDisplay] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (loading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setDisplay(target);
      return;
    }
    const from = current.current;
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const fraction = Math.min(1, (time - start) / 650);
      const next = Math.round(
        from + (target - from) * (1 - Math.pow(1 - fraction, 3)),
      );
      current.current = next;
      setDisplay(next);
      if (fraction < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, loading]);
  return display;
}

export default function DigitalGauge({
  label,
  value,
  total,
  loading,
  tone,
  index,
  scope,
}: {
  label: string;
  value: number;
  total: number;
  loading: boolean;
  tone: Tone;
  index: number;
  scope: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const percent =
    loading || total <= 0
      ? 0
      : Math.max(0, Math.min(100, (value / total) * 100));
  const color = colors[tone];
  const display = useCounter(value, loading);
  const share = percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <article
      className="instrument-card"
      data-tone={tone}
      aria-labelledby={`title-${id}`}
      aria-busy={loading}
    >
      <div className="instrument-heading">
        <span className="instrument-symbol" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M3 15a9 9 0 1 1 18 0M5 15h2m10 0h2M12 5v2m-6 1 1.5 1.5M18 8l-1.5 1.5M12 15l4-5" />
            <circle cx="12" cy="15" r="2" />
          </svg>
        </span>
        <h3 id={`title-${id}`}>{label}</h3>
        <span className="instrument-channel" aria-hidden="true">
          0{index + 1}
        </span>
      </div>
      <div className="instrument-face">
        <svg
          viewBox="0 0 260 196"
          className="instrument-dial"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`arc-${id}`}
              x1="26"
              y1="132"
              x2="234"
              y2="30"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={color} stopOpacity=".35" />
              <stop offset="1" stopColor={color} />
            </linearGradient>
            <radialGradient id={`halo-${id}`}>
              <stop stopColor={color} stopOpacity=".13" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="130" cy="118" r="105" fill={`url(#halo-${id})`} />
          <path
            d="M26 132a104 104 0 0 1 208 0"
            pathLength="100"
            className="dial-outer"
          />
          <path d="M37 132a93 93 0 0 1 186 0" className="dial-inner" />
          <path
            d="M26 132a104 104 0 0 1 208 0"
            pathLength="100"
            className="dial-progress"
            stroke={`url(#arc-${id})`}
            style={{ strokeDashoffset: 100 - percent }}
          />
          {Array.from({ length: 21 }, (_, i) => {
            const a = Math.PI - (i * Math.PI) / 20;
            const inner = i % 5 === 0 ? 78 : 83;
            return (
              <line
                key={i}
                x1={130 + inner * Math.cos(a)}
                y1={132 - inner * Math.sin(a)}
                x2={130 + 88 * Math.cos(a)}
                y2={132 - 88 * Math.sin(a)}
                stroke={i * 5 <= percent && !loading ? color : "#334962"}
                strokeOpacity={i % 5 === 0 ? 1 : 0.6}
                strokeWidth={i % 5 === 0 ? 1.8 : 1}
              />
            );
          })}
          <text x="42" y="151" className="dial-bound">
            0
          </text>
          <text x="218" y="151" className="dial-bound" textAnchor="end">
            100%
          </text>
          <g
            className="dial-needle"
            style={{ transform: `rotate(${-90 + percent * 1.8}deg)` }}
          >
            <path d="M127 130 130 57 133 130Z" fill={color} opacity=".9" />
            <path d="M130 69V124" stroke="#effcff" strokeWidth=".8" />
          </g>
          <circle
            cx="130"
            cy="132"
            r="7"
            fill="#0c1729"
            stroke={color}
            strokeWidth="1.5"
          />
          <circle cx="130" cy="132" r="2" fill={color} />
        </svg>
        <div className="instrument-readout">
          <strong aria-hidden="true">
            {loading ? "—" : display.toLocaleString("pt-BR")}
          </strong>
          <span>LEADS</span>
        </div>
      </div>
      <div className="instrument-footer">
        <span>
          <i aria-hidden="true" />
          {scope}
        </span>
        <b>{loading ? "—" : `${share}% da base`}</b>
      </div>
      <span className="sr-only">
        {loading
          ? "Carregando"
          : `${label}: ${value.toLocaleString("pt-BR")} leads, ${share}% da base de ${total.toLocaleString("pt-BR")} leads.`}
      </span>
    </article>
  );
}
