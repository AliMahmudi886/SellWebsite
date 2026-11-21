import { publicDemo } from "@/lib/public-demo";
import {notFound} from "next/navigation";
import {ProductDetail} from "@/components/product-detail";
import {hasDatabase,listProducts} from "@/lib/db";
import {products as demoProducts} from "@/lib/products";
import {rankRelatedProducts} from "@/lib/recommendations";
import { listCoPurchaseSignals } from "@/lib/recommendation-data";
import type {Metadata} from "next";

export const dynamic="force-dynamic";

export function generateStaticParams() {
 return publicDemo ? demoProducts.filter(product => product.published !== false).map(product => ({ id: product.id })) : [];
}

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params,products=(!publicDemo && hasDatabase())?await listProducts(true):demoProducts,product=products.find(item=>item.id===id&&item.published!==false);
 if(!product)return {title:"محصول پیدا نشد",robots:{index:false,follow:false}};
 return {title:product.name,description:product.description,alternates:{canonical:`/product/${encodeURIComponent(product.id)}`},openGraph:{title:product.name,description:product.description,type:"website",images:[product.image]}};
}

export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const products=(!publicDemo && hasDatabase())?await listProducts(true):demoProducts;
 const product=products.find(item=>item.id===id&&item.published!==false);
 if(!product)notFound();
 const signals = !publicDemo && hasDatabase() ? await listCoPurchaseSignals(id) : [];
 const recommendations=rankRelatedProducts(product,products,signals,4);
 return <ProductDetail product={product} recommendations={recommendations}/>;
}
