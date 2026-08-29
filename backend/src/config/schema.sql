-- Trippletone Bar POS Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  role_id INTEGER REFERENCES roles(id),
  phone VARCHAR(20),
  email VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Upgrade path for existing databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  business_name VARCHAR(200) DEFAULT 'Trippletone Bar',
  business_phone VARCHAR(20),
  business_location TEXT,
  currency VARCHAR(10) DEFAULT 'KSh',
  tax_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(200),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  buying_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_stock DECIMAL(12,2) DEFAULT 0,
  minimum_stock DECIMAL(12,2) DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'piece',
  supplier_id INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  date_added TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_product_supplier'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_product_supplier
      FOREIGN KEY (supplier_id)
      REFERENCES suppliers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Soft-delete support for products: rows are kept (sales history intact),
-- hidden by setting deleted_at. Applied after the table definition so it works
-- for both fresh and existing databases.
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS supplier_products (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_id VARCHAR(50) UNIQUE NOT NULL,
  client_ref VARCHAR(100),
  user_id INTEGER REFERENCES users(id),
  date TIMESTAMP DEFAULT NOW(),
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT 'cash',
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Upgrade path for existing databases + idempotency index for offline sync
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref ON sales(client_ref) WHERE client_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(200),
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  buying_price DECIMAL(12,2) DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL,
  profit DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  purchase_id VARCHAR(50) UNIQUE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  product_id INTEGER REFERENCES products(id),
  quantity DECIMAL(10,2) NOT NULL,
  buying_price DECIMAL(12,2) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  invoice_number VARCHAR(100),
  notes TEXT,
  date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  expense_id VARCHAR(50) UNIQUE NOT NULL,
  category_id INTEGER REFERENCES expense_categories(id),
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'cash',
  person_vendor VARCHAR(200),
  notes TEXT,
  date TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  type VARCHAR(20) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  reference_id INTEGER,
  reference_type VARCHAR(50),
  notes TEXT,
  date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kegs (
  id SERIAL PRIMARY KEY,
  keg_id VARCHAR(50) UNIQUE NOT NULL,
  product_name VARCHAR(200),
  buying_price DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',
  open_date TIMESTAMP DEFAULT NOW(),
  close_date TIMESTAMP,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keg_transactions (
  id SERIAL PRIMARY KEY,
  keg_id INTEGER REFERENCES kegs(id) ON DELETE CASCADE,
  date TIMESTAMP DEFAULT NOW(),
  amount DECIMAL(12,2) DEFAULT 0,
  till DECIMAL(12,2) DEFAULT 0,
  daily_total DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clb_transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  date TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_summaries (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  total_expenses DECIMAL(12,2) DEFAULT 0,
  net_profit DECIMAL(12,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_summaries (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  total_expenses DECIMAL(12,2) DEFAULT 0,
  net_profit DECIMAL(12,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  details TEXT,
  date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id),
  method VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, description)
VALUES
  ('cashier', 'Cashier - can only process sales'),
  ('manager', 'Manager/Administrator - full access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_categories (name)
VALUES
  ('Salaries'),
  ('Rent'),
  ('Chama'),
  ('Electricity'),
  ('Water'),
  ('Internet'),
  ('DSTV'),
  ('Licenses'),
  ('Transport'),
  ('Repairs'),
  ('Maintenance'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name)
VALUES
  ('Beers'),
  ('Spirits'),
  ('Wines'),
  ('Soft Drinks'),
  ('Water'),
  ('Mixers'),
  ('Energy Drinks'),
  ('Cigarettes'),
  ('Food'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (business_name, currency)
VALUES ('Trippletone Bar', 'KSh')
ON CONFLICT DO NOTHING;
