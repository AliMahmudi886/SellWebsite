import pg from "pg";
import { performance } from "node:perf_hooks";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production" || process.env.ALLOW_LOCAL_STRESS !== "1") throw new Error("Local-only stress test. Set ALLOW_LOCAL_STRESS=1 and use a disposable local database.");
const databaseUrl=new URL(process.env.DATABASE_URL);
if(!["localhost","127.0.0.1","::1","[::1]"].includes(databaseUrl.hostname))throw new Error("Refusing to stress a non-local database.");
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL === "true" ? {rejectUnauthorized:true} : undefined,max:4});
const runId = `stress-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const insertedIds=[];
let productIds=[];
const client=await pool.connect();
let transactionOpen=false;
let cleanupError;
try {
  const db=await pool.query("SELECT current_database() AS name, current_setting('server_version_num') AS version");
  const database=db.rows[0].name;
  if (database === "postgres" || database === "template0" || database === "template1") throw new Error("Refusing to run in a system database.");
  const products=await pool.query("SELECT id FROM products WHERE published=TRUE ORDER BY id LIMIT 8");
  if(products.rows.length<3)throw new Error("Need at least 3 published products in the local database.");
  productIds=products.rows.map(row=>String(row.id));
  const start=performance.now();
  await client.query("BEGIN");transactionOpen=true;
  const tokenHashes=[],customers=[],totals=[];
  const itemOrderIds=[],itemProductIds=[];
  for(let i=0;i<1000;i++){
    const id=`ST-${runId}-${String(i).padStart(4,"0")}`;insertedIds.push(id);
    tokenHashes.push(`${runId}:${i}`);customers.push(`stress:${runId}:${i}`);totals.push(1000+i);
    const chosen=[productIds[i%productIds.length],productIds[(i+1)%productIds.length],productIds[(i+3)%productIds.length]].filter((v,j,a)=>a.indexOf(v)===j);
    for(const productId of chosen){itemOrderIds.push(id);itemProductIds.push(productId);}
  }
  await client.query(`INSERT INTO orders(id,tracking_token_hash,customer_name,phone,address,payment_method,status,total)
    SELECT id,token_hash,customer,'09120000000','test-only disposable address','manual','awaiting_contact',total
    FROM unnest($1::text[],$2::text[],$3::text[],$4::bigint[]) AS x(id,token_hash,customer,total)`,[insertedIds,tokenHashes,customers,totals]);
  await client.query(`INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity)
    SELECT order_id,product_id,product_id,1000,1 FROM unnest($1::text[],$2::text[]) AS x(order_id,product_id)`,[itemOrderIds,itemProductIds]);
  await client.query("UPDATE orders SET status='delivered' WHERE id=ANY($1)",[insertedIds]);
  await client.query("COMMIT");transactionOpen=false;
  const writeMs=performance.now()-start;
  const verify=await pool.query("SELECT COUNT(*)::int AS learned_pairs FROM product_copurchase_counts WHERE co_orders>=3");
  await client.query("SET statement_timeout='5s'");
  const query=`SELECT pair.candidate_product_id AS product_id,pair.co_orders,COALESCE(source.order_count,0) AS source_orders,COALESCE(candidate.order_count,0) AS candidate_orders,GREATEST(1,(SELECT delivered_order_count FROM product_recommendation_stats WHERE id=1)) AS total_orders FROM product_copurchase_counts pair JOIN products available ON available.id=pair.candidate_product_id AND available.published=TRUE AND available.stock>0 LEFT JOIN product_order_counts source ON source.product_id=pair.source_product_id LEFT JOIN product_order_counts candidate ON candidate.product_id=pair.candidate_product_id WHERE pair.source_product_id=$1 AND pair.co_orders>0 ORDER BY pair.co_orders DESC`;
    const measurements=[];
    for(let i=0;i<30;i++){const t=performance.now();const result=await client.query(query,[productIds[i%productIds.length]]);measurements.push({ms:performance.now()-t,rows:result.rowCount});}
    measurements.sort((a,b)=>a.ms-b.ms);
    const percentile=p=>measurements[Math.min(measurements.length-1,Math.ceil(measurements.length*p)-1)].ms;
  console.log(JSON.stringify({database,postgresVersion:db.rows[0].version,fixtureOrders:1000,products:productIds.length,fixtureWriteMs:+writeMs.toFixed(1),recommendationSamples:measurements.length,queryP50Ms:+percentile(.5).toFixed(2),queryP95Ms:+percentile(.95).toFixed(2),maxRows:Math.max(...measurements.map(x=>x.rows)),learnedPairs:verify.rows[0].learned_pairs},null,2));
}finally{
  if(transactionOpen)await client.query("ROLLBACK");
  client.release();
  if(insertedIds.length){
    await pool.query("DELETE FROM orders WHERE id LIKE $1",[`ST-${runId}-%`]);
    const orderCheck=await pool.query(`SELECT COUNT(*)::int AS mismatches FROM product_order_counts c WHERE c.product_id=ANY($1) AND c.order_count<>(SELECT COUNT(DISTINCT i.order_id) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=c.product_id AND o.status='delivered')`,[productIds]);
    const pairCheck=await pool.query(`SELECT COUNT(*)::int AS mismatches FROM product_copurchase_counts c WHERE (c.source_product_id=ANY($1) OR c.candidate_product_id=ANY($1)) AND c.co_orders<>(SELECT COUNT(DISTINCT s.order_id) FROM order_items s JOIN orders o ON o.id=s.order_id JOIN order_items t ON t.order_id=s.order_id AND t.product_id=c.candidate_product_id WHERE s.product_id=c.source_product_id AND o.status='delivered')`,[productIds]);
    const totalCheck=await pool.query("SELECT stats.delivered_order_count<>(SELECT COUNT(*) FROM orders WHERE status='delivered') AS mismatch FROM product_recommendation_stats stats WHERE id=1");
    if(orderCheck.rows[0].mismatches||pairCheck.rows[0].mismatches||totalCheck.rows[0].mismatch)cleanupError=`Stress cleanup rollup mismatches: product=${orderCheck.rows[0].mismatches}, pair=${pairCheck.rows[0].mismatches}, total=${totalCheck.rows[0].mismatch}`;
  }
  await pool.end();
  if(cleanupError)throw new Error(cleanupError);
}
