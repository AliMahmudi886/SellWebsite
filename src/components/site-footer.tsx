import Link from "next/link";
import { storeConfig,supportPhoneHref } from "@/lib/store-config";

export function SiteFooter(){
 return <footer id="contact" className="footer"><div className="shell"><div className="footer-main">
  <div><Link className="brand" href="/#home">نارنج<span className="brand-mark">.</span></Link><p>{storeConfig.description}</p><p>{storeConfig.tagline}</p></div>
  <div><h3>راهنمای خرید</h3><div className="footer-links"><Link href="/track">پیگیری سفارش</Link><Link href="/faq">روش ثبت سفارش</Link><Link href="/shipping">ارسال و تحویل</Link><Link href="/returns">بازگشت و تعویض</Link></div></div>
  <div><h3>نارنج را بشناس</h3><div className="footer-links"><Link href="/about">داستان ما</Link><Link href="/faq">پرسش‌های پرتکرار</Link><Link href="/privacy">حریم خصوصی</Link><Link href="/terms">شرایط استفاده</Link></div></div>
  <div><h3>در ارتباط باشیم</h3>{storeConfig.supportPhone?<><a href={`tel:${supportPhoneHref}`} dir="ltr">{storeConfig.supportPhone}</a>{storeConfig.supportHours&&<p>ساعت پاسخ‌گویی: {storeConfig.supportHours}</p>}</>:<p>برای راه‌های ارتباطی و پیگیری سفارش، صفحه‌ی تماس با ما را ببین.</p>}<Link href="/contact">تماس با ما</Link></div>
 </div><div className="copyright">© ۱۴۰۵ خانه‌ی نارنج. همه‌ی حقوق محفوظ است.</div></div></footer>;
}
