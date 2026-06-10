import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { TONNUM_SYMBOL } from "@/lib/sync/tonnums";
import { getCurrentUsdRub } from "@/lib/fx";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { icon?: string; name?: string; value?: number; delta?: number | null; src?: string; bucket?: string; amount?: number; symbol?: string; currency?: string; nativeValue?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const isTonNumber = b.symbol === TONNUM_SYMBOL;
  const amount = b.amount == null ? null : Number(b.amount);
  const currency = b.currency === "RUB" ? "RUB" : "USD";

  // TON numbers are quantity-driven: validate the count, then price it from the
  // last synced unit rate (the tonnums sync keeps it fresh afterwards).
  let value = Number(b.value); // the entered amount, in `currency`
  let nativeValue: number | null = null;
  if (isTonNumber) {
    if (!amount || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    try {
      const price = await prisma.priceCache.findUnique({ where: { symbol: TONNUM_SYMBOL } });
      if (price) value = Math.round(amount * Number(price.usd));
    } catch {
      /* keep the client-supplied value; sync will correct it */
    }
  } else if (currency === "RUB") {
    // The client sends the original RUB amount in `nativeValue` (and a USD hint in
    // `value` for the optimistic UI). The server is the source of truth: store the
    // RUB amount and derive USD from the current CBR rate. Never re-divide `value`.
    nativeValue = Number(b.nativeValue ?? b.value);
    if (!nativeValue || nativeValue <= 0 || isNaN(nativeValue)) return NextResponse.json({ error: "invalid_value" }, { status: 400 });
    try {
      const rate = await getCurrentUsdRub();
      value = rate > 0 ? Math.round(nativeValue / rate) : Number(b.value);
    } catch {
      value = Number(b.value); // keep the client's USD hint; getPersonalData re-converts on read
    }
  } else if (!value || value <= 0) {
    return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  }

  try {
    const a = await prisma.asset.create({
      data: {
        icon: b.icon || "box",
        name: (b.name || "").trim() || "Актив",
        value: isNaN(value) ? 0 : value,
        delta: b.delta == null ? null : Number(b.delta),
        amount: amount == null || isNaN(amount) ? null : amount,
        symbol: b.symbol || null,
        currency,
        nativeValue,
        source: (b.src as "sync" | "sheets" | "manual") || "manual",
        bucket: (b.bucket as "crypto" | "vehicles" | "cash" | "other") || "other",
      },
    });
    return NextResponse.json({ id: a.id });
  } catch {
    // Dev without DB: client keeps the optimistic row.
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
