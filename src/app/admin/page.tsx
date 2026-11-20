import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin-panel";
export const metadata: Metadata = { title: "مدیریت فروشگاه" };
export const dynamic = "force-dynamic";
export default function AdminPage() { return <main className="shell admin-shell" style={{minHeight:"100vh",paddingTop:50,paddingBottom:70}}><AdminPanel /></main>; }
