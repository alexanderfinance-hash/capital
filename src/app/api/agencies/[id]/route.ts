import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { balance?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const balance = Number(b.balance);
  if (isNaN(balance) || balance < 0) return NextResponse.json({ error: "invalid_balance" }, { status: 400 });

  try {
    // The client id is the seed slug (e.g. "a1"); fall back to the cuid.
    const res = await prisma.agency.updateMany({
      where: { OR: [{ slug: params.id }, { id: params.id }] },
      data: { balance, updatedAt: new Date() },
    });
    if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const res = await prisma.agency.deleteMany({ where: { OR: [{ slug: params.id }, { id: params.id }] } });
    if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
