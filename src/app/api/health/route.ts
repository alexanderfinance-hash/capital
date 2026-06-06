import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [users, assets, wallets, agencies, dividends, snapshots] = await Promise.all([
      prisma.user.count(),
      prisma.asset.count(),
      prisma.wallet.count(),
      prisma.agency.count(),
      prisma.dividend.count(),
      prisma.capitalSnapshot.count(),
    ]);
    return NextResponse.json({ ok: true, db: "up", counts: { users, assets, wallets, agencies, dividends, snapshots } });
  } catch (e) {
    return NextResponse.json({ ok: false, db: "down", error: String(e) }, { status: 503 });
  }
}
