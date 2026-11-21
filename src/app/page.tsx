import { publicDemo } from "@/lib/public-demo";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontBuyingGuide, StorefrontHero } from "@/components/storefront-editorial";
import { Storefront } from "@/components/storefront";
import { hasDatabase, listProducts } from "@/lib/db";
import { products as demoProducts } from "@/lib/products";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const databaseAvailable = (!publicDemo && hasDatabase());
  let products = demoProducts;
  if (databaseAvailable) {
    try {
      products = await listProducts();
    } catch {
      // Keep the storefront preview available while the local database is offline.
    }
  }
  return <Storefront
    initialProducts={products}
    hero={<StorefrontHero shopReady={products.length > 0} />}
    buyingGuide={products.length > 0 ? <StorefrontBuyingGuide /> : null}
    footer={<SiteFooter />}
  />;
}
