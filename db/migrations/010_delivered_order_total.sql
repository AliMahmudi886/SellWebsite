CREATE TABLE IF NOT EXISTS product_recommendation_stats (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  delivered_order_count BIGINT NOT NULL DEFAULT 0 CHECK (delivered_order_count>=0)
);

INSERT INTO product_recommendation_stats(id,delivered_order_count)
SELECT 1,COUNT(*) FROM orders WHERE status='delivered'
ON CONFLICT(id) DO UPDATE SET delivered_order_count=EXCLUDED.delivered_order_count;

CREATE OR REPLACE FUNCTION maintain_delivered_order_total() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status='delivered' THEN
    UPDATE product_recommendation_stats SET delivered_order_count=GREATEST(0,delivered_order_count-1) WHERE id=1;
  ELSIF TG_OP='INSERT' AND NEW.status='delivered' THEN
    UPDATE product_recommendation_stats SET delivered_order_count=delivered_order_count+1 WHERE id=1;
  ELSIF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status='delivered' THEN
      UPDATE product_recommendation_stats SET delivered_order_count=GREATEST(0,delivered_order_count-1) WHERE id=1;
    ELSIF NEW.status='delivered' THEN
      UPDATE product_recommendation_stats SET delivered_order_count=delivered_order_count+1 WHERE id=1;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delivered_order_total_trigger ON orders;
CREATE TRIGGER delivered_order_total_trigger
AFTER INSERT OR UPDATE OF status OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION maintain_delivered_order_total();
