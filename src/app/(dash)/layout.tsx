import { getInitialData, redactToExpensesOnly } from "@/lib/data";
import { getSession } from "@/lib/auth-server";
import { isExpensesOnly } from "@/lib/roles";
import { AppProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { Toast } from "@/components/Toast";

// Read fresh data from the DB on each request.
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [initialFull, session] = await Promise.all([getInitialData(), getSession()]);
  // Ограниченный аккаунт «расходы» получает урезанный payload (только личные
  // расходы) и урезанную оболочку (в меню — только «Расходы», без доходов).
  const restricted = isExpensesOnly(session?.role);
  const initial = restricted ? redactToExpensesOnly(initialFull) : initialFull;
  return (
    <AppProvider initial={initial}>
      <Shell restricted={restricted}>{children}</Shell>
      <Toast />
    </AppProvider>
  );
}
