import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { isExpensesOnly } from "@/lib/roles";

const PUBLIC_PATHS = ["/login"];
// Куда попадает ограниченный аккаунт (только личные расходы).
const EXPENSES_HOME = "/expenses";

// Единственные API-эндпоинты, доступные ограниченному аккаунту «расходы»:
// выход, обновление расходов (кнопка «Обновить данные») и health.
function apiAllowedForExpenses(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/sync/expenses" ||
    pathname === "/api/health"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // API: маршруты сами проверяют доступ (в т.ч. cron-ключ воркера без сессии),
  // поэтому обычные запросы пропускаем. Но у залогиненного ограниченного аккаунта
  // «расходы» режем всё, кроме короткого allowlist — чтобы через API не утекли
  // доходы/капитал (например, GET-диагностика /api/sync/profit).
  if (pathname.startsWith("/api")) {
    if (session && isExpensesOnly(session.role) && !apiAllowedForExpenses(pathname)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  // Ограниченный аккаунт «расходы»: пускаем только на /expenses, всё остальное
  // (Обзор/Инвестиции/Активы/Компания и пр.) уводим на /expenses.
  if (session && isExpensesOnly(session.role) && !isPublic) {
    const allowed = pathname === EXPENSES_HOME || pathname.startsWith(EXPENSES_HOME + "/");
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = EXPENSES_HOME;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  if (session && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = isExpensesOnly(session.role) ? EXPENSES_HOME : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Runs on pages AND /api (нужно, чтобы гейтить API для ограниченного аккаунта).
// Статику и картинки пропускаем.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
