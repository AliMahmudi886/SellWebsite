"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { CART_CHANGE_EVENT,cartItemCount,readCartLines } from "@/lib/cart-storage";

export function SiteHeader({count=0,onSearch,onCart,onShop,active,shopReady=true}:{count?:number;onSearch?:()=>void;onCart?:()=>void;onShop?:()=>void;active?:"about"|"contact";shopReady?:boolean}){
 const [cartTotal,setCartTotal]=useState(count);
 useEffect(()=>{const sync=()=>setCartTotal(cartItemCount(readCartLines()));sync();window.addEventListener("storage",sync);window.addEventListener(CART_CHANGE_EVENT,sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener(CART_CHANGE_EVENT,sync);};},[]);
 return <header className="header shell">
  <Link className="brand" href="/#home" aria-label="خانه‌ی نارنج، صفحهٔ اصلی">خانه‌ی نارنج<span className="brand-mark" aria-hidden="true">.</span></Link>
  <nav className="nav" aria-label="ناوبری اصلی"><Link href="/#home">خانه</Link>{shopReady&&<><Link href="/#categories">دسته‌بندی‌ها</Link><Link href="/#products" onClick={onShop}>فروشگاه</Link></>}<Link href="/about" prefetch={onShop ? false : undefined} aria-current={active==="about"?"page":undefined}>داستان ما</Link><Link href="/contact" prefetch={onShop ? false : undefined} aria-current={active==="contact"?"page":undefined}>تماس</Link></nav>
  {shopReady&&<div className="header-actions">
   {onSearch?<button className="icon-button" aria-label="جست‌وجو در محصولات" onClick={onSearch}><UiIcon name="search"/></button>:<Link className="icon-button" aria-label="جست‌وجو در محصولات" href="/#search"><UiIcon name="search"/></Link>}
   {onCart?<button className="icon-button" aria-label={`سبد خرید، ${cartTotal} کالا`} onClick={onCart}><UiIcon name="shopping-bag"/>{cartTotal>0&&<span className="cart-count">{cartTotal}</span>}</button>:<Link className="icon-button" aria-label={`رفتن به سبد خرید، ${cartTotal} کالا`} href="/#cart"><UiIcon name="shopping-bag"/>{cartTotal>0&&<span className="cart-count">{cartTotal}</span>}</Link>}
  </div>}
 </header>;
}
