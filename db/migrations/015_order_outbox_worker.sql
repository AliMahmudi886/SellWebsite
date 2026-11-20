ALTER TABLE order_outbox
  ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN failed_at timestamptz;

CREATE INDEX order_outbox_dispatch_idx ON order_outbox (next_attempt_at, created_at, id)
  WHERE published_at IS NULL AND failed_at IS NULL;

CREATE TABLE order_event_inbox (
  event_id uuid PRIMARY KEY REFERENCES order_outbox(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
