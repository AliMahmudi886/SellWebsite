export const storeConfig = {
  name: "خانه‌ی نارنج",
  tagline: "جزئیات کوچک، حال خوبِ هر روز",
  description: "فروشگاه آنلاین محصولات دست‌ساز و انتخاب‌شده برای خانه‌ای گرم و دوست‌داشتنی.",
  currency: "تومان",
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ?? "",
  supportHours: process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() ?? "",
  instagramUrl: process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() ?? "",
  city: "تهران",
  primary: "#31594d",
  accent: "#d88158"
} as const;

const persianDigits="۰۱۲۳۴۵۶۷۸۹",arabicDigits="٠١٢٣٤٥٦٧٨٩";
export function phoneToHref(value:string){return value.replace(/[۰-۹٠-٩]/g,d=>String((persianDigits.includes(d)?persianDigits:arabicDigits).indexOf(d))).replace(/[^\d+]/g,"");}
export const supportPhoneHref=phoneToHref(storeConfig.supportPhone);
