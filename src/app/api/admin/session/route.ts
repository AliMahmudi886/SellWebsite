import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { permissionsFor } from "@/lib/admin-permissions";

export async function GET() {
  const email = await getAdmin();
  return NextResponse.json({
    authenticated: Boolean(email),
    email,
    permissions: email ? permissionsFor(process.env.ADMIN_ROLE) : [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}
