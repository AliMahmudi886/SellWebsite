import type { PoolClient } from "pg";

type OrderEvent =
  | { type: "order.created"; status: "awaiting_contact" }
  | { type: "order.status_changed"; status: string; previousStatus: string };

export async function enqueueOrderEvent(client: PoolClient, orderId: string, event: OrderEvent) {
  const { type, ...payload } = event;
  await client.query(
    "INSERT INTO order_outbox(order_id,event_type,payload) VALUES($1,$2,$3)",
    [orderId, type, JSON.stringify(payload)],
  );
}
