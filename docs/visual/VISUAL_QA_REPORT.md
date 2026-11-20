# Visual QA report

Playwright ran against the production build using Microsoft Edge. Eleven public routes passed HTTP and horizontal-overflow checks at 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920px. Baseline captures are in screenshots/before and release captures are in screenshots/after. Desktop and mobile home, mobile product and mobile checkout captures were inspected during implementation.

The 390px and 1440px interaction checks cover search with no matches, resetting filters, keyboard activation of product zoom, cross-page cart access, checkout form validation, error and retry, the confirmation view, Escape dismissal and cart removal. Checkout error and success use intercepted responses. The tests do not create a real order. The admin route check covers the sign-in state. Authenticated product and order management and full WCAG 2.2 AA conformance remain unverified. No comparable production LCP, INP and CLS measurements were collected.

Run the workflow from the project root with Playwright available. Use VISUAL_BASE_URL for an alternate server, and PLAYWRIGHT_MODULE when Playwright is available outside the project. Use node scripts/visual-qa.mjs after for the full suite. Screenshots are written into screenshots/after. Use the before argument for baseline capture on a baseline checkout.

## Follow-up verification

- Fixed the brand link accessible name, removed the image role surrounding catalog quick-add buttons, and moved focus to the checkout dialog when its confirmation replaces the form. After animations settled, axe-core reported zero violations across the 11 route samples and the open checkout at 390px under its available tagged WCAG A/AA rules. Manual assistive-technology verification and full WCAG 2.2 AA conformance remain open.
- Exercised the signed-in admin order list and product edit form with intercepted read-only fixture responses at 320, 390 and 1440px. Neither view overflowed. Captures are under screenshots/after/admin-orders-* and screenshots/after/admin-product-edit-*. Real administrative authorization and writes remain unverified in this UI pass.
- Lighthouse 12.8.2, local production build, mobile simulated throttling. The final home sample scored 92, with LCP 3.31 s, CLS 0 and TBT 23 ms. A same-version run just before the hero priority adjustment scored 93, with LCP 3.23 s and CLS 0. The hero request moved from Low to High priority, but the runs do not demonstrate an LCP improvement and the final sample misses the 2.5 s target. See lighthouse-home-mobile.json. INP was not measured. The historical audit uses a different Lighthouse version and is not a comparable baseline.

## Mobile LCP optimization

Lighthouse 12.8.2, local production build, mobile form factor, Microsoft Edge headless:

| Throttling method | LCP | CLS | Performance |
| --- | ---: | ---: | ---: |
| Simulated, preceding build | 3.31 s | 0 | 92 |
| Simulated, optimized build | 3.02 s | 0 | 94 |
| DevTools applied throttling, optimized build | 1.75 s | 0.018 | 98 |

The optimized build preloads a 768px, 20,840-byte AVIF below 561px and serves the existing responsive WebP fallback. The previous mobile LCP image was 34,952 bytes. Both new reports show only the AVIF hero request for the tested viewport, with High priority. Catalog demo tiles are loaded as separate responsive images so the 173,208-byte sprite is no longer requested by the home route in either run. The same-method simulated LCP decreased by about 0.29 s and remains above the 2.5 s target. The DevTools result is a separate lab measurement; it is neither a same-method baseline comparison nor field data.

JSON evidence: lighthouse-home-mobile.json (preceding build), lighthouse-home-mobile-simulate.json (optimized), and lighthouse-home-mobile-devtools.json (optimized).

### Additional same-method experiments

Lighthouse 12.8.2 mobile simulated runs on the local production build measured 3.017 s LCP with Next.js experimental CSS inlining and 3.091 s with a 640px AVIF embedded in the HTML instead of a separately preloaded image. CLS was 0 in both runs. The corresponding reports are lighthouse-experiment-inline-css.json and lighthouse-experiment-inline-hero.json. Both changes were reverted. The retained configuration uses cacheable stylesheets and the separately preloaded AVIF. The 2.5 s simulated target was not reached.

### Repeat visits and HTTP preload experiment

A homepage HTTP Link preload advanced the simulated image request start to 649 ms, but LCP regressed to 3.171 s. It was removed. The mobile hero now uses a SHA-256 fingerprint in its pathname and a one-year immutable cache policy. The homepage document retains private no-store caching, including its live catalog. An Edge Resource Timing check saw 21,140 bytes transferred for the first mobile navigation and zero for a second navigation in the same browser context. A 1440px visit did not request the mobile image. When replacing the hero derivative, generate a new fingerprint and update its URLs and exact cache rule together.

The fresh Lighthouse 12.8.2 mobile simulated run measured 3.015 s LCP, CLS 0 and 94 performance. The 2.5 s cold-load target remains open. See lighthouse-experiment-http-preload.json and lighthouse-home-mobile-simulate.json.

### Final cold mobile target verification

Three fresh-browser Lighthouse 12.8.2 runs used the default simulated mobile throttling in headless Edge against the same local production build. The three LCP values were 2.041 s, 2.408 s and 2.402 s. Median LCP was 2.402 s, about 20% faster than the preceding 3.015 s baseline. All three samples met the 2.5 s target. CLS was 0.0601 in each run (under 0.1), with the font swap responsible for the remaining shift. Performance scores were 98, 97 and 97. These are local lab results.

Production builds use Webpack. The homepage renders editorial content on the server and keeps catalog and cart controls interactive. Initial mobile layout defers work on below-fold product cards and buying guides. The critical three icons are served in the stylesheet. Homepage navigation avoids speculative requests for the about and contact routes. The responsive mobile hero is now 12,206 bytes and the first-load font is 61,864 bytes. The extended original font is selected by Unicode range for characters absent from the core subset; none of the three runs downloaded it. Pricing and stock continue to be read through the existing dynamic route.

Reports: lighthouse-home-mobile-target-run-1.json, lighthouse-home-mobile-target-run-2.json, lighthouse-home-mobile-simulate.json (third run and median), and lighthouse-home-mobile-simulate-baseline.json.

### Visual refinement follow-up

The home hero uses stronger Persian typography, an inset copy panel and a pill-shaped primary action. Category photos have a high-contrast caption, catalog photos link to the product, and the story section uses the site's espresso surface. Existing photography and fonts were reused. The product detail image corners and heading wrap match the storefront refinement.

Three Lighthouse 12.8.2 cold mobile simulated runs on the polished local production build gave LCP of 2.008 s, 2.540 s and 2.404 s. Median LCP was 2.404 s and one run exceeded 2.5 s. CLS was 0.0601 in each run and performance scores were 99, 97 and 97. Raw reports are lighthouse-home-mobile-polish-1.json through lighthouse-home-mobile-polish-3.json.
