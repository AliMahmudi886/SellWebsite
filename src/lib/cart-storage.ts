import type {Product} from "@/lib/products";

export type CartLine={id:string;quantity:number};
export const CART_STORAGE_KEY="narenj-cart-v1";
export const CART_CHANGE_EVENT="narenj-cart-change";

export function parseCartLines(raw:string|null):CartLine[]{
 if(!raw)return [];
 try{
  const value:unknown=JSON.parse(raw);
  if(!Array.isArray(value))return [];
  return value.filter((line):line is CartLine=>Boolean(line)&&typeof line==="object"&&"id" in line&&typeof line.id==="string"&&"quantity" in line&&typeof line.quantity==="number"&&Number.isInteger(line.quantity)&&line.quantity>0);
 }catch{return [];}
}
export function reconcileCart(lines:CartLine[],products:Product[]):CartLine[]{
 const reconciled:CartLine[]=[];
 for(const line of lines){
  const product=products.find(item=>item.id===line.id);
  if(!product||product.stock<1)continue;
  const quantity=Math.min(line.quantity,product.stock),existing=reconciled.find(item=>item.id===line.id);
  if(existing)existing.quantity=Math.min(existing.quantity+quantity,product.stock);
  else reconciled.push({id:product.id,quantity});
 }
 return reconciled;
}
export function readCartLines():CartLine[]{try{return parseCartLines(localStorage.getItem(CART_STORAGE_KEY));}catch{return [];}}
export function saveCartLines(lines:CartLine[]){
 try{
  const next=lines.length?JSON.stringify(lines):null,previous=localStorage.getItem(CART_STORAGE_KEY);
  if(next===previous)return true;
  if(next)localStorage.setItem(CART_STORAGE_KEY,next);
  else localStorage.removeItem(CART_STORAGE_KEY);
  window.dispatchEvent(new Event(CART_CHANGE_EVENT));
  return true;
 }catch{return false;}
}
export function cartItemCount(lines:CartLine[]){return lines.reduce((sum,line)=>sum+line.quantity,0);}
export function sameCartLines(a:CartLine[],b:CartLine[]){return a.length===b.length&&a.every((line,index)=>line.id===b[index].id&&line.quantity===b[index].quantity);}
