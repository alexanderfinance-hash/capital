import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { icon?: string; name?: string; value?: number; delta?: number | null; src?: string; bucket?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const value = Number(b.value);
  if (!value || value <= 0) return NextResponse.json({ error: "invalid_value" }, { status: 400 });

  try {
    const a = await prisma.asset.create({
      data: {
        icon: b.icon || "box",
        name: (b.name || "").trim() || "Актив",
        value,
        delta: b.delta == null ? null : Number(b.delta),
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
