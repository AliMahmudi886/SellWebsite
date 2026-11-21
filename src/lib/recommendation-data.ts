import { getPool } from "./db";
import type { CoPurchaseSignal } from "./recommendations";

export async function listCoPurchaseSignals(id: string): Promise<CoPurchaseSignal[]> {
  const {rows} = await getPool().query(`SELECT pair.candidate_product_id AS product_id,pair.co_orders,
    COALESCE(source.order_count,0) AS source_orders,COALESCE(candidate.order_count,0) AS candidate_orders,
    GREATEST(1,(SELECT delivered_order_count FROM product_recommendation_stats WHERE id=1)) AS total_orders
    FROM product_copurchase_counts pair
    JOIN products available ON available.id=pair.candidate_product_id AND available.published=TRUE AND available.stock>0
    LEFT JOIN product_order_counts source ON source.product_id=pair.source_product_id
    LEFT JOIN product_order_counts candidate ON candidate.product_id=pair.candidate_product_id
    WHERE pair.source_product_id=$1 AND pair.co_orders>0 ORDER BY pair.co_orders DESC`,[id]);
  return rows.map(row=>({productId:String(row.product_id),coOrders:Number(row.co_orders),sourceOrders:Number(row.source_orders),candidateOrders:Number(row.candidate_orders),totalOrders:Number(row.total_orders)}));
}
