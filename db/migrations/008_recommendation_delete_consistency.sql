DROP TRIGGER IF EXISTS orders_recommendation_counts_trigger ON orders;
TRUNCATE product_copurchase_counts, product_order_counts;

INSERT INTO product_order_counts(product_id, order_count)
SELECT i.product_id, COUNT(DISTINCT i.order_id)
FROM order_items i JOIN orders o ON o.id=i.order_id
WHERE o.status='delivered' AND i.product_id IS NOT NULL
GROUP BY i.product_id;

INSERT INTO product_copurchase_counts(source_product_id,candidate_product_id,co_orders)
SELECT source.product_id,target.product_id,COUNT(DISTINCT source.order_id)
FROM order_items source
JOIN orders o ON o.id=source.order_id AND o.status='delivered'
JOIN order_items target ON target.order_id=source.order_id AND target.product_id IS NOT NULL
WHERE source.product_id IS NOT NULL AND source.product_id<>target.product_id
GROUP BY source.product_id,target.product_id;

CREATE TRIGGER orders_recommendation_counts_trigger
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION maintain_product_recommendation_counts();

CREATE TRIGGER orders_recommendation_counts_before_delete_trigger
BEFORE DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION maintain_product_recommendation_counts();
