import type { Metadata } from "next";
import { OrderTracker } from "@/components/order-tracker";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const metadata: Metadata={title:"پیگیری سفارش",robots:{index:false,follow:false}};
export default function TrackPage(){return <><SiteHeader/><OrderTracker/><SiteFooter/></>;}
