export const orderStatuses=["awaiting_contact","confirmed","preparing","sent","delivered","cancelled"] as const;
export type OrderStatus=typeof orderStatuses[number];
export const allowedNextOrderStatus:Record<OrderStatus,readonly OrderStatus[]>={
 awaiting_contact:["confirmed","cancelled"],
 confirmed:["preparing","cancelled"],
 preparing:["sent","cancelled"],
 sent:["delivered"],
 delivered:[],
 cancelled:[],
};
export function canTransitionOrderStatus(from:string,to:string){return orderStatuses.includes(from as OrderStatus)&&allowedNextOrderStatus[from as OrderStatus].includes(to as OrderStatus);}
