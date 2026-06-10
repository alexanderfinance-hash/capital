"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Badge } from "@/lib/chart";
import { useApp } from "@/lib/store";

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

const MOBILE: NavDef[] = [
  { href: "/", icon: "grid", label: "Обзор" },
  { href: "/investments", icon: "trend", label: "Инвестиции" },
  { href: "/expenses", icon: "receipt", label: "Расходы" },
  { href: "/assets", icon: "box", label: "Активы" },
  { href: "/company", icon: "building", label: "Компания" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { personalSynced } = useApp();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell ds">
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 22px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand)", display: "grid", placeItems: "center" }}>
            <span className="mono" style={{ color: "var(--brand-ink)", fontSize: 15, fontWeight: 600 }}>
              К
            </span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".02em" }}>КАПИТАЛ</div>
            <div className="k" style={{ fontSize: 9 }}>
              личный баланс
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div className="k" style={{ padding: "2px 12px 6px", fontSize: 9 }}>
            Личное
          </div>
          {PERSONAL.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item${isActive(pathname, n.href) ? " active" : ""}`} style={{ textDecoration: "none" }}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </Link>
          ))}
          <div className="k" style={{ padding: "14px 12px 6px", fontSize: 9 }}>
            Компания
          </div>
          {COMPANY.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item${isActive(pathname, n.href) ? " active" : ""}`} style={{ textDecoration: "none" }}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: "auto" }}>
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
          <button className="nav-item" onClick={logout} style={{ width: "100%", marginTop: 6, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)", textAlign: "left" }}>
            <Icon name="back" />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="scroll">{children}</div>
      </main>

      <nav className="mobile-tabbar">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(pathname, n.href) ? "on" : ""}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
