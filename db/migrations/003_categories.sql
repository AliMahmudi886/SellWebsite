CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories(name)
SELECT DISTINCT category
FROM products
WHERE char_length(trim(category)) BETWEEN 2 AND 80
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_category_name_fk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_name_fk
      FOREIGN KEY (category) REFERENCES categories(name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories(sort_order, name);
