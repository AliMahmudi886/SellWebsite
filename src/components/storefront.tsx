"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { UiIcon } from "@/components/ui-icon";
import { SiteHeader } from "@/components/site-header";
import { formatPrice, normalizeSearch, type Product } from "@/lib/products";
import { CART_CHANGE_EVENT, CART_STORAGE_KEY, parseCartLines, reconcileCart, sameCartLines, saveCartLines, type CartLine } from "@/lib/cart-storage";
import { createDemoOrder, publicDemo } from "@/lib/public-demo";
import { storeConfig } from "@/lib/store-config";

const productSprite="/images/narenj-products.webp";
const spriteProducts = new Set(["linen-cushion", "ceramic-vase", "scented-candle", "woven-basket", "tea-cup", "table-runner"]);

function CatalogImage({ product }: { product: Product }) {
  const isSprite = product.image === productSprite;
  const source = isSprite
    ? `/assets/catalog/${spriteProducts.has(product.id) ? product.id : "linen-cushion"}.webp`
    : product.image;

  return <Image src={source} alt="" fill unoptimized={!isSprite}
    sizes="(max-width: 850px) 46vw, (max-width: 1512px) 23vw, 348px" />;
}

type StorefrontProps = {
  initialProducts: Product[];
  hero: React.ReactNode;
  buyingGuide: React.ReactNode;
  footer: React.ReactNode;
};

export function Storefront({ initialProducts, hero, buyingGuide, footer }: StorefrontProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("همه محصولات");
  const [sort, setSort] = useState("featured");
  const [showCatalog, setShowCatalog] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checkoutDialogRef=useRef<HTMLElement>(null);
  const orderAttempt = useRef<{ body: string; key: string } | null>(null);
  const orderSubmissionLock=useRef(false);
  const categories = useMemo(() => Array.from(new Set(initialProducts.map(product => product.category.trim()).filter(Boolean))).map(name => {
    const cover = initialProducts.find(product => product.category.trim() === name);
    return [name, cover] as const;
  }), [initialProducts]);
  const shopReady = initialProducts.length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored=parseCartLines(localStorage.getItem(CART_STORAGE_KEY)),reconciled=reconcileCart(stored,initialProducts);
        setCart(reconciled);
        if(!sameCartLines(stored,reconciled)){setToast("سبد خرید با موجودی فعلی هماهنگ شد.");window.setTimeout(()=>setToast(""),2800);}
      } catch { /* Ignore invalid or unavailable local storage. */ }
      setCartLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialProducts]);

  useEffect(() => {
    if (!cartLoaded) return;
    try {
      saveCartLines(cart);
    } catch { /* The cart remains usable for this visit if storage is unavailable. */ }
  }, [cart, cartLoaded]);

  useEffect(()=>{const sync=()=>{try{setCart(reconcileCart(parseCartLines(localStorage.getItem(CART_STORAGE_KEY)),initialProducts));}catch{setCart([]);}};window.addEventListener("storage",sync);window.addEventListener(CART_CHANGE_EVENT,sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener(CART_CHANGE_EVENT,sync);};},[initialProducts]);

  useEffect(()=>{const timer=window.setTimeout(()=>{if(window.location.hash==="#cart"){setCheckout(true);window.history.replaceState(null,"",window.location.pathname+window.location.search);}else if(window.location.hash==="#search"){setShowCatalog(true);window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}#products`);window.setTimeout(()=>document.getElementById("search")?.focus(),0);}},0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{if(!checkout)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;checkoutDialogRef.current?.focus();const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape"){if(!orderSubmissionLock.current){setCheckout(false);setOrderId("");setTrackingToken("");setError("");}return;}if(event.key!=="Tab"||!checkoutDialogRef.current)return;const nodes=Array.from(checkoutDialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));if(!nodes.length){event.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};document.addEventListener("keydown",onKeyDown);return()=>{document.removeEventListener("keydown",onKeyDown);if(previous?.isConnected)previous.focus();};},[checkout]);

  useEffect(() => {
    if (checkout && orderId) checkoutDialogRef.current?.focus();
  }, [checkout, orderId]);

  function add(id: string) {
    const product = initialProducts.find(p => p.id === id);
    if (!product) return;
    const quantityInCart = cart.find(line => line.id === id)?.quantity ?? 0;
    if (quantityInCart >= product.stock) {
      setToast(product.stock === 0 ? "این کالا فعلاً ناموجود است" : `از این کالا فقط ${product.stock} عدد موجود است`);
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    setCart(current => current.some(line => line.id === id) ? current.map(line => line.id === id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { id, quantity: 1 }]);
    setToast(`${product?.name} به سبد اضافه شد`);
    window.setTimeout(() => setToast(""), 2400);
  }
  function changeQuantity(id:string,quantity:number){const product=initialProducts.find(item=>item.id===id);if(!product)return;if(quantity<=0){setCart(current=>current.filter(line=>line.id!==id));return;}if(quantity>product.stock){setToast(`از این کالا فقط ${product.stock} عدد موجود است`);window.setTimeout(()=>setToast(""),2400);return;}setCart(current=>current.map(line=>line.id===id?{...line,quantity}:line));}
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + (initialProducts.find(p => p.id === line.id)?.price ?? 0) * line.quantity, 0);
  const visibleProducts = useMemo(() => {
    const query=normalizeSearch(search);
    let list = initialProducts.filter(p => (category === "همه محصولات" || p.category.trim() === category) && normalizeSearch(`${p.name} ${p.category}`).includes(query));
    if (sort === "low") list = [...list].sort((a,b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a,b) => b.price - a.price);
    return list;
  }, [initialProducts, category, search, sort]);
  function openCatalog(selected = "همه محصولات") { setCategory(selected); setShowCatalog(true); document.getElementById("products")?.scrollIntoView({ block: "start" }); }
  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(orderSubmissionLock.current)return;orderSubmissionLock.current=true;setBusy(true);setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (publicDemo) {
        const order = createDemoOrder(cart, initialProducts);
        setOrderId(order.id); setTrackingToken(order.token); setCart([]);
        return;
      }
      const body = JSON.stringify({ customerName: form.get("name"), phone: form.get("phone"), address: form.get("address"), paymentMethod: form.get("payment"), items: cart });
      if (orderAttempt.current?.body !== body) orderAttempt.current = { body, key: crypto.randomUUID() };
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": orderAttempt.current.key }, body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ثبت سفارش انجام نشد.");
      orderAttempt.current = null;
      setOrderId(data.orderId); setTrackingToken(data.trackingToken); setCart([]);
    } catch (e) { setError(e instanceof Error ? e.message : "خطای ارتباط با سرور."); }
    finally { orderSubmissionLock.current=false;setBusy(false); }
  }
  async function copyTrackingToken(){try{await navigator.clipboard.writeText(trackingToken);setToast("کد پیگیری کپی شد.");}catch{setToast("کپی خودکار در دسترس نیست؛ کد را دستی انتخاب و کپی کن.");}window.setTimeout(()=>setToast(""),2600);}

  return <>
    <div className="announcement">{shopReady ? "زمان و هزینهٔ ارسال پس از ثبت سفارش هماهنگ می‌شود." : "فروشگاه خانه‌ی نارنج در حال آماده‌سازی است؛ به‌زودی با شما هستیم."}</div>
    <SiteHeader shopReady={shopReady} count={count} onSearch={() => { setShowCatalog(true); window.setTimeout(() => document.getElementById("search")?.focus(), 0); }} onCart={() => {setError("");setCheckout(true);}} onShop={() => setShowCatalog(true)} />

    <main id="home" className="shell">
      <div className="hero-region" onClick={event => {
        if (event.target instanceof Element && event.target.closest("[data-open-catalog]")) setShowCatalog(true);
      }}>{hero}</div>

      {shopReady ? <>
      <section id="categories" className="section" aria-labelledby="category-heading"><div className="section-heading"><div><span className="eyebrow">از کجا شروع کنیم؟</span><h2 id="category-heading">برای هر گوشه‌ی خانه</h2></div><a className="text-link" href="#products" onClick={() => openCatalog()}>همه‌ی محصولات　<UiIcon name="arrow-left"/></a></div><div className="categories">{categories.map(([name,cover]) => <a key={name} className="category-card" href="#products" onClick={() => openCatalog(name)}>{cover && <CatalogImage product={cover}/>}<span>{name}<UiIcon name="arrow-left" className="category-arrow"/></span></a>)}</div>

      <section id="products" aria-labelledby="products-heading"><div className="section-heading"><div><span className="eyebrow">با دقت انتخاب شده</span><h2 id="products-heading">محبوب‌های نارنج</h2><p>چیزهایی برای خانه‌ای که شبیه خودت است.</p></div><button type="button" className="text-link catalog-toggle" aria-expanded={showCatalog} onClick={() => showCatalog ? setShowCatalog(false) : openCatalog()}>{showCatalog ? "نمایش محصولات منتخب" : "دیدن همه"} <UiIcon name="arrow-left"/></button></div>
        {showCatalog && <div className="catalog-tools"><input type="search" id="search" list="catalog-suggestions" aria-label="جست‌وجو در محصولات" placeholder="نام محصول را جست‌وجو کن..." value={search} onChange={e => setSearch(e.target.value)} /><datalist id="catalog-suggestions">{search.trim() && visibleProducts.slice(0, 6).map(product => <option key={product.id} value={product.name} />)}</datalist><select aria-label="دسته‌بندی محصول" value={category} onChange={e => setCategory(e.target.value)}><option>همه محصولات</option>{categories.map(([name]) => <option key={name}>{name}</option>)}</select><select aria-label="مرتب‌سازی" value={sort} onChange={e => setSort(e.target.value)}><option value="featured">پیشنهاد نارنج</option><option value="low">ارزان‌ترین</option><option value="high">گران‌ترین</option></select></div>}{showCatalog&&<p className="catalog-result-count" aria-live="polite">{visibleProducts.length} محصول پیدا شد</p>}
        <div className="product-grid">{(showCatalog ? visibleProducts : initialProducts.filter(p => p.featured)).map(product => <article className="product-card" key={product.id}><div className="product-image"><Link className="catalog-image-link" href={`/product/${encodeURIComponent(product.id)}`} aria-label={`مشاهدهٔ ${product.name}`}><CatalogImage product={product}/></Link>{product.badge && <span className="badge">{product.badge}</span>}<button className="quick-add" disabled={product.stock<=0} onClick={() => add(product.id)} aria-label={product.stock<=0?`${product.name} ناموجود`:`افزودن ${product.name} به سبد خرید`}><UiIcon name="plus"/></button></div><Link href={`/product/${encodeURIComponent(product.id)}`} className="product-title product-title-link">{product.name}</Link><div className="product-category">{product.category}</div>{product.stock===0?<div className="product-category" style={{color:"#a0372c"}}>ناموجود</div>:product.stock<=3?<div className="product-category" style={{color:"#a06020"}}>فقط {product.stock} عدد باقی مانده</div>:null}<div className="product-price"><span>{formatPrice(product.price)} {storeConfig.currency}</span>{product.oldPrice && <span className="old-price">{formatPrice(product.oldPrice)}</span>}</div></article>)}</div>
        {showCatalog && visibleProducts.length === 0 && <div className="empty-state">محصولی با این مشخصات پیدا نکردیم.<button type="button" className="text-link catalog-toggle" onClick={() => {setSearch(""); setCategory("همه محصولات"); setSort("featured"); document.getElementById("search")?.focus();}}>پاک کردن فیلترها</button></div>}
      </section></section>

      {buyingGuide}
      </> : <section id="categories" className="store-opening" aria-labelledby="store-opening-title"><div id="products" className="store-opening-card"><span className="eyebrow">فروشگاه نارنج</span><h2 id="store-opening-title">داریم برای شروع آماده می‌شویم</h2><p>هنوز محصولی برای نمایش نداریم. به‌زودی با انتخاب‌های تازه برمی‌گردیم.</p><div><Link className="primary-button" href="/contact">راه‌های ارتباطی <UiIcon name="arrow-left"/></Link><Link className="text-link" href="/about">درباره‌ی نارنج</Link></div></div></section>}
    </main>

    {footer}

    {toast && <div className="toast" role="status">{toast}</div>}
    {checkout && <div className="checkout-backdrop" role="presentation" onClick={e => {if(e.target === e.currentTarget&&!orderSubmissionLock.current) {setCheckout(false);setOrderId("");setTrackingToken("");setError("");}}}><section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" aria-describedby={orderId ? undefined : "checkout-description"} tabIndex={-1} ref={checkoutDialogRef}>
      {orderId ? <><h2 id="checkout-title">{publicDemo ? "سفارش آزمایشی ثبت شد" : "سفارش ثبت شد 🌿"}</h2><p>شماره سفارش شما: <strong>{orderId}</strong></p><p>کد خصوصی پیگیری را نگه دارید: <code dir="ltr">{trackingToken}</code></p><button type="button" className="text-link copy-tracking-button" onClick={copyTrackingToken}>کپی کد پیگیری</button><p>{publicDemo ? "اطلاعات سفارش نمونه فقط در همین تب مرورگر نگه‌داری می‌شود." : "روش پرداخت: هماهنگی و پرداخت دستی پس از ثبت سفارش. ثبت سفارش به معنی پرداخت موفق نیست."}</p><p><Link className="text-link" href="/track">رفتن به صفحهٔ پیگیری سفارش</Link></p><button className="primary-button" onClick={() => {setCheckout(false);setOrderId("");setTrackingToken("");}}>ادامه‌ی خرید</button></> : <><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 id="checkout-title">تکمیل سفارش</h2><p id="checkout-description" className="checkout-description">{publicDemo ? "این سفارش فقط برای نمایش مراحل خرید است." : "اطلاعات تحویل را وارد کنید تا سفارش برای هماهنگی ثبت شود."}</p></div><button className="icon-button" aria-label="بستن" disabled={busy} onClick={() => setCheckout(false)}><UiIcon name="x"/></button></div>{cart.length === 0 ? <div className="empty-state"><p>سبد خریدت هنوز خالی است.</p><button className="primary-button" onClick={() => {setCheckout(false);openCatalog();}}>رفتن به فروشگاه</button></div> : <><div className="checkout-body"><section className="checkout-summary" aria-label="خلاصه سفارش"><h3>سبد خرید</h3>{cart.map(line => {const p=initialProducts.find(x=>x.id===line.id)!;return <div key={p.id} className="checkout-line"><div><strong>{p.name}</strong><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{formatPrice(p.price*line.quantity)} {storeConfig.currency}</div></div><div style={{display:"flex",alignItems:"center",gap:7}}><button type="button" className="icon-button" aria-label={`کم کردن ${p.name}`} disabled={busy} onClick={()=>changeQuantity(p.id,line.quantity-1)}><UiIcon name="minus"/></button><span aria-live="polite">{line.quantity}</span><button type="button" className="icon-button" aria-label={`زیاد کردن ${p.name}`} disabled={busy||line.quantity>=p.stock} onClick={()=>changeQuantity(p.id,line.quantity+1)}><UiIcon name="plus"/></button><button type="button" className="icon-button" aria-label={`حذف ${p.name}`} disabled={busy} onClick={()=>changeQuantity(p.id,0)}>حذف</button></div></div>})}<strong style={{display:"block",marginTop:12}}>جمع کالاها: {formatPrice(total)} {storeConfig.currency}</strong></section><form onSubmit={submitOrder} style={{display:"grid",gap:13}}>{publicDemo ? <p>برای این دمو اطلاعات تماس لازم نیست.</p> : <><label>نام و نام خانوادگی<input name="name" disabled={busy} required minLength={2} maxLength={80} autoComplete="name" style={fieldStyle}/></label><label>شماره همراه<input name="phone" type="tel" disabled={busy} required inputMode="tel" autoComplete="tel" pattern="[0-9۰-۹+\- ]{10,16}" style={fieldStyle}/></label><label>نشانی تحویل<textarea name="address" disabled={busy} required minLength={10} maxLength={500} autoComplete="street-address" style={{...fieldStyle,minHeight:76,resize:"vertical"}}/></label><label>روش پرداخت<select name="payment" disabled={busy} style={fieldStyle}><option value="manual">هماهنگی و پرداخت دستی</option><option value="cod">پرداخت هنگام تحویل (با هماهنگی)</option></select></label></>}{error && <p role="alert" style={{color:"#a0372c"}}>{error}</p>}<button disabled={busy} className="primary-button" style={{justifyContent:"center"}}>{busy ? "در حال ثبت…" : `${publicDemo ? "ثبت سفارش آزمایشی" : "ثبت سفارش"} · ${formatPrice(total)} ${storeConfig.currency}`}</button>{!publicDemo && <small style={{color:"var(--muted)"}}>هزینه و زمان ارسال پس از ثبت سفارش هماهنگ می‌شود.</small>}</form></div></>}</>}
    </section></div>}
  </>;
}
const fieldStyle: React.CSSProperties = { display:"block",width:"100%",marginTop:6,padding:"10px 12px",border:"1px solid var(--line)",borderRadius:2,background:"white",color:"var(--ink)" };
