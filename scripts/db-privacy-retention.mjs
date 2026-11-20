import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const args=process.argv.slice(2);
const valueAfter=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
const days=Number(valueAfter("--older-than-days"));
const apply=args.includes("--apply");
const confirm=valueAfter("--confirm-anonymize");
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required.");
if(!Number.isInteger(days)||days<1||days>36500)throw new Error("Provide --older-than-days between 1 and 36500.");
if(apply&&confirm!==new URL(process.env.DATABASE_URL).pathname.replace(/^\//,""))throw new Error("Applying changes requires --confirm-anonymize <POSTGRES_DB> matching DATABASE_URL.");
if(process.env.NODE_ENV==="production"&&apply&&process.env.ALLOW_PRODUCTION_PRIVACY_MAINTENANCE!=="true")throw new Error("Production anonymization is disabled unless ALLOW_PRODUCTION_PRIVACY_MAINTENANCE=true is explicitly set.");

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:true}:undefined});
const cutoff=new Date(Date.now()-days*24*60*60*1000);
try {
  if(!apply){
    const {rows}=await pool.query(`SELECT count(*)::int AS count,min(created_at) AS oldest,max(created_at) AS newest FROM orders WHERE created_at<$1 AND status IN ('delivered','cancelled') AND customer_name<>'[حذف هویت]'`,[cutoff]);
    const {rows:open}=await pool.query("SELECT count(*)::int AS count FROM orders WHERE created_at<$1 AND status NOT IN ('delivered','cancelled')",[cutoff]);
    console.log(JSON.stringify({mode:"preview",olderThanDays:days,cutoff:cutoff.toISOString(),eligible:rows[0].count,oldest:rows[0].oldest,newest:rows[0].newest,openOrdersProtected:open[0].count,changed:false},null,2));
    console.log("Preview only. To anonymize eligible final orders, pass --apply --confirm-anonymize <POSTGRES_DB> and explicitly enable production maintenance when applicable.");
  } else {
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const {rows}=await client.query("SELECT id FROM orders WHERE created_at<$1 AND status IN ('delivered','cancelled') AND customer_name<>'[حذف هویت]' ORDER BY created_at FOR UPDATE SKIP LOCKED",[cutoff]);
      for(const row of rows){
        const orderId=String(row.id),newTokenHash=createHash("sha256").update(randomBytes(32)).digest("hex");
        await client.query("UPDATE orders SET customer_name='[حذف هویت]',phone='',address='',tracking_token_hash=$2,updated_at=NOW() WHERE id=$1",[orderId,newTokenHash]);
        await client.query("INSERT INTO admin_audit_log(actor,action,target_type,target_id,details) VALUES('privacy-maintenance','order.personal_data_anonymized','order',$1,$2)",[orderId,JSON.stringify({olderThanDays:days,cutoff:cutoff.toISOString()})]);
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({mode:"apply",olderThanDays:days,cutoff:cutoff.toISOString(),anonymized:rows.length,financialAndStatusHistoryPreserved:true,trackingTokensInvalidated:true},null,2));
    } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
} finally {await pool.end();}
