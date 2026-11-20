import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readBoundedText, RequestBodyTooLarge } from "@/lib/request-body";
export async function POST(request: Request) {

  let rawBody: string;
  try {
    rawBody = await readBoundedText(request, 2048);
  } catch (error) {
    return error instanceof RequestBodyTooLarge
      ? NextResponse.json({ error: "درخواست بزرگ است." }, { status: 413 })
      : NextResponse.json({ error: "کد پیگیری معتبر نیست." }, { status: 400 });
  }
  let token="";try{const body=JSON.parse(rawBody);token=body&&typeof body==="object"?body.token:"";}catch{return NextResponse.json({error:"کد پیگیری معتبر نیست."},{status:400});}
  if(typeof token!=="string"||!/^[A-Za-z0-9_-]{40,60}$/.test(token))return NextResponse.json({error:"سفارش پیدا نشد."},{status:404});
  try { const rateLimit=await consumeRateLimit("order-track",request,30,10*60_000);if(!rateLimit.allowed)return NextResponse.json({error:"درخواست‌های زیادی برای پیگیری فرستاده شده؛ بعداً تلاش کنید."},{status:429,headers:{"Retry-After":String(rateLimit.retryAfterSeconds)}});const hash=createHash("sha256").update(token).digest("hex"); const {rows}=await getPool().query(`SELECT o.id,o.status,o.created_at,COALESCE(json_agg(json_build_object('name',i.product_name,'quantity',i.quantity,'unitPrice',i.unit_price)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.tracking_token_hash=$1 GROUP BY o.id`,[hash]); if(!rows[0])return NextResponse.json({error:"سفارش پیدا نشد."},{status:404,headers:{"Cache-Control":"no-store"}}); return NextResponse.json({order:rows[0]},{headers:{"Cache-Control":"no-store, private"}}); }
  catch { return NextResponse.json({error:"پیگیری سفارش موقتاً در دسترس نیست."},{status:503}); }
}
