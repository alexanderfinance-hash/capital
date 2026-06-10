import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { TONNUM_SYMBOL } from "@/lib/sync/tonnums";

export const runtime = "nodejs";

// Update a TON-number asset's quantity; the value is re-priced from the last
// synced unit rate (the tonnums sync keeps it fresh afterwards).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { amount?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
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
