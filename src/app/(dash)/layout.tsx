import { getInitialData } from "@/lib/data";
import { AppProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { Toast } from "@/components/Toast";

// Read fresh data from the DB on each request.
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const initial = await getInitialData();
  return (
    <AppProvider initial={initial}>
      <Shell>{children}</Shell>
      <Toast />
    </AppProvider>
  );
}
