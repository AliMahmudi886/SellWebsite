"use client";
import { findDemoOrder, getLatestDemoOrder, listDemoOrders, publicDemo } from "@/lib/public-demo";
import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { storeConfig } from "@/lib/store-config";

type TrackedOrder = { id:string; status:string; created_at:string; items:{name:string;quantity:number;unitPrice:number}[] };
const statusText:Record<string,string>={awaiting_contact:"در انتظار هماهنگی",confirmed:"تأیید شده",preparing:"در حال آماده‌سازی",sent:"ارسال شده",delivered:"تحویل شده",cancelled:"لغو شده"};
export function OrderTracker(){
  const [token,setToken]=useState("");const [order,setOrder]=useState<TrackedOrder|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [history, setHistory] = useState<ReturnType<typeof listDemoOrders> | null>(null);
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");setOrder(null);try{if(publicDemo){const sample=findDemoOrder(token.trim());if(!sample)throw new Error("سفارش آزمایشی در این تب پیدا نشد.");setOrder(sample);return;}const response=await fetch("/api/orders/track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error||"پیگیری سفارش انجام نشد.");setOrder(data.order);}catch(reason){setError(reason instanceof Error?reason.message:"ارتباط با سرور برقرار نشد.");}finally{setBusy(false);}}
  function showLatestDemoOrder() {
    selectDemoOrder(getLatestDemoOrder());
  }

  function selectDemoOrder(sample: ReturnType<typeof getLatestDemoOrder>) {
    setOrder(sample);
    setToken(sample?.token ?? "");
    setError(sample ? "" : "در این تب هنوز سفارش آزمایشی ثبت نشده است.");
  }
  return <main className="track-page shell"><section className="track-page-card"><span className="eyebrow">همیشه در جریان بمان</span><h1>پیگیری سفارش</h1><p className="track-intro">کد خصوصی پیگیری که بعد از ثبت سفارش دریافت کردی وارد کن. این کد را فقط با افرادی که به سفارش دسترسی دارند به‌اشتراک بگذار.</p><form onSubmit={submit} className="track-form"><label htmlFor="tracking-token">کد پیگیری</label><input id="tracking-token" autoComplete="off" dir="ltr" required minLength={40} maxLength={60} pattern="[A-Za-z0-9_-]{40,60}" value={token} onChange={event=>setToken(event.target.value)}/><button className="primary-button" disabled={busy} style={{justifyContent:"center"}}>{busy?"در حال بررسی…":"نمایش وضعیت سفارش"}</button></form>{publicDemo && <button type="button" className="text-link shopping-link-button" onClick={showLatestDemoOrder}>نمایش آخرین سفارش آزمایشی این تب</button>}{publicDemo && <details className="track-history" onToggle={event => {
    if (event.currentTarget.open) setHistory(listDemoOrders());
  }}>
    <summary className="text-link">تاریخچهٔ سفارش‌های آزمایشی این تب</summary>
    {history?.length === 0 && <p>هنوز سفارش آزمایشی ثبت نشده است.</p>}
    {!!history?.length && <ul>
      {history.map(sample => <li key={sample.token}>
        <button type="button" className="text-link shopping-link-button" onClick={() => selectDemoOrder(sample)} aria-pressed={order?.id === sample.id}>
          سفارش <bdi>{sample.id}</bdi> · {formatPrice(sample.items.reduce((total, item) => total + item.quantity, 0))} کالا
        </button>
      </li>)}
    </ul>}
  </details>}{error&&<p role="alert" className="track-error">{error}</p>}{order&&<article className="track-result" aria-live="polite"><strong>سفارش {order.id}</strong><p>وضعیت: <strong>{statusText[order.status]||order.status}</strong></p><p>تاریخ ثبت: {new Date(order.created_at).toLocaleDateString("fa-IR")}</p>{order.items.map((item,index)=><div key={`${item.name}-${index}`} className="track-result-item"><span>{item.name} × {item.quantity}</span><span>{formatPrice(Number(item.unitPrice)*item.quantity)} {storeConfig.currency}</span></div>)}</article>}<Link className="text-link" href="/#products">ادامه‌ی خرید　←</Link></section></main>;
}
