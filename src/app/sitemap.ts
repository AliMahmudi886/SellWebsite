import type { MetadataRoute } from "next";
import {hasDatabase,listProducts} from "@/lib/db";
import {products as demoProducts} from "@/lib/products";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { const origin=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000",staticPaths=["","/about","/contact","/faq","/shipping","/returns","/terms","/privacy"],products=hasDatabase()?await listProducts():demoProducts;return [...staticPaths.map(path=>({url:`${origin}${path}`,lastModified:new Date()})),...products.map(product=>({url:`${origin}/product/${encodeURIComponent(product.id)}`,lastModified:new Date()}))]; }
