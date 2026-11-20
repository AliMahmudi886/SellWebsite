ALTER TABLE orders
  ADD COLUMN idempotency_key_hash text,
  ADD COLUMN idempotency_request_hash text,
  ADD CONSTRAINT orders_idempotency_hash_pair
    CHECK ((idempotency_key_hash IS NULL) = (idempotency_request_hash IS NULL));

CREATE UNIQUE INDEX orders_idempotency_key_idx ON orders(idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;
