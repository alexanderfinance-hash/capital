import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { salaryWeekly?: number; salaryWeeks?: number; tech?: number } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const salaryWeekly = Math.max(0, Math.round(Number(b.salaryWeekly) || 0));
  const salaryWeeks = Math.max(0, Math.round(Number(b.salaryWeeks) || 0));
  const tech = Math.max(0, Math.round(Number(b.tech) || 0));

  try {
    await prisma.reserve.upsert({
      where: { id: "default" },
      update: { salaryWeekly, salaryWeeks, tech },
      create: { id: "default", salaryWeekly, salaryWeeks, tech },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ persisted: false }, { status: 503 });
  }
}
