import {notFound} from "next/navigation";
import {ProductDetail} from "@/components/product-detail";
import {hasDatabase,getPool,listProducts} from "@/lib/db";
import {products as demoProducts,type Product} from "@/lib/products";
import {rankRelatedProducts,type CoPurchaseSignal} from "@/lib/recommendations";
import type {Metadata} from "next";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params,products=hasDatabase()?await listProducts(true):demoProducts,product=products.find(item=>item.id===id&&item.published!==false);
 if(!product)return {title:"محصول پیدا نشد",robots:{index:false,follow:false}};
 return {title:product.name,description:product.description,alternates:{canonical:`/product/${encodeURIComponent(product.id)}`},openGraph:{title:product.name,description:product.description,type:"website",images:[product.image]}};
}

export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const products=hasDatabase()?await listProducts(true):demoProducts;
 const product=products.find(item=>item.id===id&&item.published!==false);
 if(!product)notFound();
 let signals:CoPurchaseSignal[]=[];
 if(hasDatabase()){
  const {rows}=await getPool().query(`SELECT pair.candidate_product_id AS product_id,pair.co_orders,
    COALESCE(source.order_count,0) AS source_orders,COALESCE(candidate.order_count,0) AS candidate_orders,
    GREATEST(1,(SELECT delivered_order_count FROM product_recommendation_stats WHERE id=1)) AS total_orders
    FROM product_copurchase_counts pair
    JOIN products available ON available.id=pair.candidate_product_id AND available.published=TRUE AND available.stock>0
    LEFT JOIN product_order_counts source ON source.product_id=pair.source_product_id
    LEFT JOIN product_order_counts candidate ON candidate.product_id=pair.candidate_product_id
    WHERE pair.source_product_id=$1 AND pair.co_orders>0 ORDER BY pair.co_orders DESC`,[id]);
  signals=rows.map(row=>({productId:String(row.product_id),coOrders:Number(row.co_orders),sourceOrders:Number(row.source_orders),candidateOrders:Number(row.candidate_orders),totalOrders:Number(row.total_orders)}));
 }
 const recommendations=rankRelatedProducts(product,products as Product[],signals,4);
 return <ProductDetail product={product} recommendations={recommendations}/>;
}
