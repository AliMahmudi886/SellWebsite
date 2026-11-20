import { NextResponse } from "next/server";
import { clearAdminSession, validOrigin } from "@/lib/auth";
export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  try { await clearAdminSession(); } catch { return NextResponse.json({ error: "خروج موقتاً در دسترس نیست." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
