"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Badge, CategoryDonut, catColorMap } from "@/lib/chart";
import { Topbar } from "../ui";

const fmtSigned = (n: number): string => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
const fmtRub = (n: number): string =>
  "₽ " + Math.round(n).toLocaleString("ru-RU");

type SeriesKey = "income" | "expenses" | "diff";
type ViewMode = "month" | "week";
type Currency = "USD" | "RUB";

export default function Expenses() {
  const { store, usdRub } = useApp();
  const months = store.expenseMonths;
  const weeks = store.expenseWeeks;
  const lastIdx = months.length - 1;
  const lastWeekIdx = weeks.length - 1;

  const [mode, setMode] = useState<ViewMode>("month");
  const [selIdx, setSelIdx] = useState(lastIdx);
  const [selWeekIdx, setSelWeekIdx] = useState(lastWeekIdx);
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ income: true, expenses: true, diff: true });
  const [currency, setCurrency] = useState<Currency>("USD");
  const [openCat, setOpenCat] = useState<string | null>(null);
  const toggle = (k: SeriesKey) => setShow((p) => ({ ...p, [k]: !p[k] }));

  const conv = (v: number) => currency === "RUB" ? v * usdRub : v;
  const fmtV = (v: number) => currency === "RUB" ? fmtRub(conv(v)) : fmt(v);
  const fmtVSigned = (v: number) => {
    const cv = conv(v);
    return (cv >= 0 ? "+" : "−") + (currency === "RUB" ? fmtRub(Math.abs(cv)) : fmt(Math.abs(cv)));
  };

  // Month mode
  const idx = Math.min(selIdx, lastIdx);
  const sel = months[idx];
  const period = sel?.period ?? "";
  const cats = (period && store.expensesByPeriod[period]) || store.expenseCats;
  const maxC = Math.max(1, ...cats.map((c) => c.value));
  const subs = (period && store.expenseSubs[period]) || {};

  // Week mode
  const wIdx = Math.min(selWeekIdx, lastWeekIdx);
  const selWeek = weeks[wIdx];
  const weekCats = (selWeek?.weekEnd && store.expenseWeeksByPeriod[selWeek.weekEnd]) || [];
  const weekSubs = (selWeek?.weekEnd && store.expenseWeekSubs[selWeek.weekEnd]) || {};
  const maxWC = Math.max(1, ...weekCats.map((c) => c.value));
  const [openWeekCat, setOpenWeekCat] = useState<string | null>(null);

  // Единая палитра категорий: объединяем имена из всех месяцев и недель,
  // суммируем и сортируем по убыванию — заметные категории получают «сильные»
  // первые цвета, и одна категория красится одинаково в donut и в стопке.
  const catColors = useMemo(() => {
    const totals: Record<string, number> = {};
    const collect = (rec: Record<string, { name: string; value: number }[]>) => {
      Object.values(rec).forEach((list) =>
        list.forEach((c) => {
          totals[c.name] = (totals[c.name] || 0) + c.value;
        })
      );
    };
    collect(store.expensesByPeriod);
    collect(store.expenseWeeksByPeriod);
    const names = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    return catColorMap(names);
  }, [store.expensesByPeriod, store.expenseWeeksByPeriod]);

  // Категории выбранного периода (для donut и списка-легенды).
  const activeCats = mode === "month" ? cats : weekCats;
  const donutData = activeCats
    .filter((c) => c.value > 0)
    .map((c) => ({ name: c.name, value: c.value, color: catColors[c.name] || "var(--faint)" }));
  const donutTotal = activeCats.reduce((s, c) => s + c.value, 0);

  // Стопка-диаграмма по времени: для каждого периода — разбивка по категориям.
  const stackBars = useMemo(() => {
    if (mode === "month") {
      return months.map((m) => {
        const list = (m.period && store.expensesByPeriod[m.period]) || [];
        return { label: m.m, cats: list, total: list.reduce((s, c) => s + c.value, 0) };
      });
    }
    return weeks.map((w) => {
      const list = (w.weekEnd && store.expenseWeeksByPeriod[w.weekEnd]) || [];
      return { label: w.w, cats: list, total: list.reduce((s, c) => s + c.value, 0) };
    });
  }, [mode, months, weeks, store.expensesByPeriod, store.expenseWeeksByPeriod]);
  const maxStack = Math.max(1, ...stackBars.map((b) => b.total));
  const hasStack = stackBars.some((b) => b.total > 0);
  const stackSelIdx = mode === "month" ? idx : wIdx;
  const onStackSelect = (i: number) =>
    mode === "month" ? setSelIdx(i) : (setSelWeekIdx(i), setOpenWeekCat(null));

  const expVal = sel?.v ?? 0;
  const incVal = sel?.income ?? 0;
  const diffVal = incVal - expVal;
  const hasIncome = months.some((m) => (m.income ?? 0) > 0);

  const scaleVals: number[] = [];
  months.forEach((m) => {
    if (show.expenses) scaleVals.push(m.v);
    if (show.income) scaleVals.push(m.income ?? 0);
  });
  const maxM = Math.max(1, ...scaleVals);
  const maxW = Math.max(1, ...weeks.map((w) => w.v));

  const SERIES: { key: SeriesKey; label: string; color: string }[] = [
    { key: "income", label: "Доходы", color: "var(--pos)" },
    { key: "expenses", label: "Расходы", color: "var(--neg)" },
    { key: "diff", label: "Разница", color: "var(--ink-2)" },
  ];

  const stats = [
    { key: "income" as SeriesKey, label: "Доходы", value: incVal, color: "var(--pos)", signed: false },
    { key: "expenses" as SeriesKey, label: "Расходы", value: expVal, color: "var(--neg)", signed: false },
    { key: "diff" as SeriesKey, label: "Разница", value: diffVal, color: diffVal >= 0 ? "var(--pos)" : "var(--neg)", signed: true },
  ].filter((s) => show[s.key]);

  const isEmpty = months.length === 0 && weeks.length === 0;

  // Shared currency toggle button
  const CurrencyToggle = () => (
    <div style={{ display: "flex", gap: 2, background: "var(--hair-2)", borderRadius: 8, padding: 3 }}>
      {(["USD", "RUB"] as Currency[]).map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          style={{
            padding: "3px 10px",
            borderRadius: 6,
            border: "none",
            background: currency === c ? "var(--card)" : "transparent",
            color: currency === c ? "var(--ink)" : "var(--muted)",
            cursor: "pointer",
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: currency === c ? 600 : 400,
            boxShadow: currency === c ? "0 1px 3px rgba(0,0,0,.08)" : "none",
            transition: "all .12s",
          }}
        >
          {c === "USD" ? "$" : "₽"}
        </button>
      ))}
    </div>
  );

  // Shared mode toggle
  const ModeToggle = () => (
    <div style={{ display: "flex", gap: 2, background: "var(--hair-2)", borderRadius: 8, padding: 3 }}>
      {(["month", "week"] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "none",
            background: mode === m ? "var(--card)" : "transparent",
            color: mode === m ? "var(--ink)" : "var(--muted)",
            cursor: "pointer",
            fontFamily: "var(--sans)",
            fontSize: 12,
            fontWeight: mode === m ? 600 : 400,
            boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.08)" : "none",
            transition: "all .12s",
          }}
        >
          {m === "month" ? "Месяц" : "Неделя"}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Topbar title="Расходы и доходы" sub="Импорт из Google Sheets" right={<Badge src="sheets" />} />

      {isEmpty ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          Нет данных. Расходы подтянутся из Google Sheets, доходы — из ДДС (дивиденды) при синхронизации.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          {/* Left card */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 18 }}>
              <ModeToggle />
            </div>

            {mode === "month" && (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                    {stats.map((s) => (
                      <div key={s.key}>
                        <div className="k">{s.label} за {sel?.m?.toLowerCase()}</div>
                        <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.02em", marginTop: 6, lineHeight: 1, color: s.color }}>
                          {s.signed ? fmtVSigned(s.value) : fmtV(s.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SERIES.map((s) => {
                      const on = show[s.key];
                      const disabled = s.key === "income" && !hasIncome;
                      return (
                        <button
                          key={s.key}
                          onClick={() => toggle(s.key)}
                          title={disabled ? "Доходы появятся после синхронизации ДДС" : undefined}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "5px 11px", borderRadius: 999,
                            border: "1px solid var(--hair)",
                            background: on ? "var(--hair-2)" : "transparent",
                            cursor: "pointer", fontFamily: "var(--sans)", fontSize: 12,
                            color: on ? "var(--ink)" : "var(--faint)",
                            opacity: disabled ? 0.5 : 1,
                          }}
                        >
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, opacity: on ? 1 : 0.35 }} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 200 }}>
                  {months.map((x, i) => {
                    const xi = x.income ?? 0;
                    const net = xi - x.v;
                    const here = i === idx;
                    return (
                      <button
                        key={x.period ?? x.m}
                        onClick={() => setSelIdx(i)}
                        title={`${x.m}: расходы ${fmtV(x.v)}${xi ? ` · доходы ${fmtV(xi)}` : ""}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--sans)" }}
                      >
                        {show.diff && (show.income || show.expenses) && (
                          <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, color: net >= 0 ? "var(--pos)" : "var(--neg)", opacity: here ? 1 : 0.6 }}>
                            {fmtVSigned(net)}
                          </span>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150, width: "100%", justifyContent: "center" }}>
                          {show.income && (
                            <div title={`Доходы ${fmtV(xi)}`} style={{ width: show.expenses ? "30%" : "46%", maxWidth: 22, height: `${((xi / maxM) * 150).toFixed(0)}px`, background: "var(--pos)", borderRadius: "4px 4px 0 0", opacity: here ? 0.95 : 0.4, transition: "opacity .12s" }} />
                          )}
                          {show.expenses && (
                            <div title={`Расходы ${fmtV(x.v)}`} style={{ width: show.income ? "30%" : "46%", maxWidth: 22, height: `${((x.v / maxM) * 150).toFixed(0)}px`, background: "var(--neg)", borderRadius: "4px 4px 0 0", opacity: here ? 0.95 : 0.4, transition: "opacity .12s" }} />
                          )}
                        </div>
                        <span className="axis" style={{ fontFamily: "var(--mono)", fontSize: 10, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400 }}>
                          {x.m}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-sub" style={{ marginTop: 12 }}>
                  {hasIncome
                    ? "Зелёный — доходы (дивиденды из ДДС), красный — расходы. Нажмите на месяц, чтобы увидеть его категории."
                    : "Нажмите на столбец месяца, чтобы посмотреть его категории. Доходы появятся после синхронизации ДДС."}
                </div>
              </>
            )}

            {mode === "week" && (
              <>
                <div style={{ marginBottom: 18 }}>
                  <div className="k">Расходы за {selWeek?.w ?? "—"}</div>
                  <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.02em", marginTop: 6, lineHeight: 1, color: "var(--neg)" }}>
                    {fmtV(selWeek?.v ?? 0)}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200 }}>
                  {weeks.map((x, i) => {
                    const here = i === wIdx;
                    return (
                      <button
                        key={x.weekEnd}
                        onClick={() => { setSelWeekIdx(i); setOpenWeekCat(null); }}
                        title={`${x.w}: ${fmtV(x.v)}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--sans)", minWidth: 0 }}
                      >
                        <div style={{ width: "70%", maxWidth: 22, height: `${((x.v / maxW) * 150).toFixed(0)}px`, background: "var(--neg)", borderRadius: "4px 4px 0 0", opacity: here ? 0.95 : 0.4, transition: "opacity .12s", marginBottom: 4 }} />
                        <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400, writingMode: "vertical-rl", transform: "rotate(180deg)", height: 46, lineHeight: 1 }}>
                          {x.w}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-sub" style={{ marginTop: 12 }}>
                  Нажмите на неделю, чтобы увидеть её категории.
                </div>
              </>
            )}
          </div>

          {/* Right card */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="k">
                {mode === "month"
                  ? `Категории расходов за ${sel?.m?.toLowerCase()}`
                  : `Категории за ${selWeek?.w ?? "—"}`}
              </div>
              <CurrencyToggle />
            </div>

            {donutData.length > 0 && (
              <CategoryDonut data={donutData} total={donutTotal} fmtV={fmtV} />
            )}

            {mode === "month" && (
              cats.length === 0 ? (
                <div className="h-sub">Нет категорий за этот месяц.</div>
              ) : (
                cats.map((cat) => {
                  const sub = (subs[cat.name] || []).slice().sort((a, b) => b.value - a.value);
                  const open = openCat === cat.name;
                  const maxS = Math.max(1, ...sub.map((s) => s.value));
                  return (
                    <div key={cat.name}>
                      <button
                        onClick={() => sub.length && setOpenCat(open ? null : cat.name)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 0", background: "none", border: "none", cursor: sub.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
                      >
                        <span style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 13, transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, opacity: sub.length ? 1 : 0 }}>›</span>
                        <span style={{ flex: "none", width: 9, height: 9, borderRadius: 2, background: catColors[cat.name] || "var(--faint)" }} />
                        <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink-2)" }}>{cat.name}</span>
                        <span className="mono" style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
                          {donutTotal ? Math.round((cat.value / donutTotal) * 100) : 0}%
                        </span>
                        <div style={{ flex: "none", width: 56, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${((cat.value / maxC) * 100).toFixed(0)}%`, background: catColors[cat.name] || "var(--neg)", borderRadius: 5 }} />
                        </div>
                        <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 12.5, fontWeight: 500 }}>
                          {fmtV(cat.value)}
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 8px 24px" }}>
                          {sub.map((s) => (
                            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                              <span style={{ flex: 1, fontSize: 11.5, color: "var(--muted)" }}>{s.name}</span>
                              <div style={{ flex: "none", width: 50, height: 6, borderRadius: 4, background: "var(--hair-2)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${((s.value / maxS) * 100).toFixed(0)}%`, background: "var(--neg)", opacity: 0.6, borderRadius: 4 }} />
                              </div>
                              <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 11.5, color: "var(--ink-2)" }}>
                                {fmtV(s.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}

            {mode === "week" && (
              weekCats.length === 0 ? (
                <div className="h-sub">Нет категорий за эту неделю.</div>
              ) : (
                weekCats.map((cat) => {
                  const sub = (weekSubs[cat.name] || []).slice().sort((a, b) => b.value - a.value);
                  const open = openWeekCat === cat.name;
                  const maxS = Math.max(1, ...sub.map((s) => s.value));
                  return (
                    <div key={cat.name}>
                      <button
                        onClick={() => sub.length && setOpenWeekCat(open ? null : cat.name)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 0", background: "none", border: "none", cursor: sub.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
                      >
                        <span style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 13, transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, opacity: sub.length ? 1 : 0 }}>›</span>
                        <span style={{ flex: "none", width: 9, height: 9, borderRadius: 2, background: catColors[cat.name] || "var(--faint)" }} />
                        <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink-2)" }}>{cat.name}</span>
                        <span className="mono" style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
                          {donutTotal ? Math.round((cat.value / donutTotal) * 100) : 0}%
                        </span>
                        <div style={{ flex: "none", width: 56, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${((cat.value / maxWC) * 100).toFixed(0)}%`, background: catColors[cat.name] || "var(--neg)", borderRadius: 5 }} />
                        </div>
                        <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 12.5, fontWeight: 500 }}>
                          {fmtV(cat.value)}
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 8px 24px" }}>
                          {sub.map((s) => (
                            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                              <span style={{ flex: 1, fontSize: 11.5, color: "var(--muted)" }}>{s.name}</span>
                              <div style={{ flex: "none", width: 50, height: 6, borderRadius: 4, background: "var(--hair-2)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${((s.value / maxS) * 100).toFixed(0)}%`, background: "var(--neg)", opacity: 0.6, borderRadius: 4 }} />
                              </div>
                              <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 11.5, color: "var(--ink-2)" }}>
                                {fmtV(s.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {hasStack && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 16, flexWrap: "wrap" }}>
              <div className="k">Структура расходов по категориям{mode === "month" ? " · по месяцам" : " · по неделям"}</div>
              <CurrencyToggle />
            </div>
            <div className="h-sub" style={{ marginBottom: 16 }}>
              Высота столбца — сумма расходов за период; сегменты — категории. Нажмите на столбец, чтобы открыть его разбивку справа.
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: mode === "month" ? 10 : 5, height: mode === "month" ? 220 : 240 }}>
              {stackBars.map((b, i) => {
                const here = i === stackSelIdx;
                const hPx = (b.total / maxStack) * (mode === "month" ? 175 : 165);
                const segs = b.cats.filter((c) => c.value > 0).slice().sort((a, c) => c.value - a.value);
                return (
                  <button
                    key={b.label}
                    onClick={() => onStackSelect(i)}
                    title={`${b.label}: ${fmtV(b.total)}`}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--sans)" }}
                  >
                    <div style={{ width: mode === "month" ? "62%" : "78%", maxWidth: 28, height: `${hPx.toFixed(0)}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: "4px 4px 0 0", overflow: "hidden", opacity: here ? 1 : 0.45, transition: "opacity .12s", marginBottom: 5 }}>
                      {segs.map((c) => (
                        <div
                          key={c.name}
                          title={`${c.name}: ${fmtV(c.value)}`}
                          style={{ height: `${((c.value / b.total) * 100).toFixed(2)}%`, background: catColors[c.name] || "var(--faint)" }}
                        />
                      ))}
                    </div>
                    {mode === "month" ? (
                      <span className="axis" style={{ fontFamily: "var(--mono)", fontSize: 10, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400 }}>
                        {b.label}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400, writingMode: "vertical-rl", transform: "rotate(180deg)", height: 46, lineHeight: 1 }}>
                        {b.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--hair-2)" }}>
              {Object.keys(catColors).map((name) => (
                <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-2)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: catColors[name], flex: "none" }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
        </div>
      )}
    </>
  );
}
