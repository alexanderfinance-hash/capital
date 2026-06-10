import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { TONNUM_SYMBOL } from "@/lib/sync/tonnums";
import { getCurrentUsdRub } from "@/lib/fx";

export const runtime = "nodejs";

// Update a manual asset: either a TON-number quantity (`amount`, re-priced from
// the synced unit rate) or a RUB asset's original ruble amount (`nativeValue`,
// re-valued to USD at the current CBR rate).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { amount?: number; nativeValue?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // RUB asset: update the ruble amount, recompute USD value.
  if (b.nativeValue != null) {
    const nativeValue = Number(b.nativeValue);
    if (isNaN(nativeValue) || nativeValue <= 0) return NextResponse.json({ error: "invalid_value" }, { status: 400 });
    try {
      const asset = await prisma.asset.findFirst({ where: { OR: [{ slug: params.id }, { id: params.id }], source: "manual" } });
      if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const rate = await getCurrentUsdRub();
      const value = rate > 0 ? Math.round(nativeValue / rate) : Number(asset.value);
      await prisma.asset.update({ where: { id: asset.id }, data: { nativeValue, value, currency: "RUB" } });
      return NextResponse.json({ ok: true, value, nativeValue });
    } catch {
      return NextResponse.json({ persisted: false }, { status: 503 });
    }
  }

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  try {
    const asset = await prisma.asset.findFirst({ where: { OR: [{ slug: params.id }, { id: params.id }], symbol: TONNUM_SYMBOL } });
    if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const price = await prisma.priceCache.findUnique({ where: { symbol: TONNUM_SYMBOL } });
    const value = price ? Math.round(amount * Number(price.usd)) : Number(asset.value);
    await prisma.asset.update({ where: { id: asset.id }, data: { amount, value } });
    return NextResponse.json({ ok: true, value });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}

// Delete a manual asset (synced crypto assets are managed automatically).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const res = await prisma.asset.deleteMany({
      where: { OR: [{ slug: params.id }, { id: params.id }], source: "manual" },
    });
    if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
