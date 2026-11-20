"use client";
import {useEffect,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {formatPrice,type Product} from "@/lib/products";
import {storeConfig} from "@/lib/store-config";
import {UiIcon} from "@/components/ui-icon";
import {SiteHeader} from "@/components/site-header";
import {SiteFooter} from "@/components/site-footer";
import {CART_CHANGE_EVENT,cartItemCount,readCartLines,saveCartLines} from "@/lib/cart-storage";

const sprite="/images/narenj-products.webp";
const positions:Record<string,string>={"linen-cushion":"0% 0%","ceramic-vase":"100% 0%","scented-candle":"0% 50%","woven-basket":"100% 50%","tea-cup":"0% 100%","table-runner":"100% 100%"};
type Recommendation={product:Product;purchaseBased:boolean;coOrders:number};
export function ProductDetail({product,recommendations}:{product:Product;recommendations:Recommendation[]}){
 const [message,setMessage]=useState(""),[cartCount,setCartCount]=useState(0);
 const [zoomed,setZoomed]=useState(false);
 const [quantity,setQuantity]=useState(1);
 useEffect(()=>{const sync=()=>setCartCount(cartItemCount(readCartLines()));sync();window.addEventListener("storage",sync);window.addEventListener(CART_CHANGE_EVENT,sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener(CART_CHANGE_EVENT,sync);};},[]);
 function addToCart(){
  try{
   const cart=readCartLines();
   const current=cart.find(line=>line.id===product.id)?.quantity??0;
   if(current+quantity>product.stock){setMessage("این تعداد با موجودی و سبد فعلی قابل افزودن نیست.");return;}
   const next=cart.some(line=>line.id===product.id)?cart.map(line=>line.id===product.id?{...line,quantity:line.quantity+quantity}:line):[...cart,{id:product.id,quantity}];
   if(!saveCartLines(next)){setMessage("ذخیره‌ی سبد خرید در این مرورگر در دسترس نیست.");return;}setCartCount(cartItemCount(next));setMessage("به سبد خرید اضافه شد.");
  }catch{setMessage("ذخیره‌ی سبد خرید در این مرورگر در دسترس نیست.");}
 }
 return <div className="product-detail-layout"><SiteHeader count={cartCount}/><main className="shell product-detail-page"><nav className="product-breadcrumb" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">/</span><span>{product.category}</span><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></nav><div className="product-detail"><button type="button" className={`product-detail-image${zoomed ? " is-zoomed" : ""}`} aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)} aria-label={`بزرگ‌نمایی تصویر ${product.name}`}><span className="detail-photo" role={product.image===sprite?"img":undefined} aria-label={product.image===sprite?product.name:undefined} style={product.image===sprite?{backgroundImage:`url('${sprite}')`,backgroundSize:"200% 300%",backgroundPosition:positions[product.id]||"0% 0%"}:undefined}>{product.image!==sprite&&<Image src={product.image} alt={product.name} fill unoptimized sizes="(max-width: 760px) 100vw, 50vw" style={{objectFit:"cover"}}/>}</span><span className="zoom-indicator"><UiIcon name={zoomed ? "minus" : "plus"}/></span></button><section className="product-detail-copy"><span className="eyebrow">{product.category}</span><h1>{product.name}</h1><div className="detail-purchase"><div className="detail-purchase-heading"><p className="product-detail-price">{formatPrice(product.price)} {storeConfig.currency} {product.oldPrice && <del className="old-price">{formatPrice(product.oldPrice)}</del>}</p><p className={product.stock>0&&product.stock<=3?"stock-low":"stock-state"}>{product.stock===0?"در حال حاضر ناموجود":product.stock<=3?`فقط ${product.stock} عدد باقی مانده`:`موجود · ${product.stock} عدد`}</p></div><div className="detail-purchase-actions">{product.stock>0 && <div className="detail-quantity" role="group" aria-label="تعداد محصول">
   <button type="button" className="icon-button" disabled={quantity<=1} aria-label="کم کردن تعداد" onClick={() => setQuantity(value => Math.max(1,value-1))}><UiIcon name="minus"/></button>
   <output aria-live="polite">{quantity.toLocaleString("fa-IR")}</output>
   <button type="button" className="icon-button" disabled={quantity>=product.stock} aria-label="زیاد کردن تعداد" onClick={() => setQuantity(value => Math.min(product.stock,value+1))}><UiIcon name="plus"/></button>
 </div>}<button className="primary-button" disabled={product.stock<1} onClick={addToCart}>{product.stock<1?"ناموجود":"افزودن به سبد خرید"}</button></div><p aria-live="polite" className="cart-feedback">{message}</p></div><p className="product-detail-description">{product.description}</p><div className="detail-policies"><Link href="/shipping"><UiIcon name="truck"/> ارسال و تحویل</Link><Link href="/returns"><UiIcon name="package"/> شرایط بازگشت</Link></div></section></div><aside className="mobile-purchase-bar" aria-label="خرید این محصول"><div><strong>{product.name}</strong><span>{formatPrice(product.price)} {storeConfig.currency}</span></div><button className="primary-button" disabled={product.stock<1} onClick={addToCart}>{product.stock<1?"ناموجود":"افزودن به سبد"}<UiIcon name="plus"/></button></aside><section className="related-products" aria-labelledby="related-heading"><div className="section-heading"><div><span className="eyebrow">شاید این‌ها هم به کارت بیایند</span><h2 id="related-heading">محصولات مرتبط</h2><p>{recommendations.some(item=>item.purchaseBased)?"ترکیبی از خریدهای تکمیل‌شده و شباهت محصول":"پیشنهاد بر اساس دسته‌بندی و بازه‌ی قیمت"}</p></div></div>{recommendations.length?<div className="product-grid">{recommendations.map(({product:item,purchaseBased})=><article key={item.id} className="product-card"><Link href={`/product/${encodeURIComponent(item.id)}`} className="related-image-link" aria-label={`جزئیات ${item.name}`}><div className="product-image" style={item.image===sprite?{backgroundImage:`url('${sprite}')`,backgroundSize:"200% 300%",backgroundPosition:positions[item.id]||"0% 0%"}:undefined}>{item.image!==sprite&&<Image src={item.image} alt={item.name} fill unoptimized sizes="(max-width: 560px) 45vw, 25vw" style={{objectFit:"cover"}}/>}</div></Link><Link href={`/product/${encodeURIComponent(item.id)}`} className="related-product-title">{item.name}</Link><div className="product-category">{item.category}</div><div className="product-price">{formatPrice(item.price)} {storeConfig.currency}</div><small className="recommendation-reason">{purchaseBased?"همراه در سفارش‌های تحویل‌شده":"هم‌دسته یا هم‌بازه‌ی قیمتی"}</small></article>)}</div>:<p className="empty-state">فعلاً محصول مرتبط دیگری موجود نیست.</p>}</section></main><SiteFooter/></div>;
}
