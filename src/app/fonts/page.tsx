"use client";

import { useEffect, useState } from "react";

/* Шрифты-кандидаты (все с поддержкой кириллицы, подходят для финансового
   интерфейса). Цифры на сайте набраны моноширинным IBM Plex Mono — здесь они
   остаются моно, чтобы превью точно повторяло сайт; кандидат меняет текст UI. */
const FONTS: { name: string; family: string; note: string }[] = [
  { name: "IBM Plex Sans", family: "'IBM Plex Sans'", note: "сейчас на сайте" },
  { name: "Inter", family: "'Inter'", note: "нейтральный, самый популярный для дашбордов" },
  { name: "Manrope", family: "'Manrope'", note: "чуть мягче и современнее" },
  { name: "Onest", family: "'Onest'", note: "аккуратный, отличная кириллица" },
  { name: "Golos Text", family: "'Golos Text'", note: "российский шрифт, плотная кириллица" },
  { name: "Geologica", family: "'Geologica'", note: "техничный, строгий" },
  { name: "Wix Madefor Text", family: "'Wix Madefor Text'", note: "дружелюбный, для интерфейсов" },
];

const GF_URL =
  "https://fonts.googleapis.com/css2?" +
  [
    "IBM+Plex+Sans:wght@400;500;600;700",
    "Inter:wght@400;500;600;700",
    "Manrope:wght@400;500;600;700",
    "Onest:wght@400;500;600;700",
    "Golos+Text:wght@400;500;600;700",
    "Geologica:wght@400;500;600;700",
    "Wix+Madefor+Text:wght@400;500;600;700",
  ]
    .map((f) => "family=" + f)
    .join("&") +
  "&display=swap";

function Mock({ family }: { family: string }) {
  const rows = [
    { n: "Bitcoin", v: "$120,272" },
    { n: "Наличные", v: "$52,000" },
    { n: "Mercedes Benz V-klass", v: "$208,200" },
  ];
  return (
    <div style={{ fontFamily: `${family}, sans-serif`, background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="k">Общий капитал</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>$780,628</div>
        </div>
        <span className="delta up mono">+5.8%</span>
      </div>
      <div style={{ borderTop: "1px solid var(--hair-2)" }}>
        {rows.map((r) => (
          <div key={r.n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--hair-2)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.n}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>{r.v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>
        <span>Обзор</span>
        <span>Инвестиции</span>
        <span>Расходы</span>
        <span>Активы</span>
      </div>
    </div>
  );
}

export default function FontsPreview() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const id = "gf-preview";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = GF_URL;
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f3f0", padding: "28px 24px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>
          ← на дашборд
        </a>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "10px 0 4px" }}>Выбор шрифта</h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 6px", maxWidth: 640 }}>
          Каждая карточка — кусочек вашего дашборда, набранный своим шрифтом. Цифры остаются моноширинными (как сейчас на сайте). Выберите понравившийся —
          напишите мне его название, и я применю его ко всему сайту.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 22px" }}>
          Больше вариантов можно посмотреть на <a href="https://fonts.google.com/?subset=cyrillic&category=Sans+Serif" target="_blank" rel="noreferrer" style={{ color: "var(--sync)" }}>fonts.google.com</a> (фильтр: кириллица).
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 18 }}>
          {FONTS.map((f) => (
            <div
              key={f.name}
              onClick={() => setActive(f.name)}
              style={{ cursor: "pointer", border: active === f.name ? "2px solid var(--pos)" : "2px solid transparent", borderRadius: 16, padding: 4 }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 4px 8px" }}>
                <span style={{ fontFamily: `${f.family}, sans-serif`, fontSize: 16, fontWeight: 600 }}>{f.name}</span>
                <span style={{ fontSize: 11, color: active === f.name ? "var(--pos)" : "var(--muted)" }}>{active === f.name ? "выбран ✓" : f.note}</span>
              </div>
              <Mock family={f.family} />
            </div>
          ))}
        </div>

        {active && (
          <div style={{ position: "sticky", bottom: 18, marginTop: 24, background: "var(--ink)", color: "var(--surface)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, justifyContent: "center", fontSize: 14, boxShadow: "0 12px 30px rgba(0,0,0,.25)" }}>
            Выбран шрифт <b style={{ fontFamily: `${FONTS.find((x) => x.name === active)?.family}, sans-serif` }}>{active}</b> — напишите мне «поставь {active}», и я применю его ко всему сайту.
          </div>
        )}
      </div>
    </div>
  );
}
