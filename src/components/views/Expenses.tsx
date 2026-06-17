"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Badge, CategoryDonut, catColorMap, Money } from "@/lib/chart";
import { Topbar } from "../ui";

const fmtSigned = (n: number): string => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
const fmtRub = (n: number): string =>
  // U+202F (узкий неразрывный) вместо широкого U+00A0 в разделителе групп тысяч/млн
  "₽ " + Math.round(n).toLocaleString("ru-RU").replace(/\u00A0/g, " ");

type SeriesKey = "income" | "expenses" | "diff";
type ViewMode = "month" | "week";
type Currency = "USD" | "RUB";

interface Txn {
  date: string;
  comment: string;
  value: number;
}

/** "2025-06-03" → "03.06". */
const fmtDate = (iso: string): string => {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}` : iso;
};

/* Строка подкатегории с раскрытием до отдельных платежей (комментарий + сумма
   из ДДС). Если платежей нет — ведёт себя как раньше (просто строка). */
function SubRow({
  s,
  maxS,
  color,
  txns,
  open,
  onToggle,
  fmtV,
}: {
  s: { name: string; value: number };
  maxS: number;
  color: string;
  txns: Txn[];
  open: boolean;
  onToggle: () => void;
  fmtV: (v: number) => string;
}) {
  const has = txns.length > 0;
  return (
    <div>
      <button
        onClick={() => has && onToggle()}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 0", background: "none", border: "none", cursor: has ? "pointer" : "default", textAlign: "left", fontFamily: "var(--sans)" }}
      >
        <span style={{ flex: "none", width: 10, color: "var(--faint)", fontSize: 11, transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s", opacity: has ? 1 : 0 }}>›</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--muted)", overflowWrap: "anywhere" }}>{s.name}</span>
        <div style={{ flex: "none", width: 44, height: 6, borderRadius: 4, background: "var(--hair-2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((s.value / maxS) * 100).toFixed(0)}%`, background: color, opacity: 0.55, borderRadius: 4 }} />
        </div>
        <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 11.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
          <Money>{fmtV(s.value)}</Money>
        </span>
      </button>
      {open && has && (
        <div style={{ padding: "2px 0 8px 22px" }}>
          {txns.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "4px 0", borderTop: "1px solid var(--hair-2)" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                {t.comment || <span style={{ color: "var(--faint)" }}>без комментария</span>}
                <span style={{ color: "var(--faint)", marginLeft: 6, fontFamily: "var(--mono)" }}>{fmtDate(t.date)}</span>
              </span>
              <span className="mono" style={{ flex: "none", width: 72, textAlign: "right", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                <Money>{fmtV(t.value)}</Money>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface StackBar {
  label: string;
  cats: { name: string; value: number }[];
  total: number;
}

/** «Красивый» верх шкалы — ближайшее круглое значение ≥ max (1/2/2.5/5/10 ×10ⁿ),
 *  чтобы метки оси были читаемыми. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

/* Накопительная столбчатая диаграмма по периодам: ось сумм справа + сетка,
   мгновенный тултип у курсора и подсветка сегмента. Работает и для месяцев,
   и для недель (vertical — вертикальные подписи недель). */
function StackedChart({
  bars,
  maxStack,
  colors,
  fmtV,
  selIdx,
  onSelect,
  vertical,
}: {
  bars: StackBar[];
  maxStack: number;
  colors: Record<string, string>;
  fmtV: (v: number) => string;
  selIdx: number;
  onSelect: (i: number) => void;
  vertical: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ bar: number; cat: string; value: number; label: string } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const PLOT_H = 196;
  const AXIS_W = 64;
  const GAP = vertical ? 5 : 10;
  const top = niceMax(maxStack);
  const TICKS = 4;
  const ticks = Array.from({ length: TICKS + 1 }, (_, t) => {
    const frac = t / TICKS; // 0 — сверху
    return { val: top * (1 - frac), y: frac * PLOT_H };
  });

  const onMove = (e: React.MouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <div style={{ display: "flex" }}>
        {/* область графика */}
        <div style={{ flex: 1, position: "relative", height: PLOT_H }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: t.y, borderTop: "1px dashed var(--hair)" }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: GAP }}>
            {bars.map((b, i) => {
              const here = i === selIdx;
              const hoveredBar = hover?.bar === i;
              const hPx = (b.total / top) * PLOT_H;
              const segs = b.cats.filter((c) => c.value > 0).slice().sort((a, c) => c.value - a.value);
              return (
                <button
                  key={b.label}
                  onClick={() => onSelect(i)}
                  style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <div style={{ width: vertical ? "82%" : "64%", maxWidth: 30, height: `${hPx.toFixed(1)}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: "4px 4px 0 0", overflow: "hidden", opacity: here || hoveredBar ? 1 : 0.5, transition: "opacity .12s" }}>
                    {segs.map((c) => {
                      const segOn = hover?.bar === i && hover?.cat === c.name;
                      return (
                        <div
                          key={c.name}
                          onMouseEnter={() => setHover({ bar: i, cat: c.name, value: c.value, label: b.label })}
                          style={{ height: `${((c.value / b.total) * 100).toFixed(2)}%`, background: colors[c.name] || "var(--faint)", filter: segOn ? "brightness(1.18)" : "none", boxShadow: segOn ? "inset 0 0 0 1.5px var(--surface)" : "none" }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* ось сумм справа */}
        <div style={{ width: AXIS_W, position: "relative", height: PLOT_H, marginLeft: 8, flex: "none" }}>
          {ticks.map((t, i) => (
            <span key={i} className="mono" style={{ position: "absolute", top: t.y, right: 0, transform: "translateY(-50%)", fontSize: 9.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
              <Money>{fmtV(t.val)}</Money>
            </span>
          ))}
        </div>
      </div>
      {/* подписи периодов */}
      <div style={{ display: "flex", marginTop: 6 }}>
        <div style={{ flex: 1, display: "flex", gap: GAP }}>
          {bars.map((b, i) => {
            const here = i === selIdx;
            return (
              <div key={b.label} style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
                {vertical ? (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400, writingMode: "vertical-rl", transform: "rotate(180deg)", height: 46, lineHeight: 1 }}>
                    {b.label}
                  </span>
                ) : (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400 }}>
                    {b.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ width: AXIS_W, marginLeft: 8, flex: "none" }} />
      </div>
      {/* тултип у курсора */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none",
            background: "var(--ink)",
            color: "var(--surface)",
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11.5,
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,.18)",
            zIndex: 5,
          }}
        >
          <div className="mono" style={{ fontWeight: 600 }}><Money>{fmtV(hover.value)}</Money></div>
          <div style={{ opacity: 0.75, fontSize: 10 }}>{hover.cat} · {hover.label}</div>
        </div>
      )}
    </div>
  );
}

interface TimelineBar {
  label: string;
  expense: number;
  income: number;
  cats: { name: string; value: number }[];
}

/* Прокручиваемая столбчатая диаграмма по времени с фиксированной осью сумм
   справа и временным ползунком. Каждый столбец — период; в режиме «по
   категориям» столбец расходов делится на сегменты-категории. При наведении
   на столбец — тултип у курсора с суммой расхода за период. Размер столбцов
   фиксирован (minSlot): пока периодов мало — растягиваются на всю ширину,
   когда много — включается горизонтальная прокрутка. */
function TimelineChart({
  bars,
  maxVal,
  colors,
  fmtV,
  fmtVSigned,
  selIdx,
  onSelect,
  split,
  showIncome,
  showExpense,
  showDiff,
  verticalLabels,
  minSlot,
}: {
  bars: TimelineBar[];
  maxVal: number;
  colors: Record<string, string>;
  fmtV: (v: number) => string;
  fmtVSigned: (v: number) => string;
  selIdx: number;
  onSelect: (i: number) => void;
  split: boolean;
  showIncome: boolean;
  showExpense: boolean;
  showDiff: boolean;
  verticalLabels: boolean;
  minSlot: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const [hover, setHover] = useState<{ i: number; cat?: string; catVal?: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scroll, setScroll] = useState({ left: 0, max: 0 });

  const PLOT_H = 188;
  const AXIS_W = 58;
  const LABEL_H = verticalLabels ? 52 : 18;
  const top = niceMax(maxVal);
  const TICKS = 4;
  const ticks = Array.from({ length: TICKS + 1 }, (_, t) => {
    const frac = t / TICKS; // 0 — сверху
    return { val: top * (1 - frac), y: frac * PLOT_H };
  });

  // измеряем ширину области прокрутки → ширина слота
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      setWrapW(el.clientWidth);
      setScroll({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth });
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  const n = Math.max(1, bars.length);
  const slotW = wrapW > 0 ? Math.max(minSlot, wrapW / n) : minSlot;
  const contentW = slotW * n;
  const overflow = contentW > wrapW + 1;

  // авто-прокрутка к выбранному периоду
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = slotW * selIdx + slotW / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIdx, slotW]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setScroll({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth });
  };
  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Number(e.target.value);
  };
  const onMove = (e: React.MouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hoverBar = hover ? bars[hover.i] : null;
  const hoverNet = hoverBar ? hoverBar.income - hoverBar.expense : 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin" }}>
          <div style={{ width: contentW, minWidth: "100%" }}>
            {/* область столбцов + сетка */}
            <div style={{ position: "relative", height: PLOT_H }}>
              {ticks.map((t, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, top: t.y, borderTop: "1px dashed var(--hair)" }} />
              ))}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end" }}>
                {bars.map((b, i) => {
                  const here = i === selIdx;
                  const hot = hover?.i === i;
                  const op = here || hot ? 1 : 0.45;
                  const net = b.income - b.expense;
                  const expH = (b.expense / top) * PLOT_H;
                  const incH = (b.income / top) * PLOT_H;
                  const segs = b.cats.filter((c) => c.value > 0).slice().sort((a, c) => c.value - a.value);
                  return (
                    <button
                      key={b.label}
                      onClick={() => onSelect(i)}
                      onMouseEnter={() => setHover({ i })}
                      style={{ width: slotW, flex: "0 0 auto", height: "100%", position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      {showDiff && (showIncome || showExpense) && (
                        <span className="mono" style={{ position: "absolute", left: 0, right: 0, top: Math.max(0, PLOT_H - Math.max(expH, incH) - 15), textAlign: "center", fontSize: 9.5, fontWeight: 600, color: net >= 0 ? "var(--pos)" : "var(--neg)", opacity: here || hot ? 1 : 0.55, pointerEvents: "none" }}>
                          {fmtVSigned(net)}
                        </span>
                      )}
                      {showIncome && (
                        <div style={{ width: Math.min(22, slotW * 0.3), height: `${incH.toFixed(1)}px`, background: "var(--pos)", borderRadius: "4px 4px 0 0", opacity: op, transition: "opacity .12s" }} />
                      )}
                      {showExpense && (split ? (
                        <div style={{ width: Math.min(28, slotW * (showIncome ? 0.3 : 0.5)), height: `${expH.toFixed(1)}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: "4px 4px 0 0", overflow: "hidden", opacity: op, transition: "opacity .12s" }}>
                          {segs.map((c) => {
                            const segOn = hot && hover?.cat === c.name;
                            return (
                              <div
                                key={c.name}
                                onMouseEnter={(e) => { e.stopPropagation(); setHover({ i, cat: c.name, catVal: c.value }); }}
                                style={{ height: `${b.expense ? ((c.value / b.expense) * 100).toFixed(2) : 0}%`, background: colors[c.name] || "var(--faint)", filter: segOn ? "brightness(1.15)" : "none", boxShadow: segOn ? "inset 0 0 0 1.5px var(--surface)" : "none" }}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ width: Math.min(22, slotW * (showIncome ? 0.3 : 0.46)), height: `${expH.toFixed(1)}px`, background: "var(--neg)", borderRadius: "4px 4px 0 0", opacity: op, transition: "opacity .12s" }} />
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* подписи периодов */}
            <div style={{ display: "flex", marginTop: 6 }}>
              {bars.map((b, i) => {
                const here = i === selIdx;
                return (
                  <div key={b.label} style={{ width: slotW, flex: "0 0 auto", display: "flex", justifyContent: "center", height: LABEL_H }}>
                    {verticalLabels ? (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400, writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}>{b.label}</span>
                    ) : (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400 }}>{b.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* фиксированная ось сумм справа */}
        <div style={{ width: AXIS_W, position: "relative", height: PLOT_H, marginLeft: 8, flex: "none" }}>
          {ticks.map((t, i) => (
            <span key={i} className="mono" style={{ position: "absolute", top: t.y, right: 0, transform: "translateY(-50%)", fontSize: 9.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
              <Money>{fmtV(t.val)}</Money>
            </span>
          ))}
        </div>
      </div>

      {/* временной ползунок (только когда периодов больше, чем влезает) */}
      {overflow && (
        <div style={{ display: "flex", alignItems: "center", marginTop: 12, paddingRight: AXIS_W + 8 }}>
          <input
            type="range"
            min={0}
            max={Math.max(1, scroll.max)}
            value={Math.min(scroll.left, scroll.max)}
            onChange={onSlider}
            aria-label="Прокрутка по времени"
            style={{ flex: 1, accentColor: "var(--ink-2)", cursor: "pointer" }}
          />
        </div>
      )}

      {/* тултип у курсора — сумма расхода за период */}
      {hover && hoverBar && (
        <div style={{ position: "absolute", left: pos.x, top: pos.y, transform: "translate(-50%, calc(-100% - 12px))", pointerEvents: "none", background: "var(--ink)", color: "var(--surface)", borderRadius: 6, padding: "6px 10px", fontSize: 11.5, lineHeight: 1.4, whiteSpace: "nowrap", textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.18)", zIndex: 5 }}>
          <div style={{ opacity: 0.7, fontSize: 10 }}>{hoverBar.label}</div>
          <div className="mono" style={{ fontWeight: 600 }}>Расход <Money>{fmtV(hoverBar.expense)}</Money></div>
          {showIncome && hoverBar.income > 0 && (
            <div className="mono" style={{ fontSize: 10.5, opacity: 0.85 }}>
              Доход <Money>{fmtV(hoverBar.income)}</Money> · {fmtVSigned(hoverNet)}
            </div>
          )}
          {hover.cat && (
            <div style={{ fontSize: 10, opacity: 0.85, marginTop: 1 }}>{hover.cat}: <Money>{fmtV(hover.catVal || 0)}</Money></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Expenses() {
  const { store, usdRub, refreshExpenses, expensesSyncing } = useApp();
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
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [openWeekSub, setOpenWeekSub] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
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

  const maxW = Math.max(1, ...weeks.map((w) => w.v));

  // Данные для прокручиваемой диаграммы по времени (верхний график).
  const monthBars: TimelineBar[] = useMemo(
    () =>
      months.map((m) => ({
        label: m.m,
        expense: m.v,
        income: m.income ?? 0,
        cats: (m.period && store.expensesByPeriod[m.period]) || [],
      })),
    [months, store.expensesByPeriod]
  );
  const weekBars: TimelineBar[] = useMemo(
    () =>
      weeks.map((w) => ({
        label: w.w,
        expense: w.v,
        income: 0,
        cats: (w.weekEnd && store.expenseWeeksByPeriod[w.weekEnd]) || [],
      })),
    [weeks, store.expenseWeeksByPeriod]
  );
  const monthChartMax = Math.max(
    1,
    ...months.map((m) => Math.max(show.expenses ? m.v : 0, show.income ? m.income ?? 0 : 0))
  );

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

  // Переключатель вида столбцов: сумма ↔ разбивка по категориям
  const SplitToggle = () => (
    <div style={{ display: "flex", gap: 2, background: "var(--hair-2)", borderRadius: 8, padding: 3 }}>
      {([["sum", "Сумма"], ["cats", "По категориям"]] as const).map(([k, l]) => {
        const on = (k === "cats") === split;
        return (
          <button
            key={k}
            onClick={() => setSplit(k === "cats")}
            title={k === "cats" ? "Разбить столбец расходов на категории" : "Показывать расход одной суммой"}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              background: on ? "var(--card)" : "transparent",
              color: on ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "var(--sans)",
              fontSize: 11.5,
              fontWeight: on ? 600 : 400,
              boxShadow: on ? "0 1px 3px rgba(0,0,0,.08)" : "none",
              transition: "all .12s",
              whiteSpace: "nowrap",
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Topbar
        title="Расходы и доходы"
        sub="Импорт из Google Sheets"
        right={
          <>
            <button
              onClick={refreshExpenses}
              disabled={expensesSyncing}
              title="Подтянуть свежие расходы и доходы из Google Sheets"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: 8,
                border: "1px solid var(--hair)",
                background: "var(--surface)",
                color: "var(--ink-2)",
                cursor: expensesSyncing ? "default" : "pointer",
                fontFamily: "var(--sans)",
                fontSize: 12,
                fontWeight: 500,
                opacity: expensesSyncing ? 0.6 : 1,
                transition: "opacity .12s",
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1, display: "inline-block", transform: expensesSyncing ? "rotate(180deg)" : "none", transition: "transform .3s" }}>↻</span>
              {expensesSyncing ? "Обновляю…" : "Обновить данные"}
            </button>
            <Badge src="sheets" />
          </>
        }
      />

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
                          <Money>{s.signed ? fmtVSigned(s.value) : fmtV(s.value)}</Money>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <SplitToggle />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                </div>

                <TimelineChart
                  bars={monthBars}
                  maxVal={monthChartMax}
                  colors={catColors}
                  fmtV={fmtV}
                  fmtVSigned={fmtVSigned}
                  selIdx={idx}
                  onSelect={(i) => { setSelIdx(i); setOpenCat(null); setOpenSub(null); }}
                  split={split}
                  showIncome={show.income}
                  showExpense={show.expenses}
                  showDiff={show.diff}
                  verticalLabels={false}
                  minSlot={62}
                />
                <div className="h-sub" style={{ marginTop: 12 }}>
                  {split
                    ? "Столбец расходов разбит на категории. Наведите курсор на столбец — увидите сумму за период; нажмите — категории справа."
                    : hasIncome
                    ? "Зелёный — доходы (дивиденды из ДДС), красный — расходы. «По категориям» делит расход на сегменты; нажмите на месяц — категории справа."
                    : "Нажмите на столбец месяца, чтобы посмотреть его категории. «По категориям» делит расход на сегменты. Доходы появятся после синхронизации ДДС."}
                </div>
              </>
            )}

            {mode === "week" && (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                  <div>
                    <div className="k">Расходы за {selWeek?.w ?? "—"}</div>
                    <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.02em", marginTop: 6, lineHeight: 1, color: "var(--neg)" }}>
                      <Money>{fmtV(selWeek?.v ?? 0)}</Money>
                    </div>
                  </div>
                  <SplitToggle />
                </div>

                <TimelineChart
                  bars={weekBars}
                  maxVal={maxW}
                  colors={catColors}
                  fmtV={fmtV}
                  fmtVSigned={fmtVSigned}
                  selIdx={wIdx}
                  onSelect={(i) => { setSelWeekIdx(i); setOpenWeekCat(null); setOpenWeekSub(null); }}
                  split={split}
                  showIncome={false}
                  showExpense={true}
                  showDiff={false}
                  verticalLabels={true}
                  minSlot={46}
                />
                <div className="h-sub" style={{ marginTop: 12 }}>
                  {split
                    ? "Столбец расходов разбит на категории. Наведите курсор на столбец — увидите сумму за неделю; нажмите — категории справа."
                    : "Наведите курсор на столбец — увидите сумму за неделю; нажмите на неделю — категории справа. «По категориям» делит расход на сегменты."}
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
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 0", background: "none", border: "none", cursor: sub.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
                      >
                        <span style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 13, transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, opacity: sub.length ? 1 : 0 }}>›</span>
                        <span style={{ flex: "none", width: 9, height: 9, borderRadius: 2, background: catColors[cat.name] || "var(--faint)" }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{cat.name}</span>
                        <span className="mono" style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
                          {donutTotal ? Math.round((cat.value / donutTotal) * 100) : 0}%
                        </span>
                        <div style={{ flex: "none", width: 44, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${((cat.value / maxC) * 100).toFixed(0)}%`, background: catColors[cat.name] || "var(--neg)", borderRadius: 5 }} />
                        </div>
                        <span className="mono" style={{ flex: "none", width: 86, textAlign: "right", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>
                          <Money>{fmtV(cat.value)}</Money>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 8px 24px" }}>
                          {sub.map((s) => {
                            const sk = `${cat.name}||${s.name}`;
                            return (
                              <SubRow
                                key={s.name}
                                s={s}
                                maxS={maxS}
                                color={catColors[cat.name] || "var(--neg)"}
                                txns={store.expenseTxns[period]?.[cat.name]?.[s.name] || []}
                                open={openSub === sk}
                                onToggle={() => setOpenSub(openSub === sk ? null : sk)}
                                fmtV={fmtV}
                              />
                            );
                          })}
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
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 0", background: "none", border: "none", cursor: sub.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
                      >
                        <span style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 13, transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, opacity: sub.length ? 1 : 0 }}>›</span>
                        <span style={{ flex: "none", width: 9, height: 9, borderRadius: 2, background: catColors[cat.name] || "var(--faint)" }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{cat.name}</span>
                        <span className="mono" style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
                          {donutTotal ? Math.round((cat.value / donutTotal) * 100) : 0}%
                        </span>
                        <div style={{ flex: "none", width: 44, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${((cat.value / maxWC) * 100).toFixed(0)}%`, background: catColors[cat.name] || "var(--neg)", borderRadius: 5 }} />
                        </div>
                        <span className="mono" style={{ flex: "none", width: 86, textAlign: "right", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>
                          <Money>{fmtV(cat.value)}</Money>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 8px 24px" }}>
                          {sub.map((s) => {
                            const sk = `${cat.name}||${s.name}`;
                            return (
                              <SubRow
                                key={s.name}
                                s={s}
                                maxS={maxS}
                                color={catColors[cat.name] || "var(--neg)"}
                                txns={store.expenseWeekTxns[selWeek?.weekEnd ?? ""]?.[cat.name]?.[s.name] || []}
                                open={openWeekSub === sk}
                                onToggle={() => setOpenWeekSub(openWeekSub === sk ? null : sk)}
                                fmtV={fmtV}
                              />
                            );
                          })}
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

            <StackedChart
              bars={stackBars}
              maxStack={maxStack}
              colors={catColors}
              fmtV={fmtV}
              selIdx={stackSelIdx}
              onSelect={onStackSelect}
              vertical={mode === "week"}
            />

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
