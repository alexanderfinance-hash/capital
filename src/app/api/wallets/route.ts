import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

const CHAINS = ["BTC", "ETH", "TRX", "TON"];

// Add a personal crypto wallet (address + chain). Balance syncs afterwards.
export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { address?: string; chain?: string; label?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const address = (b.address || "").trim();
  const chain = (b.chain || "").toUpperCase();
  if (!address) return NextResponse.json({ error: "no_address" }, { status: 400 });
  if (!CHAINS.includes(chain)) return NextResponse.json({ error: "bad_chain" }, { status: 400 });

  try {
    const w = await prisma.wallet.create({
      data: {
        scope: "personal",
        chain: chain as "BTC" | "ETH" | "TRX" | "TON",
        token: chain,
        address,
        label: (b.label || "").trim() || `${chain} ${address.slice(0, 6)}`,
      },
    });
    return NextResponse.json({ id: w.id });
  } catch (e) {
    return NextResponse.json({ error: "create_failed", detail: String(e) }, { status: 409 });
  }
}
