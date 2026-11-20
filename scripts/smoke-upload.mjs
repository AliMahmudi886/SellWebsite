import { unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { createSmokeAdminSession, sessionHash } from "./smoke-admin-session.mjs";
import sharp from "sharp";

if(process.env.NODE_ENV==="production")throw new Error("Upload smoke test is development-only.");
const base=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000";
const unauthorized=await fetch(new URL("/api/admin/uploads",base),{method:"POST",headers:{origin:new URL(base).origin}});
if(unauthorized.status!==401)throw new Error(`Unauthenticated upload returned ${unauthorized.status}.`);
const image=await sharp({create:{width:64,height:48,channels:3,background:"#d88158"}}).png().toBuffer();
const body=new FormData();body.append("file",new File([image],"smoke.png",{type:"image/png"}));
let uploadedPath="";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let token;
try{
  token=await createSmokeAdminSession(pool);
  const upload=await fetch(new URL("/api/admin/uploads",base),{method:"POST",headers:{origin:new URL(base).origin,cookie:`narenj_admin_session=${token}`},body});
  const result=await upload.json();
  if(upload.status!==201||!/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(result.url||""))throw new Error(`Authenticated upload returned ${upload.status}.`);
  uploadedPath=result.url;
  const asset=await fetch(new URL(uploadedPath,base));
  if(!asset.ok||!asset.headers.get("content-type")?.includes("image/webp"))throw new Error(`Uploaded asset returned ${asset.status}.`);
  console.log("Upload smoke passed: anonymous=401, authenticated upload=201, optimized WebP=200.");
}finally{
  try { if(token)await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1",[sessionHash(token)]); } finally { await pool.end(); }
  if(uploadedPath)await unlink(join(process.cwd(),"storage","uploads",uploadedPath.split("/").at(-1)));
}
