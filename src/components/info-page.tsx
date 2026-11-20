import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export type InfoSection={title:string;content:ReactNode};
export function InfoPage({eyebrow,title,intro,sections,reviewNotice,currentPage}: {eyebrow:string;title:string;intro:string;sections:InfoSection[];reviewNotice?:string;currentPage?:"about"|"contact"}){
  return <>
    <SiteHeader active={currentPage}/>
    <main className="info-page shell"><article className="info-page-card"><header className="info-page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header>{reviewNotice&&<aside className="info-review-notice">{reviewNotice}</aside>}<div className="info-page-sections">{sections.map((section,index)=><section className="info-page-section" key={section.title}><span className="info-section-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span><div><h2>{section.title}</h2><div className="info-section-content">{section.content}</div></div></section>)}</div><Link className="info-back-link" href="/#products">ادامه‌ی خرید <span aria-hidden="true">←</span></Link></article></main>
    <SiteFooter/>
  </>;
}
