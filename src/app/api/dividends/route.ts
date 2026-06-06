import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { parseDayMonthRu } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { name?: string; date?: string; amount?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  try {
    const d = await prisma.dividend.create({
      data: { name: (b.name || "").trim() || "Выплата", amount, paidAt: parseDayMonthRu(b.date || "") },
    });
    return NextResponse.json({ id: d.id });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
