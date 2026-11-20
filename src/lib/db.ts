import { Pool, type PoolClient } from "pg";
import type { Product } from "@/lib/products";

export type Category = { name: string; sortOrder: number };

declare global { var shopPool: Pool | undefined; }
export function hasDatabase() { return Boolean(process.env.DATABASE_URL); }
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL تنظیم نشده است.");
  globalThis.shopPool ??= new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined, max: 10 });
  return globalThis.shopPool;
}
export async function getClient(): Promise<PoolClient> { return getPool().connect(); }
export function productFromRow(row: Record<string, unknown>): Product {
  return { id: String(row.id), name: String(row.name), category: String(row.category), price: Number(row.price), oldPrice: row.old_price == null ? undefined : Number(row.old_price), image: String(row.image), tone: String(row.tone), badge: row.badge == null ? undefined : String(row.badge), description: String(row.description), stock: Number(row.stock), featured: Boolean(row.featured), published: Boolean(row.published) };
}
export async function listProducts(includeUnpublished = false) {
  const query = includeUnpublished ? "SELECT * FROM products ORDER BY created_at DESC" : "SELECT * FROM products WHERE published = TRUE ORDER BY featured DESC, created_at DESC";
  const { rows } = await getPool().query(query);
  return rows.map(productFromRow);
}
export async function listCategories() {
  const { rows } = await getPool().query("SELECT name,sort_order FROM categories ORDER BY sort_order,name");
  return rows.map(row => ({ name: String(row.name), sortOrder: Number(row.sort_order) })) as Category[];
}

export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
