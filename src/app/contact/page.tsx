import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info-page";
import { storeConfig,supportPhoneHref } from "@/lib/store-config";

export const metadata:Metadata={title:"تماس با نارنج",description:"راه‌های ارتباط با فروشگاه نارنج و پیگیری سفارش."};

function safeInstagramUrl(value:string){try{const url=new URL(value);return url.protocol==="https:"&&["instagram.com","www.instagram.com"].includes(url.hostname)?url.href:null;}catch{return null;}}
export default function ContactPage(){
 const phone=storeConfig.supportPhone,instagramUrl=safeInstagramUrl(storeConfig.instagramUrl);
 const sections=[
  ...(phone?[{title:"تماس تلفنی",content:<><p>برای پرسش درباره‌ی محصول یا هماهنگی سفارش با ما تماس بگیر.</p><a className="info-contact-action" href={`tel:${supportPhoneHref}`} dir="ltr">{phone}</a>{storeConfig.supportHours&&<p className="info-contact-note">ساعت پاسخ‌گویی: {storeConfig.supportHours}</p>}</>}]:[]),
  ...(instagramUrl?[{title:"اینستاگرام",content:<><p>برای دیدن تازه‌های نارنج و پیام‌دادن به ما به صفحه‌ی رسمی فروشگاه سر بزن.</p><a className="info-contact-action" href={instagramUrl} target="_blank" rel="noopener noreferrer">مشاهده‌ی صفحه‌ی نارنج <span aria-hidden="true">↗</span></a></>}]:[]),
  {title:"پیگیری سفارش",content:<><p>برای دیدن وضعیت سفارش، کد خصوصی پیگیری را وارد کن.</p><Link className="info-contact-action" href="/track">رفتن به صفحه‌ی پیگیری <span aria-hidden="true">←</span></Link></>},
 ];
 return <InfoPage currentPage="contact" eyebrow="در کنارت هستیم" title="با ما در ارتباط باش" intro="برای پرسش درباره‌ی محصول، هماهنگی سفارش یا پیگیری آن، راه مناسب را انتخاب کن." reviewNotice={!phone&&!instagramUrl?"راه تماس تلفنی و شبکه‌ی اجتماعی هنوز برای این فروشگاه تنظیم نشده است. تا آن زمان می‌توانی سفارش خود را در صفحه‌ی پیگیری بررسی کنی.":undefined} sections={sections}/>;
}
