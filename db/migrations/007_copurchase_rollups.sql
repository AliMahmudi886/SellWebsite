CREATE TABLE IF NOT EXISTS product_order_counts (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  order_count BIGINT NOT NULL DEFAULT 0 CHECK (order_count >= 0)
);

CREATE TABLE IF NOT EXISTS product_copurchase_counts (
  source_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  candidate_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  co_orders BIGINT NOT NULL DEFAULT 0 CHECK (co_orders >= 0),
  PRIMARY KEY (source_product_id, candidate_product_id),
  CHECK (source_product_id <> candidate_product_id)
);

CREATE INDEX IF NOT EXISTS product_copurchase_candidate_idx
  ON product_copurchase_counts(candidate_product_id, source_product_id);

INSERT INTO product_order_counts(product_id, order_count)
SELECT i.product_id, COUNT(DISTINCT i.order_id)
FROM order_items i JOIN orders o ON o.id=i.order_id
WHERE o.status='delivered' AND i.product_id IS NOT NULL
GROUP BY i.product_id
ON CONFLICT (product_id) DO UPDATE SET order_count=EXCLUDED.order_count;

INSERT INTO product_copurchase_counts(source_product_id,candidate_product_id,co_orders)
SELECT source.product_id,target.product_id,COUNT(DISTINCT source.order_id)
FROM order_items source
JOIN orders o ON o.id=source.order_id AND o.status='delivered'
JOIN order_items target ON target.order_id=source.order_id AND target.product_id IS NOT NULL
WHERE source.product_id IS NOT NULL AND source.product_id<>target.product_id
GROUP BY source.product_id,target.product_id
ON CONFLICT(source_product_id,candidate_product_id) DO UPDATE SET co_orders=EXCLUDED.co_orders;

CREATE OR REPLACE FUNCTION maintain_product_recommendation_counts() RETURNS trigger AS $$
DECLARE
  affected_order_id TEXT;
  next_status TEXT;
  item RECORD;
  peer RECORD;
  direction INTEGER;
  item_counts RECORD;
BEGIN
  affected_order_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  next_status := CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.status END;
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF TG_OP='UPDATE' AND OLD.status='delivered' OR TG_OP='DELETE' AND OLD.status='delivered' THEN direction := -1;
  ELSIF TG_OP='INSERT' AND next_status='delivered' OR TG_OP='UPDATE' AND next_status='delivered' THEN direction := 1;
  ELSE RETURN COALESCE(NEW,OLD);
  END IF;

  FOR item IN SELECT DISTINCT product_id FROM order_items WHERE order_id=affected_order_id AND product_id IS NOT NULL LOOP
    IF direction=-1 THEN
      UPDATE product_order_counts SET order_count=GREATEST(0,order_count-1) WHERE product_id=item.product_id;
    ELSE
      INSERT INTO product_order_counts(product_id,order_count) VALUES(item.product_id,1)
      ON CONFLICT(product_id) DO UPDATE SET order_count=product_order_counts.order_count+1;
    END IF;
    FOR peer IN SELECT DISTINCT product_id FROM order_items WHERE order_id=affected_order_id AND product_id IS NOT NULL AND product_id<>item.product_id LOOP
      IF direction=-1 THEN
        UPDATE product_copurchase_counts SET co_orders=GREATEST(0,co_orders-1) WHERE source_product_id=item.product_id AND candidate_product_id=peer.product_id;
      ELSE
        INSERT INTO product_copurchase_counts(source_product_id,candidate_product_id,co_orders) VALUES(item.product_id,peer.product_id,1)
        ON CONFLICT(source_product_id,candidate_product_id) DO UPDATE SET co_orders=product_copurchase_counts.co_orders+1;
      END IF;
    END LOOP;
  END LOOP;
  DELETE FROM product_order_counts WHERE order_count=0;
  DELETE FROM product_copurchase_counts WHERE co_orders=0;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_recommendation_counts_trigger ON orders;
CREATE TRIGGER orders_recommendation_counts_trigger
AFTER INSERT OR UPDATE OF status OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION maintain_product_recommendation_counts();
