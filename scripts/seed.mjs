import pg from "pg";
import { products } from "../src/lib/products.ts";

if (process.env.NODE_ENV === "production") throw new Error("Seed در production مجاز نیست.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL تنظیم نشده است.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const p of products) await pool.query(`INSERT INTO products (id,name,category,price,old_price,image,tone,badge,description,stock,featured,published)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
    ON CONFLICT (id) DO NOTHING`, [p.id,p.name,p.category,p.price,p.oldPrice ?? null,p.image,p.tone,p.badge ?? null,p.description,p.stock,p.featured]);
  console.log(`${products.length} محصول نمونه بررسی شد؛ رکوردهای موجود بازنویسی نشدند.`);
} finally { await pool.end(); }
