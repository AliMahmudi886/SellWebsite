import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{filename:string}>}){
  const {filename}=await params;
  if(!/^[a-f0-9-]{36}\.webp$/.test(filename))return new NextResponse(null,{status:404});
  try{
    const image=await readFile(join(process.cwd(),"storage","uploads",filename));
    return new NextResponse(new Uint8Array(image),{headers:{"Content-Type":"image/webp","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff"}});
  }catch{return new NextResponse(null,{status:404});}
}
