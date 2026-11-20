UPDATE products
SET image = '/images/narenj-products.webp', updated_at = NOW()
WHERE id IN ('linen-cushion','ceramic-vase','scented-candle','woven-basket','tea-cup','table-runner')
  AND image LIKE 'https://images.unsplash.com/%';
