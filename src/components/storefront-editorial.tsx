import Image from "next/image";
import Link from "next/link";
import { UiIcon } from "@/components/ui-icon";

export function StorefrontHero({ shopReady }: { shopReady: boolean }) {
  return (
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><span className="eyebrow">{shopReady ? "انتخاب‌هایی برای خانه‌ی شما" : "به‌زودی در نارنج"}</span><h1 id="hero-title">{shopReady ? "خانه، با جزئیات جان می‌گیرد." : "خانه‌ی نارنج را به‌زودی ببین."}</h1><p>{shopReady ? "از اشیای دست‌ساز تا جزئیات روزمره؛ هر کدام با دقت انتخاب شده تا حس خوب زندگی در خانه را بیشتر کند." : "فروشگاه آنلاین خانه‌ی نارنج در حال آماده‌سازی است. برای آشنایی با ما، داستان نارنج را بخوان."}</p>{shopReady ? <a className="primary-button" href="#products" data-open-catalog>دیدن محصولات <UiIcon name="arrow-left"/></a> : <Link className="primary-button" href="/about">داستان نارنج <UiIcon name="arrow-left"/></Link>}</div>
        {shopReady ? <div className="hero-image"><link rel="preload" as="image" type="image/avif" href="/assets/narenj-hero-mobile.f7e5ba36a044.avif" media="(max-width: 560px)" fetchPriority="high"/>
          <picture>
            <source media="(max-width: 560px)" srcSet="/assets/narenj-hero-mobile.f7e5ba36a044.avif" type="image/avif"/>
            <Image src="/assets/narenj-hero.webp" alt="گلدان سفالی، سبد حصیری و پارچه در نور پنجره" fill loading="eager" sizes="(max-width: 560px) 92vw, (max-width: 1512px) 55vw, 831px"/>
          </picture></div> : <div className="hero-image hero-image-empty" aria-hidden="true"><span>نارنج<span className="brand-mark">.</span></span></div>}
      </section>
  );
}

export function StorefrontBuyingGuide() {
  return (
    <>
      <section className="editorial-story" aria-labelledby="story-title">
        <div><h2 id="story-title">چرا خانه‌ی نارنج؟</h2><p>از سبد حصیری تا فنجان چای، به‌دنبال چیزهایی هستیم که در زندگی هر روز جا پیدا می‌کنند.</p></div>
        <Link className="text-link" href="/about">داستان ما <UiIcon name="arrow-left"/></Link>
      </section>
      <section className="benefits" aria-label="مزیت‌های خرید از نارنج"><div className="benefit"><div className="benefit-icon"><UiIcon name="sparkles"/></div><div><strong>انتخاب باکیفیت</strong><span>محصولاتی که خودمان دوست داریم</span></div></div><div className="benefit"><div className="benefit-icon"><UiIcon name="package"/></div><div><strong>بسته‌بندی با حوصله</strong><span>آماده‌ی هدیه‌دادن به خودت یا عزیزانت</span></div></div><div className="benefit"><div className="benefit-icon"><UiIcon name="heart"/></div><div><strong>همراهی واقعی</strong><span>برای پرسش‌هایت در دسترسیم</span></div></div></section>
      <section className="home-guide" aria-labelledby="home-guide-title"><div className="home-guide-heading"><div><span className="eyebrow">راهنمای خرید</span><h2 id="home-guide-title">قبل از سفارش، جواب سؤال‌هایت را پیدا کن</h2><p>اطلاعات سفارش، ارسال و بازگشت کالا را یک‌جا بخوان و با آگاهی انتخاب کن.</p></div><Link className="home-guide-all" href="/faq">همه‌ی پرسش‌ها <UiIcon name="arrow-left"/></Link></div><div className="home-guide-grid"><Link className="home-guide-card" href="/faq"><span className="home-guide-icon"><UiIcon name="sparkles"/></span><span className="home-guide-copy"><strong>روش ثبت سفارش</strong><small>مراحل خرید و روش پرداخت</small></span><UiIcon name="arrow-left"/></Link><Link className="home-guide-card" href="/shipping"><span className="home-guide-icon"><UiIcon name="truck"/></span><span className="home-guide-copy"><strong>ارسال و تحویل</strong><small>هزینه و زمان را پیش از خرید هماهنگ کن</small></span><UiIcon name="arrow-left"/></Link><Link className="home-guide-card" href="/returns"><span className="home-guide-icon"><UiIcon name="package"/></span><span className="home-guide-copy"><strong>بازگشت یا تعویض</strong><small>شرایط را پیش از بازگشت بخوان</small></span><UiIcon name="arrow-left"/></Link></div></section>
    </>
  );
}
