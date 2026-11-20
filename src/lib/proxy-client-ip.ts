import { isIP } from "node:net";

export function trustedProxyHops(value:string|undefined) {
  if(value===undefined||value.trim()==="")return 1;
  if(!/^\d+$/.test(value.trim()))return 0;
  const hops=Number(value);
  return Number.isSafeInteger(hops)&&hops>=1&&hops<=8?hops:0;
}

export function clientIpFromTrustedProxy(request:Request,hops:number) {
  if(!Number.isInteger(hops)||hops<1||hops>8)return undefined;
  const forwarded=request.headers.get("x-forwarded-for");
  if(forwarded!==null){
    if(forwarded.length>512)return undefined;
    const chain=forwarded.split(",").map(value=>value.trim());
    if(chain.length>8||chain.some(value=>isIP(value)===0)||chain.length<hops)return undefined;
    return chain[chain.length-hops];
  }
  const realIp=request.headers.get("x-real-ip")?.trim();
  return realIp&&realIp.length<=64&&isIP(realIp)!==0?realIp:undefined;
}
