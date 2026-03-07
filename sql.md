-- ============================================================
-- FasoStock - Schéma PostgreSQL / Supabase (corrigé)
-- Compatible avec l'app FasoStock
-- À exécuter dans Supabase → SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: shops
-- ============================================================
CREATE TABLE IF NOT EXISTS shops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  name              TEXT NOT NULL,
  phone             TEXT,
  address           TEXT,
  logo_url          TEXT,
  currency          TEXT DEFAULT 'FCFA',
  receipt_footer    TEXT DEFAULT 'Merci de votre achat !',
  tax_rate          NUMERIC DEFAULT 0,
  owner_name        TEXT,
  default_stock_alert INTEGER DEFAULT 5,
  is_active         BOOLEAN DEFAULT true
);

-- ============================================================
-- TABLE: profiles (lié à auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  email      TEXT,
  role       TEXT DEFAULT 'cashier' CHECK (role IN ('super_admin', 'manager', 'cashier', 'stockist', 'accountant')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: settings
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  shop_name           TEXT,
  shop_phone          TEXT,
  shop_address        TEXT,
  shop_logo_url       TEXT,
  currency            TEXT DEFAULT 'FCFA',
  default_stock_alert INTEGER DEFAULT 5,
  receipt_footer      TEXT,
  tax_rate            NUMERIC DEFAULT 0,
  owner_name          TEXT
);

-- ============================================================
-- TABLE: suppliers
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),

  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT
);

-- ============================================================
-- TABLE: categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  name            TEXT NOT NULL,
  parent_category TEXT,
  icon            TEXT
);

-- ============================================================
-- TABLE: products
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id          UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),

  name             TEXT NOT NULL,
  category         TEXT,
  subcategory      TEXT,
  brand            TEXT,
  compatible_model TEXT,
  compatible_year  TEXT,
  internal_ref     TEXT,
  barcode          TEXT,
  photo_url        TEXT,
  purchase_price   NUMERIC DEFAULT 0,
  sale_price       NUMERIC NOT NULL,
  quantity         INTEGER DEFAULT 0,
  min_stock_alert  INTEGER DEFAULT 5,
  supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  location         TEXT,
  status           TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued'))
);

-- ============================================================
-- TABLE: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  name                TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  address             TEXT,
  segment             TEXT DEFAULT 'new' CHECK (segment IN ('vip', 'regular', 'occasional', 'inactive', 'new')),
  tags                TEXT[],
  notes               TEXT,
  total_purchases     NUMERIC DEFAULT 0,
  preferred_categories TEXT[],
  preferred_brands    TEXT[],
  motorcycle_brand    TEXT,
  motorcycle_model    TEXT
);

-- ============================================================
-- TABLE: sales (items en JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id              UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),

  sale_number          TEXT NOT NULL,
  items                JSONB NOT NULL DEFAULT '[]',
  subtotal             NUMERIC DEFAULT 0,
  discount_percent     NUMERIC DEFAULT 0,
  discount_amount      NUMERIC DEFAULT 0,
  total                NUMERIC NOT NULL,
  total_cost           NUMERIC DEFAULT 0,
  profit               NUMERIC DEFAULT 0,
  payment_method       TEXT CHECK (payment_method IN ('cash', 'mobile_money', 'mixed', 'credit')),
  cash_amount          NUMERIC,
  mobile_money_amount  NUMERIC,
  amount_received      NUMERIC,
  change_given         NUMERIC,
  customer_name        TEXT,
  customer_phone       TEXT,
  seller_name          TEXT,
  notes                TEXT,
  status               TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'cancelled'))
);

-- ============================================================
-- TABLE: expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id        UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),

  description    TEXT NOT NULL,
  amount         NUMERIC NOT NULL,
  category       TEXT DEFAULT 'other' CHECK (category IN ('supplier_purchase','rent','salary','utilities','transport','maintenance','other')),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer')),
  date           DATE,
  notes          TEXT
);

-- ============================================================
-- TABLE: repair_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_orders (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id            UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),

  order_number       TEXT NOT NULL,
  customer_name      TEXT,
  customer_phone     TEXT,
  motorcycle_brand   TEXT,
  motorcycle_model   TEXT,
  description        TEXT,
  mechanic           TEXT,
  total_cost         NUMERIC DEFAULT 0,
  status             TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','delivered','cancelled')),
  payment_status     TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  notes              TEXT
);

-- ============================================================
-- TABLE: campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id          UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),

  name             TEXT NOT NULL,
  type             TEXT DEFAULT 'sms' CHECK (type IN ('sms', 'whatsapp', 'email')),
  message          TEXT,
  target_segment   TEXT,
  status           TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  recipients_count INTEGER DEFAULT 0,
  sent_date        DATE
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_sales_shop ON sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shop ON expenses(shop_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_shop ON repair_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_shop ON campaigns(shop_id);

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shops_updated ON shops;
CREATE TRIGGER trg_shops_updated BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_categories_updated ON categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_sales_updated ON sales;
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_expenses_updated ON expenses;
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_repair_orders_updated ON repair_orders;
CREATE TRIGGER trg_repair_orders_updated BEFORE UPDATE ON repair_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: profil à la création utilisateur
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE shops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON shops;
CREATE POLICY "Authenticated full access" ON shops FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON profiles;
CREATE POLICY "Authenticated full access" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON settings;
CREATE POLICY "Authenticated full access" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON suppliers;
CREATE POLICY "Authenticated full access" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON categories;
CREATE POLICY "Authenticated full access" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON products;
CREATE POLICY "Authenticated full access" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON customers;
CREATE POLICY "Authenticated full access" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON sales;
CREATE POLICY "Authenticated full access" ON sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON expenses;
CREATE POLICY "Authenticated full access" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON repair_orders;
CREATE POLICY "Authenticated full access" ON repair_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON campaigns;
CREATE POLICY "Authenticated full access" ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
