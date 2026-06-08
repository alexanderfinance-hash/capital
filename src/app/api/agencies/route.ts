import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

// Add an ad agency (manual balance entry).
export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { platform?: string; name?: string; balance?: number; by?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const balance = Number(b.balance) || 0;
  try {
    const a = await prisma.agency.create({
      data: {
        platform: (b.platform || "").trim() || "Агентство",
        name: (b.name || "").trim() || "",
        balance,
        enteredBy: (b.by || "").trim() || "—",
      },
    });
    return NextResponse.json({ id: a.id });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
