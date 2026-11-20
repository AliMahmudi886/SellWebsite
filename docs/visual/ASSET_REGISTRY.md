# Asset registry

| Asset | Source and usage |
| --- | --- |
| public/assets/narenj-hero.webp | Existing workspace asset relocated for the revised hero. Original provenance and commercial license are undocumented in the files reviewed. |
| public/images/narenj-products.webp | Existing product preview sprite. Used by demo data and retained at its current path for older records. Original provenance is undocumented. |
| public/fonts/Vazirmatn-wght.woff2 | Existing font, SIL Open Font License, public/fonts/OFL.txt. |
| public/icons | Existing Lucide icons, license recorded in public/icons/LICENSE.txt. |
| public/assets/narenj-hero-mobile.8ff607794b7d.avif | 768px AVIF derivative of the existing narenj-hero.webp for mobile. |
| public/assets/catalog/*.webp | Six individual 512px WebP crops of the existing narenj-products.webp demo sprite, in its original tile order. |

Existing catalog photos continue to come from their product records. No new external photography or icon assets were incorporated.

The current mobile hero is public/assets/narenj-hero-mobile.f7e5ba36a044.avif, a 704px, 12,206-byte derivative of the existing hero. The previous fingerprint remains available for earlier builds.

The initial font public/fonts/Narenj-Vazirmatn-core.woff2 is a 61,864-byte FontTools subset of Vazirmatn-wght.woff2 under the same OFL. It retains the Latin ASCII, Arabic and general punctuation blocks present in the original, plus selected symbols used in the interface. The CSS extended font range is the difference between the original and subset Unicode maps. When regenerating the subset, regenerate that range as well.
