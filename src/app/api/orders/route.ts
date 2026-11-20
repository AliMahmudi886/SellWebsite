import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin, validOrigin } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { storeConfig } from "@/lib/store-config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readBoundedText, RequestBodyTooLarge } from "@/lib/request-body";
import { enqueueOrderEvent } from "@/lib/order-outbox";
import { canTransitionOrderStatus } from "@/lib/order-status";

const schema = z.object({ customerName: z.string().trim().min(2).max(80), phone: z.string().trim().regex(/^[\d۰-۹+\- ]{10,16}$/), address: z.string().trim().min(10).max(500), paymentMethod: z.enum(["manual", "cod"]), items: z.array(z.object({ id: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1).max(30) });
const statuses = ["awaiting_contact", "confirmed", "preparing", "sent", "delivered", "cancelled"] as const;

export async function POST(request: Request) {
  if(!validOrigin(request))return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  let rateLimit:Awaited<ReturnType<typeof consumeRateLimit>>;
  try{rateLimit=await consumeRateLimit("order-create",request,12,10*60_000);}catch{return NextResponse.json({error:"ثبت سفارش موقتاً در دسترس نیست."},{status:503});}
  if(!rateLimit.allowed)return NextResponse.json({error:"درخواست‌های زیادی ثبت شده؛ چند دقیقه‌ی دیگر تلاش کنید."},{status:429,headers:{"Retry-After":String(rateLimit.retryAfterSeconds)}});
  let rawBody: string;
  try {
    rawBody = await readBoundedText(request, 16_000);
  } catch (error) {
    return error instanceof RequestBodyTooLarge
      ? NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 })
      : NextResponse.json({ error: "بدنه‌ی درخواست معتبر نیست." }, { status: 400 });
  }
  let data: z.infer<typeof schema>;
  try { const parsed = schema.safeParse(JSON.parse(rawBody)); if (!parsed.success) return NextResponse.json({ error: "اطلاعات سفارش کامل یا معتبر نیست." }, { status: 400 }); data = parsed.data; }
  catch { return NextResponse.json({ error: "بدنه‌ی درخواست معتبر نیست." }, { status: 400 }); }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "ثبت سفارش موقتاً در دسترس نیست. لطفاً بعداً تلاش کنید." }, { status: 503 });
  const quantities = new Map<string, number>();
  for (const item of data.items) quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.quantity);
  if ([...quantities.values()].some(quantity => quantity > 20)) return NextResponse.json({ error: "تعداد درخواستی از حد مجاز بیشتر است." }, { status: 400 });
  const key = request.headers.get("idempotency-key");
  if (key !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    return NextResponse.json({ error: "شناسهٔ درخواست معتبر نیست." }, { status: 400 });
  }
  const normalizedKey = key?.toLowerCase();
  const ids = [...quantities.keys()].sort();
  const keyHash = normalizedKey ? createHash("sha256").update("checkout:" + normalizedKey).digest("hex") : null;
  const requestHash = normalizedKey ? createHmac("sha256", normalizedKey).update(JSON.stringify([
    data.customerName, data.phone, data.address, data.paymentMethod,
    ids.map(id => [id, quantities.get(id)]),
  ])).digest("hex") : null;
  const tokenForOrder = (id: string) => normalizedKey
    ? createHmac("sha256", normalizedKey).update("checkout-tracking:" + id).digest("base64url")
    : randomBytes(32).toString("base64url");
  const responseForOrder = (id: string, total: number) => NextResponse.json({
    orderId: id, trackingToken: tokenForOrder(id), total, currency: storeConfig.currency, status: "awaiting_contact",
  }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  let client;
  try { client = await getPool().connect(); }
  catch { return NextResponse.json({ error: "ذخیره‌ی سفارش موقتاً در دسترس نیست." }, { status: 503 }); }
  try {
    await client.query("BEGIN");
    if (keyHash) {
      // Serialize retries before looking up the committed order or touching inventory.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [keyHash]);
      const { rows } = await client.query(
        "SELECT id,total,idempotency_request_hash FROM orders WHERE idempotency_key_hash=$1", [keyHash],
      );
      if (rows[0]) {
        await client.query("COMMIT");
        return rows[0].idempotency_request_hash === requestHash
          ? responseForOrder(String(rows[0].id), Number(rows[0].total))
          : NextResponse.json({ error: "این شناسه قبلاً برای سفارش دیگری استفاده شده است." }, { status: 409 });
      }
    }
    const { rows } = await client.query("SELECT id,name,price,stock FROM products WHERE id = ANY($1) AND published = TRUE ORDER BY id FOR UPDATE", [ids]);
    const products = new Map(rows.map(row => [String(row.id), row]));
    if (products.size !== ids.length || ids.some(id => quantities.get(id)! > Number(products.get(id)?.stock ?? 0))) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "یکی از محصولات درخواستی موجود نیست یا موجودی کافی ندارد." }, { status: 400 });
    }
    const total = ids.reduce((sum, id) => sum + Number(products.get(id)!.price) * quantities.get(id)!, 0);
    const id = `NR-${randomUUID().replaceAll("-","").slice(0,16).toUpperCase()}`;
    const trackingToken = tokenForOrder(id);
    const tokenHash = createHash("sha256").update(trackingToken).digest("hex");
    if (keyHash) {
      await client.query(
        "INSERT INTO orders(id,tracking_token_hash,customer_name,phone,address,payment_method,total,idempotency_key_hash,idempotency_request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id,tokenHash,data.customerName,data.phone,data.address,data.paymentMethod,total,keyHash,requestHash],
      );
    } else {
      await client.query("INSERT INTO orders(id,tracking_token_hash,customer_name,phone,address,payment_method,total) VALUES($1,$2,$3,$4,$5,$6,$7)", [id,tokenHash,data.customerName,data.phone,data.address,data.paymentMethod,total]);
    }
    await client.query("INSERT INTO order_events(order_id,status,actor) VALUES($1,'awaiting_contact','customer')", [id]);
    for (const productId of ids) {
      const product = products.get(productId)!;
      const quantity = quantities.get(productId)!;
      await client.query("INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES($1,$2,$3,$4,$5)", [id,productId,product.name,product.price,quantity]);
      await client.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [quantity,productId]);
    }
    await enqueueOrderEvent(client, id, { type: "order.created", status: "awaiting_contact" });
    await client.query("COMMIT");
    return normalizedKey ? responseForOrder(id, total) : NextResponse.json({ orderId: id, trackingToken, total, currency: storeConfig.currency, status: "awaiting_contact" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "ذخیره‌ی سفارش ممکن نشد. لطفاً دوباره تلاش کنید." }, { status: 500 });
  } finally { client.release(); }
}

export async function GET() {
  if (!await getAdmin("orders:read")) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  try {
    const { rows } = await getPool().query(`SELECT o.id,o.customer_name,o.phone,o.address,o.payment_method,o.status,o.total,o.created_at,
      COALESCE(json_agg(json_build_object('name',i.product_name,'quantity',i.quantity,'unitPrice',i.unit_price)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items,
      (SELECT COALESCE(json_agg(json_build_object('status',e.status,'actor',e.actor,'created_at',e.created_at) ORDER BY e.created_at),'[]') FROM order_events e WHERE e.order_id=o.id) AS events
      FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`);
    return NextResponse.json({ orders: rows });
  } catch { return NextResponse.json({ error: "خواندن سفارش‌ها ممکن نشد." }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  const actor=await getAdmin("orders:write");if (!actor) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  if(!validOrigin(request))return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  if (request.headers.get("content-length") && Number(request.headers.get("content-length")) > 3000) return NextResponse.json({ error: "درخواست بزرگ است." }, { status: 413 });
  let body: { id: string; status: typeof statuses[number] };
  try { const parsed = z.object({ id: z.string().min(1), status: z.enum(statuses) }).safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "اطلاعات وضعیت معتبر نیست." }, { status: 400 }); body = parsed.data; }
  catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  try {
    const client = await getPool().connect();
    try { await client.query("BEGIN"); const current = await client.query("SELECT status FROM orders WHERE id=$1 FOR UPDATE",[body.id]); if (!current.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({error:"سفارش پیدا نشد."},{status:404}); }
      const currentStatus=String(current.rows[0].status);
      if(currentStatus===body.status){await client.query("ROLLBACK");return NextResponse.json({ok:true});}
      if(!canTransitionOrderStatus(currentStatus,body.status)){await client.query("ROLLBACK");return NextResponse.json({error:"این تغییر وضعیت با روند مجاز سفارش سازگار نیست."},{status:409});}
      if (body.status === "cancelled") {
        // Acquire product locks in the same order as checkout, before updating any stock.
        await client.query("SELECT p.id FROM products p WHERE p.id IN (SELECT product_id FROM order_items WHERE order_id=$1) ORDER BY p.id FOR UPDATE", [body.id]);
        await client.query(
          "UPDATE products p SET stock=p.stock+i.quantity,updated_at=NOW() FROM (SELECT product_id, SUM(quantity)::int AS quantity FROM order_items WHERE order_id=$1 GROUP BY product_id) i WHERE i.product_id=p.id",
          [body.id],
        );
      }
      await client.query("UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2",[body.status,body.id]);
      await client.query("INSERT INTO order_events(order_id,status,actor) VALUES($1,$2,$3)",[body.id,body.status,actor]);
      await client.query("INSERT INTO admin_audit_log(actor,action,target_type,target_id,details) VALUES($1,'order.status_changed','order',$2,$3)",[actor,body.id,JSON.stringify({status:body.status})]);
      await enqueueOrderEvent(client, body.id, { type: "order.status_changed", status: body.status, previousStatus: currentStatus });
      await client.query("COMMIT");
      return NextResponse.json({ok:true});
    } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch { return NextResponse.json({error:"تغییر وضعیت سفارش ممکن نشد."},{status:500}); }
}
