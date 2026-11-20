import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3000';
const stage = process.argv[2] === 'before' ? 'before' : 'after';
const folder = new URL(`../docs/visual/screenshots/${stage}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const failures = [];
const routes = { home: '/', product: '/product/woven-basket', track: '/track', admin: '/admin', about: '/about', contact: '/contact', faq: '/faq', shipping: '/shipping', returns: '/returns', terms: '/terms', privacy: '/privacy' };
try {
  for (const [name, route] of Object.entries(routes)) {
    for (const width of (stage === 'before' ? [390, 1440] : [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920])) {
      await page.setViewportSize({ width, height: 920 });
      const response = await page.goto(base + route);
      if (response?.status() !== 200) {
        failures.push(`${route} returned ${response?.status()}`);
        break;
      }
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${route} overflows at ${width}px`);
      if ([390, 1440].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, folder)), fullPage: true, animations: 'disabled' });
    }
  }
  if (stage === 'after') {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(base);
      const search = page.getByLabel('جست‌وجو در محصولات', { exact: true }).and(page.locator('input'));
      await page.getByRole('button', { name: 'جست‌وجو در محصولات' }).click();
      await search.fill('zzzz-no-match');
      await page.getByRole('button', { name: 'پاک کردن فیلترها' }).click();
      assert.equal(await search.inputValue(), '');
      const productLink = page.locator('.product-title-link').first();
      await productLink.click();
      const zoom = page.getByRole('button', { name: /بزرگ‌نمایی تصویر/ });
      await zoom.focus();
      await page.keyboard.press('Enter');
      assert.equal(await zoom.getAttribute('aria-pressed'), 'true');
      const primaryPurchase = page.getByRole('button', { name: 'افزودن به سبد خرید', exact: true });
      const stickyPurchase = page.locator('.mobile-purchase-bar');
      await stickyPurchase.waitFor({ state: 'hidden' });
      if (width === 390) {
        await primaryPurchase.scrollIntoViewIfNeeded();
        await stickyPurchase.waitFor({ state: 'hidden' });
        await page.locator('.related-products').evaluate(element => element.scrollIntoView());
        await stickyPurchase.waitFor({ state: 'visible' });
        await primaryPurchase.scrollIntoViewIfNeeded();
        await stickyPurchase.waitFor({ state: 'hidden' });
      }
      await primaryPurchase.click();
      await page.getByRole('link', { name: /رفتن به سبد خرید/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.screenshot({ path: fileURLToPath(new URL(`checkout-${width}.png`, folder)), animations: 'disabled' });
      let requestCount = 0;
      await page.route('**/api/orders', async route => {
        requestCount++;
        await route.fulfill({
          status: requestCount === 1 ? 503 : 201,
          json: requestCount === 1 ? { error: 'خطای آزمایشی ثبت سفارش' } : { orderId: 'visual-test', trackingToken: 'example-token' }
        });
      });
      await dialog.getByLabel('نام و نام خانوادگی').fill('کاربر آزمایشی');
      await dialog.getByLabel('شماره همراه').fill('09123456789');
      await dialog.getByLabel('نشانی تحویل').fill('تهران، نشانی آزمایشی برای بررسی فرم');
      const submit = dialog.getByRole('button', { name: /^ثبت سفارش/ });
      await submit.click();
      await dialog.getByRole('alert').waitFor();
      await submit.click();
      await dialog.getByRole('heading', { name: /سفارش ثبت شد/ }).waitFor();
      await page.unroute('**/api/orders');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.locator('.quick-add:not([disabled])').first().click();
      await page.getByRole('button', { name: /^سبد خرید/ }).click();
      await dialog.getByRole('button', { name: /^حذف/ }).first().click();
      await dialog.getByText('سبد خریدت هنوز خالی است.').waitFor();
      await page.keyboard.press('Escape');
    }
  }
} finally {
  await browser.close();
}
console.log(failures.length ? failures.join('\n') : 'All route and viewport checks passed.');
if (failures.length) process.exitCode = 1;
