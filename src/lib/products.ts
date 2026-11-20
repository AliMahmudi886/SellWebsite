export type Product = { id: string; name: string; category: string; price: number; oldPrice?: number; image: string; tone: string; badge?: string; description: string; stock: number; featured: boolean; published?: boolean };
export const products: Product[] = [
  { id: "linen-cushion", name: "روبالشی کتان سپیدار", category: "خانه و پارچه", price: 890000, oldPrice: 1050000, image: "/images/narenj-products.webp", tone: "#e8e1d4", badge: "پرفروش", description: "دوخته‌شده از کتان طبیعی با بافتی نرم و ماندگار؛ مناسب لحظه‌های آرام خانه.", stock: 12, featured: true },
  { id: "ceramic-vase", name: "گلدان سرامیکی موج", category: "سرامیک", price: 1240000, image: "/images/narenj-products.webp", tone: "#e8d9c7", badge: "دست‌ساز", description: "هر گلدان با دست شکل گرفته و لعاب آن در هر قطعه کمی تفاوت دلنشین دارد.", stock: 7, featured: true },
  { id: "scented-candle", name: "شمع معطر چوب صندل", category: "رایحه و آرامش", price: 560000, oldPrice: 650000, image: "/images/narenj-products.webp", tone: "#dfd2bd", badge: "۱۰٪ تخفیف", description: "ترکیب گرم چوب صندل در ظرفی ساده و قابل استفاده‌ی دوباره.", stock: 18, featured: true },
  { id: "woven-basket", name: "سبد بافت حصیری آفتاب", category: "خانه و دکور", price: 980000, image: "/images/narenj-products.webp", tone: "#d9c3a1", description: "بافته‌شده از الیاف طبیعی؛ برای نگهداری وسایل روزمره یا گلدان‌های کوچک.", stock: 5, featured: true },
  { id: "tea-cup", name: "فنجان سرامیکی صبح", category: "سرامیک", price: 420000, image: "/images/narenj-products.webp", tone: "#d7d9c8", description: "فنجان کوچکی با فرم ارگانیک برای شروع آرام روز.", stock: 20, featured: false },
  { id: "table-runner", name: "رانر کتان باغچه", category: "خانه و پارچه", price: 710000, image: "/images/narenj-products.webp", tone: "#ded6c8", description: "پارچه‌ی کتان با دوخت ساده و رنگی که به‌راحتی با خانه هماهنگ می‌شود.", stock: 9, featured: false }
];
export const formatPrice = (price: number) => new Intl.NumberFormat("fa-IR").format(price);
const digitMap:Record<string,string>={"۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9","٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"};
export function normalizeSearch(value:string){return value.toLocaleLowerCase("fa-IR").replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[۰-۹٠-٩]/g,digit=>digitMap[digit]).normalize("NFKC").trim().replace(/\s+/g," ");}
