CREATE TABLE order_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('order.created', 'order.status_changed')),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX order_outbox_pending_idx ON order_outbox (created_at, id)
  WHERE published_at IS NULL;
CREATE INDEX order_outbox_order_id_idx ON order_outbox (order_id);
