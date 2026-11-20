import pg from "pg";
import { createSmokeAdminSession, sessionHash } from "./smoke-admin-session.mjs";
import { createHash, createHmac, randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") throw new Error("Smoke test is development-only.");
const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let orderId;
let adminToken;
let orderLimiterHash;
let categoryProductId;
let raceProductId;
let secondRaceProductId;
const recommendationOrderIds=[];
const recommendationProductIds=[];
const raceOrderIds = [];
const smokeCategoryNames = [];
try {
  const page = await fetch(base);
  if (!page.ok) throw new Error(`Storefront returned ${page.status}.`);
  if (!(await page.text()).includes("narenj-products.webp")) throw new Error("Local product photos were not found in the storefront output.");
  const sessionSecret=process.env.ADMIN_SESSION_SECRET;
  if(!sessionSecret||sessionSecret.length<32)throw new Error("ADMIN_SESSION_SECRET is required for the admin API smoke.");
  orderLimiterHash=createHmac("sha256",sessionSecret).update("unproxied-client").digest("hex");
  await pool.query("DELETE FROM api_rate_limit_windows WHERE bucket='order-create' AND subject_hash=$1",[orderLimiterHash]);
  const response = await fetch(new URL("/api/orders", base), { method:"POST", headers:{"Content-Type":"application/json",origin:new URL(base).origin}, body:JSON.stringify({customerName:"کاربر آزمایشی",phone:"09120000000",address:"نشانی آزمایشی برای بررسی دیتابیس محلی",paymentMethod:"manual",items:[{id:"linen-cushion",quantity:1}]}) });
  const result = await response.json();
  if (response.status !== 201 || !result.orderId || !result.trackingToken) throw new Error(`Order creation returned ${response.status}.`);
  orderId = result.orderId;
  const trackingResponse = await fetch(new URL("/api/orders/track", base), {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:result.trackingToken})});
  const tracking = await trackingResponse.json();
  if (!trackingResponse.ok || tracking.order?.id !== orderId || !trackingResponse.headers.get("cache-control")?.includes("no-store")) throw new Error(`Tracking returned ${trackingResponse.status} or omitted private no-store caching.`);
  const oversizedTracking=await fetch(new URL("/api/orders/track",base),{method:"POST",headers:{"Content-Type":"application/json"},body:"x".repeat(2049)});
  if(oversizedTracking.status!==413)throw new Error(`Oversized tracking request returned ${oversizedTracking.status}, expected 413.`);
  adminToken=await createSmokeAdminSession(pool);
  const authHeaders={cookie:`narenj_admin_session=${adminToken}`,origin:new URL(base).origin,"Content-Type":"application/json"};
  // Two simultaneous checkouts for the final unit must never both succeed.
  const raceCategory=`smoke-race-${randomUUID()}`;smokeCategoryNames.push(raceCategory);raceProductId=randomUUID();
  await pool.query("INSERT INTO categories(name,sort_order) VALUES($1,92)",[raceCategory]);
  await pool.query("INSERT INTO products(id,name,category,price,image,tone,description,stock,published) VALUES($1,$2,$3,1,'/images/narenj-products.webp','#e8e1d4','smoke stock race',1,TRUE)",[raceProductId,"smoke stock race",raceCategory]);
  const raceBody=JSON.stringify({customerName:"کاربر آزمایشی",phone:"09120000000",address:"نشانی آزمایشی برای بررسی رقابت موجودی",paymentMethod:"manual",items:[{id:raceProductId,quantity:1}]});
  const raceResponses=await Promise.all([1,2].map(()=>fetch(new URL("/api/orders",base),{method:"POST",headers:{"Content-Type":"application/json",origin:new URL(base).origin},body:raceBody})));
  const raceResults=await Promise.all(raceResponses.map(async response=>({status:response.status,body:await response.json()})));
  for(const result of raceResults)if(result.status===201)raceOrderIds.push(result.body.orderId);
  if(raceOrderIds.length!==1||raceResults.filter(result=>result.status===400).length!==1)throw new Error(`Last-stock race produced statuses ${raceResults.map(result=>result.status).join(", ")}; expected one 201 and one 400.`);
  const remaining=await pool.query("SELECT stock FROM products WHERE id=$1",[raceProductId]);
  if(Number(remaining.rows[0]?.stock)!==0)throw new Error("Concurrent checkouts did not reserve exactly the final unit.");
  secondRaceProductId = randomUUID();
  await pool.query("INSERT INTO products(id,name,category,price,image,tone,description,stock,published) SELECT $1,'smoke second race item',category,price,image,tone,description,5,TRUE FROM products WHERE id=$2", [secondRaceProductId,raceProductId]);
  await pool.query("UPDATE products SET stock=5 WHERE id=$1", [raceProductId]);
  const pair = [{id:raceProductId,quantity:1},{id:secondRaceProductId,quantity:1}];
  const checkoutPair = items => fetch(new URL("/api/orders",base), {
    method:"POST",headers:{"Content-Type":"application/json",origin:new URL(base).origin},
    body:JSON.stringify({...JSON.parse(raceBody),items}),
  });
  const pairedResponses = await Promise.all([checkoutPair(pair),checkoutPair([...pair].reverse())]);
  const pairedOrders = [];
  for (const response of pairedResponses) {
    if (response.status === 201) {
      const id = (await response.json()).orderId;
      pairedOrders.push(id);
      raceOrderIds.push(id);
    }
  }
  if (pairedOrders.length !== 2) throw new Error("Overlapping multi-item checkouts did not both succeed.");
  const cancel = id => fetch(new URL("/api/orders",base),{
    method:"PATCH",headers:authHeaders,body:JSON.stringify({id,status:"cancelled"}),
  });
  const cancellations = await Promise.all([...pairedOrders,pairedOrders[0]].map(cancel));
  if (cancellations.some(response => !response.ok)) throw new Error("Concurrent cancellations failed.");
  const restored = await pool.query("SELECT stock FROM products WHERE id=ANY($1)", [[raceProductId,secondRaceProductId]]);
  if (restored.rowCount !== 2 || restored.rows.some(row => row.stock !== 5)) throw new Error("Cancellation must restore both products exactly once.");
  const cancellationEvents = await pool.query("SELECT COUNT(*)::int AS count FROM order_events WHERE order_id=ANY($1) AND status='cancelled'", [pairedOrders]);
  if (cancellationEvents.rows[0].count !== 2) throw new Error("Repeated cancellation created an extra history event.");
  const retryKey = randomUUID();
  const retry = (items = pair) => fetch(new URL("/api/orders",base), {
    method:"POST",
    headers:{"Content-Type":"application/json",origin:new URL(base).origin,"Idempotency-Key":retryKey},
    body:JSON.stringify({...JSON.parse(raceBody),items}),
  });
  const simultaneous = await Promise.all([retry(),retry([...pair].reverse())]);
  const responses = [...simultaneous,await retry()];
  const replies = [];
  for (const response of responses) {
    const reply = await response.json();
    if (response.status === 201 && !raceOrderIds.includes(reply.orderId)) raceOrderIds.push(reply.orderId);
    if (response.status !== 201) throw new Error("Idempotency request returned " + response.status);
    replies.push(reply);
  }
  if (replies.some(reply => reply.orderId !== replies[0].orderId || reply.trackingToken !== replies[0].trackingToken)) {
    throw new Error("Retry returned a different order or tracking token.");
  }
  if ((await retry([{id:raceProductId,quantity:2}])).status !== 409) throw new Error("Reusing a key with changed items must return 409.");
  const keyHash = createHash("sha256").update("checkout:" + retryKey).digest("hex");
  const savedCount = await pool.query("SELECT COUNT(*)::int AS count FROM orders WHERE idempotency_key_hash=$1",[keyHash]);
  const retryStock = await pool.query("SELECT stock FROM products WHERE id=ANY($1)", [[raceProductId,secondRaceProductId]]);
  if (savedCount.rows[0].count !== 1 || retryStock.rowCount !== 2 || retryStock.rows.some(row => row.stock !== 4)) {
    throw new Error("Retries must create one order and decrement each item exactly once.");
  }
  const replayTracking = await fetch(new URL("/api/orders/track",base), {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:replies[2].trackingToken}),
  });
  if (!replayTracking.ok || (await replayTracking.json()).order.id !== replies[0].orderId) throw new Error("Replayed token did not track the same order.");
  const createdEvents = await pool.query("SELECT event_type,payload FROM order_outbox WHERE order_id=$1",[replies[0].orderId]);
  if (createdEvents.rowCount !== 1 || createdEvents.rows[0].event_type !== "order.created" ||
    JSON.stringify(createdEvents.rows[0].payload) !== JSON.stringify({ status:"awaiting_contact" })) {
    throw new Error("Idempotent checkout must enqueue one minimal creation event.");
  }
  const cancelledOutbox = await pool.query("SELECT order_id,payload FROM order_outbox WHERE order_id=ANY($1) AND event_type='order.status_changed'", [pairedOrders]);
  if (cancelledOutbox.rowCount !== 2 || new Set(cancelledOutbox.rows.map(row => row.order_id)).size !== 2 ||
    cancelledOutbox.rows.some(row => row.payload.status !== "cancelled" || row.payload.previousStatus !== "awaiting_contact")) {
    throw new Error("Each successful cancellation must enqueue exactly one transition event.");
  }
  console.log("Order idempotency passed: concurrent and sequential retries, one row, one stock deduction, same tracking token and conflict rejection.");
  console.log("Inventory smoke passed: opposite item order, concurrent cancellations and single restock.");
  await pool.query("DELETE FROM admin_audit_log WHERE target_id=ANY($1)",[raceOrderIds]);
  await pool.query("DELETE FROM orders WHERE id=ANY($1)",[raceOrderIds]);raceOrderIds.length=0;
  await pool.query("DELETE FROM products WHERE id=$1",[secondRaceProductId]);secondRaceProductId=undefined;
  await pool.query("DELETE FROM products WHERE id=$1",[raceProductId]);raceProductId=undefined;
  await pool.query("DELETE FROM categories WHERE name=$1",[raceCategory]);smokeCategoryNames.pop();
  const categoryName=`smoke-${randomUUID()}`;const renamedCategoryName=`${categoryName}-edited`;smokeCategoryNames.push(categoryName,renamedCategoryName);categoryProductId=randomUUID();
  const categoryCreate=await fetch(new URL("/api/admin/categories",base),{method:"POST",headers:authHeaders,body:JSON.stringify({name:categoryName,sortOrder:91})});
  if(categoryCreate.status!==201)throw new Error(`Category creation returned ${categoryCreate.status}.`);
  await pool.query("INSERT INTO products(id,name,category,price,image,tone,description,stock,published) VALUES($1,$2,$3,1,'/images/narenj-products.webp','#e8e1d4','smoke category product',0,FALSE)",[categoryProductId,"smoke category product",categoryName]);
  const categoryRename=await fetch(new URL("/api/admin/categories",base),{method:"PATCH",headers:authHeaders,body:JSON.stringify({oldName:categoryName,name:renamedCategoryName,sortOrder:7})});
  if(categoryRename.status!==200)throw new Error(`Category rename returned ${categoryRename.status}.`);
  const cascaded=await pool.query("SELECT category FROM products WHERE id=$1",[categoryProductId]);
  if(cascaded.rows[0]?.category!==renamedCategoryName)throw new Error("Renaming a category did not update its products.");
  const protectedDelete=await fetch(new URL("/api/admin/categories",base),{method:"DELETE",headers:authHeaders,body:JSON.stringify({name:renamedCategoryName})});
  if(protectedDelete.status!==409)throw new Error(`Deleting a used category returned ${protectedDelete.status}, expected 409.`);
  await pool.query("DELETE FROM products WHERE id=$1",[categoryProductId]);categoryProductId=undefined;
  const categoryDelete=await fetch(new URL("/api/admin/categories",base),{method:"DELETE",headers:authHeaders,body:JSON.stringify({name:renamedCategoryName})});
  if(categoryDelete.status!==200)throw new Error(`Category deletion returned ${categoryDelete.status}.`);
  await pool.query("DELETE FROM admin_audit_log WHERE target_id=ANY($1)",[[categoryName,renamedCategoryName]]);
  smokeCategoryNames.length=0;
  const recommendationCategory=`smoke-related-${randomUUID()}`,complementCategory=`${recommendationCategory}-complement`;smokeCategoryNames.push(recommendationCategory,complementCategory);
  const categoryCreateForRelated=await fetch(new URL("/api/admin/categories",base),{method:"POST",headers:authHeaders,body:JSON.stringify({name:recommendationCategory,sortOrder:93})});
  if(categoryCreateForRelated.status!==201)throw new Error(`Recommendation category creation returned ${categoryCreateForRelated.status}.`);
  const complementCreate=await fetch(new URL("/api/admin/categories",base),{method:"POST",headers:authHeaders,body:JSON.stringify({name:complementCategory,sortOrder:94})});
  if(complementCreate.status!==201)throw new Error(`Recommendation complement category creation returned ${complementCreate.status}.`);
  const relatedSourceId=randomUUID(),relatedBoughtId=randomUUID(),relatedFallbackId=randomUUID();recommendationProductIds.push(relatedSourceId,relatedBoughtId,relatedFallbackId);
  for(const [id,name,category] of [[relatedSourceId,"smoke related source",recommendationCategory],[relatedBoughtId,"smoke frequently bought",complementCategory],[relatedFallbackId,"smoke category fallback",recommendationCategory]])await pool.query("INSERT INTO products(id,name,category,price,image,tone,description,stock,published) VALUES($1,$2,$3,100,'/images/narenj-products.webp','#e8e1d4','smoke related recommendation product',4,TRUE)",[id,name,category]);
  for(let sample=1;sample<=3;sample++){
    const relatedOrderResponse=await fetch(new URL("/api/orders",base),{method:"POST",headers:{"Content-Type":"application/json",origin:new URL(base).origin},body:JSON.stringify({customerName:`خریدار آزمایشی ${sample}`,phone:"09120000000",address:"نشانی آزمایشی برای الگوریتم محصولات مرتبط",paymentMethod:"manual",items:[{id:relatedSourceId,quantity:1},{id:relatedBoughtId,quantity:1}]})});
    const relatedOrder=await relatedOrderResponse.json();if(relatedOrderResponse.status!==201)throw new Error(`Related-products test order ${sample} returned ${relatedOrderResponse.status}.`);recommendationOrderIds.push(relatedOrder.orderId);
    for(const status of ["confirmed","preparing","sent","delivered"]){const advanced=await fetch(new URL("/api/orders",base),{method:"PATCH",headers:authHeaders,body:JSON.stringify({id:relatedOrder.orderId,status})});if(advanced.status!==200)throw new Error(`Related-products test transition to ${status} returned ${advanced.status}.`);}
  }
  const relatedPage=await fetch(new URL(`/product/${relatedSourceId}`,base));const relatedHtml=await relatedPage.text();
  const boughtPosition=relatedHtml.indexOf(`href="/product/${relatedBoughtId}"`),fallbackPosition=relatedHtml.indexOf(`href="/product/${relatedFallbackId}"`);
  if(!relatedPage.ok||boughtPosition<0||fallbackPosition<0||boughtPosition>fallbackPosition)throw new Error("The product detail page did not rank the delivered-order co-purchase ahead of category fallback.");
  const rejectedJump=await fetch(new URL("/api/orders",base),{method:"PATCH",headers:authHeaders,body:JSON.stringify({id:orderId,status:"delivered"})});
  if(rejectedJump.status!==409)throw new Error(`Invalid order status jump returned ${rejectedJump.status}, expected 409.`);
  const confirmed=await fetch(new URL("/api/orders",base),{method:"PATCH",headers:authHeaders,body:JSON.stringify({id:orderId,status:"confirmed"})});
  if(confirmed.status!==200)throw new Error(`Admin status change returned ${confirmed.status}.`);
  const cancelled=await fetch(new URL("/api/orders",base),{method:"PATCH",headers:authHeaders,body:JSON.stringify({id:orderId,status:"cancelled"})});
  if(cancelled.status!==200)throw new Error(`Order cancellation returned ${cancelled.status}.`);
  const listResponse=await fetch(new URL("/api/orders",base),{headers:{cookie:`narenj_admin_session=${adminToken}`}});
  const listed=await listResponse.json();const saved=listed.orders?.find(order=>order.id===orderId);
  if(!listResponse.ok||saved?.status!=="cancelled"||saved.events?.length!==3)throw new Error("Admin order history did not include the expected status events.");
  const auditResponse=await fetch(new URL("/api/admin/audit?q="+encodeURIComponent(orderId),base),{headers:{cookie:`narenj_admin_session=${adminToken}`}});
  const audit=await auditResponse.json();if(!auditResponse.ok||!audit.events?.some(event=>event.target_id===orderId&&event.action==="order.status_changed"))throw new Error("Searchable admin audit did not include the order status changes.");
  const limiterSubject=process.env.TRUST_PROXY==="true"?"203.0.113.99":"unproxied-client";
  const limiterHash=createHmac("sha256",sessionSecret||"local-rate-limit-key").update(limiterSubject).digest("hex");
  await pool.query("DELETE FROM api_rate_limit_windows WHERE bucket='admin-login' AND subject_hash=$1",[limiterHash]);
  try {
    for(let attempt=1;attempt<=8;attempt++){
      const failed=await fetch(new URL("/api/admin/login",base),{method:"POST",headers:{"Content-Type":"application/json",origin:new URL(base).origin,"x-forwarded-for":limiterSubject},body:JSON.stringify({email:"smoke@example.invalid",password:"invalid-smoke-password"})});
      if(failed.status!==401)throw new Error(`Login rate limit attempt ${attempt} returned ${failed.status}, expected 401.`);
    }
    const limited=await fetch(new URL("/api/admin/login",base),{method:"POST",headers:{"Content-Type":"application/json",origin:new URL(base).origin,"x-forwarded-for":limiterSubject},body:JSON.stringify({email:"smoke@example.invalid",password:"invalid-smoke-password"})});
    if(limited.status!==429||!limited.headers.get("retry-after"))throw new Error(`Login rate limit returned ${limited.status}, expected 429 with Retry-After.`);
  } finally { await pool.query("DELETE FROM api_rate_limit_windows WHERE bucket='admin-login' AND subject_hash=$1",[limiterHash]); }
  console.log("Smoke passed: storefront/order/tracking, order history and stock restoration, delivered-order product recommendations, searchable admin audit, last-stock concurrent checkout, category rename/delete rules, and shared rate limit with Retry-After.");
} finally {
  if(adminToken)await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1",[sessionHash(adminToken)]);
  if(orderLimiterHash)await pool.query("DELETE FROM api_rate_limit_windows WHERE bucket='order-create' AND subject_hash=$1",[orderLimiterHash]);
  if(categoryProductId)await pool.query("DELETE FROM products WHERE id=$1",[categoryProductId]);
  if(raceOrderIds.length)await pool.query("DELETE FROM admin_audit_log WHERE target_id=ANY($1)",[raceOrderIds]);
  if(raceOrderIds.length)await pool.query("DELETE FROM orders WHERE id=ANY($1)",[raceOrderIds]);
  if(secondRaceProductId)await pool.query("DELETE FROM products WHERE id=$1",[secondRaceProductId]);
  if(raceProductId)await pool.query("DELETE FROM products WHERE id=$1",[raceProductId]);
  if(recommendationOrderIds.length)await pool.query("DELETE FROM orders WHERE id=ANY($1)",[recommendationOrderIds]);
  if(recommendationOrderIds.length)await pool.query("DELETE FROM admin_audit_log WHERE target_id=ANY($1)",[recommendationOrderIds]);
  if(smokeCategoryNames.length)await pool.query("DELETE FROM admin_audit_log WHERE target_id=ANY($1)",[smokeCategoryNames]);
  if(recommendationProductIds.length)await pool.query("DELETE FROM products WHERE id=ANY($1)",[recommendationProductIds]);
  for(const name of smokeCategoryNames)await pool.query("DELETE FROM categories WHERE name=$1",[name]);
  if (orderId) {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const status=await client.query("SELECT status FROM orders WHERE id=$1",[orderId]); const {rows}=await client.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1",[orderId]); if(status.rows[0]?.status!=="cancelled")for(const row of rows) if(row.product_id) await client.query("UPDATE products SET stock=stock+$1 WHERE id=$2",[row.quantity,row.product_id]); await client.query("DELETE FROM admin_audit_log WHERE target_id=$1",[orderId]);await client.query("DELETE FROM orders WHERE id=$1",[orderId]); await client.query("COMMIT"); }
    catch(error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  await pool.end();
}
