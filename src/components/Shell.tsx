"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Badge } from "@/lib/chart";
import { useApp } from "@/lib/store";
import Overview from "./views/Overview";
import Investments from "./views/Investments";
import Expenses from "./views/Expenses";
import Assets from "./views/Assets";
import Company from "./views/Company";

interface NavDef {
  href: string;
  icon: string;
  label: string;
}

const PERSONAL: NavDef[] = [
  { href: "/", icon: "grid", label: "Обзор" },
  { href: "/investments", icon: "trend", label: "Инвестиции" },
  { href: "/expenses", icon: "receipt", label: "Расходы" },
  { href: "/assets", icon: "box", label: "Активы" },
];
const COMPANY: NavDef[] = [{ href: "/company", icon: "building", label: "Баланс компании" }];
const MOBILE: NavDef[] = [...PERSONAL, { href: "/company", icon: "building", label: "Компания" }];

const VIEWS: Record<string, React.ComponentType> = {
  "/": Overview,
  "/investments": Investments,
  "/expenses": Expenses,
  "/assets": Assets,
  "/company": Company,
};

function sectionForPath(p: string): string {
  if (p === "/") return "/";
  const key = Object.keys(VIEWS).find((k) => k !== "/" && p.startsWith(k));
  return key || "/";
}

// Контент раздела Shell рендерит сам (клиентски), поэтому серверные страницы-обёртки
// (children) не используются — переходы между разделами мгновенные, без round-trip.
export function Shell({ restricted = false }: { restricted?: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { personalSynced } = useApp();
  // Ограниченный аккаунт «расходы»: в меню только «Расходы», раздел всегда /expenses.
  const personalNav = restricted ? PERSONAL.filter((n) => n.href === "/expenses") : PERSONAL;
  const mobileNav = restricted ? personalNav : MOBILE;
  // Переключение разделов — КЛИЕНТСКОЕ (мгновенно, без серверного round-trip):
  // держим текущий раздел в состоянии, URL обновляем через history.pushState.
  const [section, setSection] = useState(() => (restricted ? "/expenses" : sectionForPath(pathname)));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (restricted) return;
    const onPop = () => setSection(sectionForPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [restricted]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem("sidebarCollapsed", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });

  const go = (href: string) => {
    const s = sectionForPath(href);
    setSection(s);
    if (window.location.pathname !== href) window.history.pushState({}, "", href);
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const NavItem = ({ n }: { n: NavDef }) => (
    <button
      onClick={() => go(n.href)}
      title={collapsed ? n.label : undefined}
      className={`nav-item${section === n.href ? " active" : ""}`}
      style={{ width: "100%", textAlign: "left", justifyContent: collapsed ? "center" : undefined }}
    >
      <Icon name={n.icon} />
      {!collapsed && <span>{n.label}</span>}
    </button>
  );

  const View = VIEWS[section] || Overview;
  const brandSub = restricted ? "личные расходы" : "личный баланс";

  return (
    <div className="app-shell ds">
      <aside className="sidebar" style={{ width: collapsed ? 68 : 248, padding: collapsed ? "24px 10px" : "24px 16px", transition: "width .15s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 16px", justifyContent: collapsed ? "center" : "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand)", display: "grid", placeItems: "center", flex: "none" }}>
              <span className="mono" style={{ color: "var(--brand-ink)", fontSize: 15, fontWeight: 600 }}>
                К
              </span>
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".02em" }}>КАПИТАЛ</div>
                <div className="k" style={{ fontSize: 9 }}>
                  {brandSub}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={toggleCollapse}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="nav-item"
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", justifyContent: collapsed ? "center" : "flex-end", marginBottom: 6, padding: collapsed ? "8px" : "6px 12px" }}
        >
          <span style={{ fontSize: 15, fontWeight: 600 }}>{collapsed ? "»" : "«"}</span>
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {!collapsed && !restricted && (
            <div className="k" style={{ padding: "2px 12px 6px", fontSize: 9 }}>
              Личное
            </div>
          )}
          {personalNav.map((n) => (
            <NavItem key={n.href} n={n} />
          ))}
          {!restricted && (
            <>
              {!collapsed && (
                <div className="k" style={{ padding: "14px 12px 6px", fontSize: 9 }}>
                  Компания
                </div>
              )}
              {collapsed && <div style={{ height: 10 }} />}
              {COMPANY.map((n) => (
                <NavItem key={n.href} n={n} />
              ))}
            </>
          )}
        </div>

        <div style={{ marginTop: "auto" }}>
          {!collapsed && !restricted && (
            <div className="card flat" style={{ padding: 13 }}>
              <div className="k" style={{ marginBottom: 10 }}>
                Источники
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Крипто-кошельки</span>
                  <Badge src="sync" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Расходы</span>
                  <Badge src="sheets" />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Активы</span>
                  <Badge src="manual" />
                </div>
              </div>
              <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--hair)", fontSize: 11, color: "var(--muted)" }}>{personalSynced}</div>
            </div>
          )}
          <button className="nav-item" onClick={logout} title={collapsed ? "Выйти" : undefined} style={{ width: "100%", marginTop: 6, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)", textAlign: "left", justifyContent: collapsed ? "center" : undefined }}>
            <Icon name="back" />
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="scroll">
          {restricted ? <Expenses expensesOnly /> : <View />}
        </div>
      </main>

      <nav className="mobile-tabbar">
        {mobileNav.map((n) => (
          <button key={n.href} onClick={() => go(n.href)} className={section === n.href ? "on" : ""} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
