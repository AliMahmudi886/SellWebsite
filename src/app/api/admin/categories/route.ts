import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin, validOrigin } from "@/lib/auth";
import { getPool, inTransaction } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin-audit";

const nameSchema = z.string().trim().min(2).max(80);

export async function GET() {
  if (!await getAdmin("catalog:read")) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  try {
    const { rows } = await getPool().query("SELECT name,sort_order FROM categories ORDER BY sort_order,name");
    return NextResponse.json({ categories: rows.map(row => ({ name: String(row.name), sortOrder: Number(row.sort_order) })) });
  } catch {
    return NextResponse.json({ error: "خواندن دسته‌بندی‌ها ممکن نشد." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  if (!validOrigin(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  const parsed = z.object({ name: nameSchema, sortOrder: z.number().int().min(0).max(100_000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "نام یا ترتیب دسته‌بندی معتبر نیست." }, { status: 400 });
  try { return await inTransaction(async client => {
    const { rows } = await client.query("INSERT INTO categories(name,sort_order) VALUES($1,$2) RETURNING name,sort_order", [parsed.data.name, parsed.data.sortOrder ?? 0]);
    await recordAdminAudit(client,actor,"category.created","category",String(rows[0].name),{sortOrder:Number(rows[0].sort_order)});
    return NextResponse.json({ category: { name: String(rows[0].name), sortOrder: Number(rows[0].sort_order) } }, { status: 201 });
  }); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return NextResponse.json({ error: "این دسته‌بندی از قبل وجود دارد." }, { status: 409 });
    return NextResponse.json({ error: "ذخیره‌ی دسته‌بندی ممکن نشد." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  if (!validOrigin(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  const parsed = z.object({ oldName: nameSchema, name: nameSchema, sortOrder: z.number().int().min(0).max(100_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات دسته‌بندی معتبر نیست." }, { status: 400 });
  try { return await inTransaction(async client => {
    const { rows } = await client.query("UPDATE categories SET name=$2,sort_order=$3,updated_at=NOW() WHERE name=$1 RETURNING name,sort_order", [parsed.data.oldName, parsed.data.name, parsed.data.sortOrder]);
    if (!rows[0]) return NextResponse.json({ error: "دسته‌بندی پیدا نشد." }, { status: 404 });
    await recordAdminAudit(client,actor,"category.updated","category",String(rows[0].name),{oldName:parsed.data.oldName,sortOrder:Number(rows[0].sort_order)});
    return NextResponse.json({ category: { name: String(rows[0].name), sortOrder: Number(rows[0].sort_order) } });
  }); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return NextResponse.json({ error: "دسته‌بندی با این نام وجود دارد." }, { status: 409 });
    return NextResponse.json({ error: "ویرایش دسته‌بندی ممکن نشد." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 401 });
  if (!validOrigin(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  const parsed = z.object({ name: nameSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "نام دسته‌بندی معتبر نیست." }, { status: 400 });
  try { return await inTransaction(async client => {
    const { rows } = await client.query("DELETE FROM categories WHERE name=$1 RETURNING name", [parsed.data.name]);
    if (!rows[0]) return NextResponse.json({ error: "دسته‌بندی پیدا نشد." }, { status: 404 });
    await recordAdminAudit(client,actor,"category.deleted","category",String(rows[0].name));
    return NextResponse.json({ ok: true });
  }); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") return NextResponse.json({ error: "این دسته‌بندی به محصول متصل است؛ ابتدا محصولات آن را به دسته‌ی دیگری منتقل کنید." }, { status: 409 });
    return NextResponse.json({ error: "حذف دسته‌بندی ممکن نشد." }, { status: 500 });
  }
}
