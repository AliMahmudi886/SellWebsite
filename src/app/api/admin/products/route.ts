import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin, validOrigin } from "@/lib/auth";
import { inTransaction, listProducts, productFromRow } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin-audit";

const imageSchema = z.string().max(1000).refine(value => { if(/^\/images\/[A-Za-z0-9._-]+\.(webp|png|jpe?g)$/i.test(value)||/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(value))return true; try { const url=new URL(value); return url.protocol==="https:"&&url.hostname==="images.unsplash.com"; } catch { return false; } });
const productSchema = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(80), price: z.number().int().positive().max(10_000_000_000), oldPrice: z.number().int().positive().max(10_000_000_000).nullable().optional(), image: imageSchema, tone: z.string().regex(/^#[0-9a-fA-F]{6}$/), badge: z.string().trim().max(40).nullable().optional(), description: z.string().trim().min(5).max(1000), stock: z.number().int().min(0).max(1_000_000), featured: z.boolean(), published: z.boolean().default(true) }).superRefine((product, context) => { if (product.oldPrice != null && product.oldPrice <= product.price) context.addIssue({ code: "custom", path: ["oldPrice"], message: "قیمت قبلی باید از قیمت فروش بیشتر باشد." }); });
function invalidProductResponse(issues: z.ZodIssue[]) {
  const error = issues.find(issue => issue.path[0] === "oldPrice")?.message ?? "اطلاعات محصول معتبر نیست.";
  return NextResponse.json({ error }, { status: 400 });
}
export async function GET() {
  if (!await getAdmin("catalog:read")) return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  try { return NextResponse.json({products:await listProducts(true)}); } catch { return NextResponse.json({error:"خواندن محصولات ممکن نشد."},{status:503}); }
}
export async function POST(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  if(!validOrigin(request))return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  let data: z.infer<typeof productSchema>;
  try { const parsed=productSchema.safeParse(await request.json()); if(!parsed.success)return invalidProductResponse(parsed.error.issues); data=parsed.data; } catch { return NextResponse.json({error:"درخواست معتبر نیست."},{status:400}); }
  try { return await inTransaction(async client => { const { rows }=await client.query(`INSERT INTO products(id,name,category,price,old_price,image,tone,badge,description,stock,featured,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[randomUUID(),data.name,data.category,data.price,data.oldPrice??null,data.image,data.tone,data.badge??null,data.description,data.stock,data.featured,data.published]); await recordAdminAudit(client,actor,"product.created","product",String(rows[0].id),{name:data.name,category:data.category});return NextResponse.json({product:productFromRow(rows[0])},{status:201}); }); }
  catch (error) { if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23503")return NextResponse.json({error:"دسته‌بندی انتخاب‌شده وجود ندارد."},{status:400}); return NextResponse.json({error:"ذخیره‌ی محصول ممکن نشد."},{status:500}); }
}
export async function PUT(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  if(!validOrigin(request))return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  let body: {id:string}&z.infer<typeof productSchema>;
  try { const parsed=z.object({id:z.string().min(1)}).and(productSchema).safeParse(await request.json()); if(!parsed.success)return invalidProductResponse(parsed.error.issues); body=parsed.data; } catch { return NextResponse.json({error:"درخواست معتبر نیست."},{status:400}); }
  try { return await inTransaction(async client => { const {rows}=await client.query(`UPDATE products SET name=$2,category=$3,price=$4,old_price=$5,image=$6,tone=$7,badge=$8,description=$9,stock=$10,featured=$11,published=$12,updated_at=NOW() WHERE id=$1 RETURNING *`,[body.id,body.name,body.category,body.price,body.oldPrice??null,body.image,body.tone,body.badge??null,body.description,body.stock,body.featured,body.published]); if(!rows[0])return NextResponse.json({error:"محصول پیدا نشد."},{status:404}); await recordAdminAudit(client,actor,"product.updated","product",body.id,{name:body.name,category:body.category,stock:body.stock,published:body.published});return NextResponse.json({product:productFromRow(rows[0])}); }); }
  catch (error) { if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23503")return NextResponse.json({error:"دسته‌بندی انتخاب‌شده وجود ندارد."},{status:400}); return NextResponse.json({error:"ویرایش محصول ممکن نشد."},{status:500}); }
}
export async function DELETE(request: Request) {
  const actor=await getAdmin("catalog:write");if (!actor) return NextResponse.json({error:"دسترسی مجاز نیست."},{status:401});
  if (!validOrigin(request)) return NextResponse.json({error:"درخواست معتبر نیست."},{status:403});
  let id=""; try { id=z.object({id:z.string().min(1)}).parse(await request.json()).id; } catch { return NextResponse.json({error:"شناسه‌ی محصول معتبر نیست."},{status:400}); }
  try { return await inTransaction(async client => { const result=await client.query("UPDATE products SET published=FALSE,updated_at=NOW() WHERE id=$1 RETURNING name",[id]); if(!result.rowCount)return NextResponse.json({error:"محصول پیدا نشد."},{status:404}); await recordAdminAudit(client,actor,"product.archived","product",id,{name:result.rows[0].name});return NextResponse.json({ok:true}); }); }
  catch { return NextResponse.json({error:"پنهان‌کردن محصول ممکن نشد."},{status:500}); }
}
