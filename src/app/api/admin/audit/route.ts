import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db";

export async function GET(request:Request) {
  if(!await getAdmin("audit:read"))return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  const url=new URL(request.url),query=(url.searchParams.get("q")??"").trim().slice(0,100),action=(url.searchParams.get("action")??"").trim().slice(0,40);
  try {
    const {rows}=await getPool().query(`SELECT id,actor,action,target_type,target_id,details,created_at FROM admin_audit_log WHERE ($1='' OR actor ILIKE '%'||$1||'%' OR target_id ILIKE '%'||$1||'%' OR target_type ILIKE '%'||$1||'%') AND ($2='' OR action=$2) ORDER BY created_at DESC,id DESC LIMIT 200`,[query,action]);
    return NextResponse.json({events:rows});
  } catch { return NextResponse.json({error:"خواندن گزارش فعالیت ممکن نشد."},{status:503}); }
}
