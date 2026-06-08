import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

// Add a company USDT-TRC20 wallet. Balance is synced from chain afterwards.
export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { address?: string; label?: string; group?: string; kind?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const address = (b.address || "").trim();
  if (!address) return NextResponse.json({ error: "no_address" }, { status: 400 });
  const group = b.group === "clean" ? "clean" : "dirty";
  const kind = b.kind === "small" ? "small" : "main";

  try {
    const w = await prisma.wallet.create({
      data: {
        scope: "company",
        chain: "TRX",
        token: "USDT",
        address,
        label: (b.label || "").trim() || address.slice(0, 8),
        group,
        kind,
      },
    });
    return NextResponse.json({ id: w.id });
  } catch (e) {
    // Unique constraint (chain,address,token) or DB down.
    return NextResponse.json({ error: "create_failed", detail: String(e) }, { status: 409 });
  }
}
