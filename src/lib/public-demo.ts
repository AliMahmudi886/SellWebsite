import type { Product } from "./products";

export const publicDemo = process.env.NEXT_PUBLIC_NARENJ_DEMO === "true";
const key = "narenj-demo-orders-v1";

type DemoOrder = {
  id: string;
  token: string;
  status: string;
  created_at: string;
  items: { name: string; quantity: number; unitPrice: number }[];
};

function orders(): DemoOrder[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function createDemoOrder(cart: { id: string; quantity: number }[], products: Product[]) {
  const order: DemoOrder = {
    id: "DEMO-" + crypto.randomUUID().slice(0,8).toUpperCase(),
    token: crypto.randomUUID() + crypto.randomUUID().slice(0,8),
    status: "awaiting_contact",
    created_at: new Date().toISOString(),
    items: cart.flatMap(line => {
      const product = products.find(item => item.id === line.id);
      return product ? [{ name:product.name, quantity:line.quantity, unitPrice:product.price }] : [];
    }),
  };
  sessionStorage.setItem(key,JSON.stringify([order,...orders()].slice(0,20)));
  return order;
}

export function findDemoOrder(token: string) {
  return orders().find(order => order.token === token) ?? null;
}
