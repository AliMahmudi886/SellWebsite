-- Migration 003 checked the constraint name across all schemas.
-- Repair installations that skipped it because another schema already had it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'products'::regclass
      AND conname = 'products_category_name_fk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_name_fk
      FOREIGN KEY (category) REFERENCES categories(name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;
