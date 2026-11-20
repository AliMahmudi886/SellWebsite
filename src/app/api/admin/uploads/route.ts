import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getAdmin, validOrigin } from "@/lib/auth";
import { detectImageMime } from "@/lib/image-upload";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime="nodejs";
const maxFileBytes=5*1024*1024;
const maxRequestBytes=maxFileBytes+256*1024;
async function readLimitedBody(request:Request,limit:number){
  if(!request.body)throw new Error("empty_body");
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Error("body_too_large");}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),total);
}

export async function POST(request:Request){
  if(!await getAdmin("media:write"))return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  if(!validOrigin(request))return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>maxRequestBytes)return NextResponse.json({error:"حجم درخواست باید کمتر از ۵ مگابایت باشد."},{status:413});
  let rateLimit:Awaited<ReturnType<typeof consumeRateLimit>>;
  try{rateLimit=await consumeRateLimit("admin-upload",request,20,10*60_000);}catch{return NextResponse.json({error:"بارگذاری تصویر موقتاً در دسترس نیست."},{status:503});}
  if(!rateLimit.allowed)return NextResponse.json({error:"تعداد بارگذاری زیاد است؛ کمی بعد دوباره امتحان کنید."},{status:429,headers:{"Retry-After":String(rateLimit.retryAfterSeconds)}});
  let formData:FormData;
  try{const body=await readLimitedBody(request,maxRequestBytes);formData=await new Request(request.url,{method:"POST",headers:request.headers,body}).formData();}
  catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="body_too_large"?"حجم درخواست بیشتر از حد مجاز است.":"فایل تصویر خوانده نشد."},{status:error instanceof Error&&error.message==="body_too_large"?413:400});}
  const file=formData.get("file");
  if(!(file instanceof File)||file.size<16||file.size>maxFileBytes)return NextResponse.json({error:"فایل باید تصویری معتبر و کوچک‌تر از ۵ مگابایت باشد."},{status:400});
  try{
    const input=Buffer.from(await file.arrayBuffer());
    const mime=detectImageMime(input);
    if(!mime||file.type!==mime)return NextResponse.json({error:"فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود."},{status:415});
    const metadata=await sharp(input,{limitInputPixels:30_000_000,animated:false}).metadata();
    if(!metadata.width||!metadata.height||metadata.width>8000||metadata.height>8000||(metadata.pages??1)>1)return NextResponse.json({error:"ابعاد یا قالب تصویر پشتیبانی نمی‌شود."},{status:400});
    const output=await sharp(input,{limitInputPixels:30_000_000}).rotate().resize({width:1800,height:1800,fit:"inside",withoutEnlargement:true}).webp({quality:82,effort:5}).toBuffer();
    const directory=join(process.cwd(),"storage","uploads");
    await mkdir(directory,{recursive:true});
    const name=`${randomUUID()}.webp`;
    await writeFile(join(directory,name),output,{flag:"wx"});
    return NextResponse.json({url:`/api/media/${name}`,width:metadata.width,height:metadata.height,bytes:output.length},{status:201});
  }catch{return NextResponse.json({error:"پردازش تصویر ممکن نشد."},{status:400});}
}
