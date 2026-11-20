import { products } from "./products.ts";

export type OrderItemInput = { id: string; quantity: number };
export function calculateOrder(items: OrderItemInput[]) {
  if (items.length < 1 || items.length > 30) return { ok: false as const, reason: "invalid_count" as const };
  const lines = items.map(item => ({ item, product: products.find(product => product.id === item.id) }));
  if (lines.some(({ item, product }) => !product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > (product?.stock ?? 0))) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, total: lines.reduce((sum, { item, product }) => sum + product!.price * item.quantity, 0) };
}
