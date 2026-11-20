import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { storeConfig } from "@/lib/store-config";
const vazirmatn=localFont({src:"../../public/fonts/Narenj-Vazirmatn-core.woff2",weight:"100 900",style:"normal",display:"swap",adjustFontFallback:false,variable:"--font-vazirmatn"});
export const metadata: Metadata = { title: { default: `${storeConfig.name} | ${storeConfig.tagline}`, template: `%s | ${storeConfig.name}` }, description: storeConfig.description, metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), openGraph: { title: storeConfig.name, description: storeConfig.description, locale: "fa_IR", type: "website" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fa" dir="rtl"><body className={vazirmatn.variable}>{children}</body></html>; }
