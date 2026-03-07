-- FasoStock - Schéma Supabase initial
-- À exécuter dans le SQL Editor de Supabase

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des boutiques (multi-tenant)
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'FCFA',
  receipt_footer TEXT DEFAULT 'Merci de votre achat !',
  tax_rate DECIMAL(10,2) DEFAULT 0,
  owner_name TEXT,
  default_stock_alert INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profils utilisateurs (lié à auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'cashier' CHECK (role IN ('super_admin', 'manager', 'cashier', 'stockist', 'accountant')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Catégories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fournisseurs
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Produits
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  brand TEXT,
  compatible_model TEXT,
  compatible_year TEXT,
  internal_ref TEXT,
  barcode TEXT,
  photo_url TEXT,
  purchase_price DECIMAL(14,2) DEFAULT 0,
  sale_price DECIMAL(14,2) NOT NULL,
  quantity INTEGER DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 5,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  location TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clients
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  segment TEXT DEFAULT 'new' CHECK (segment IN ('vip', 'regular', 'occasional', 'inactive', 'new')),
  motorcycle_brand TEXT,
  motorcycle_model TEXT,
  notes TEXT,
  tags TEXT[],
  total_purchases DECIMAL(14,2) DEFAULT 0,
  preferred_brands TEXT[],
  preferred_categories TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ventes
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  sale_number TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(14,2) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  total_cost DECIMAL(14,2) DEFAULT 0,
  profit DECIMAL(14,2) DEFAULT 0,
  payment_method TEXT,
  cash_amount DECIMAL(14,2),
  mobile_money_amount DECIMAL(14,2),
  amount_received DECIMAL(14,2),
  change_given DECIMAL(14,2),
  customer_name TEXT,
  customer_phone TEXT,
  seller_name TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ordres de réparation
CREATE TABLE IF NOT EXISTS repair_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT,
  description TEXT,
  motorcycle_brand TEXT,
  motorcycle_model TEXT,
  mechanic TEXT,
  total_cost DECIMAL(14,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered', 'cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dépenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  category TEXT DEFAULT 'other',
  payment_method TEXT DEFAULT 'cash',
  date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campagnes CRM
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'sms' CHECK (type IN ('sms', 'whatsapp', 'email')),
  message TEXT,
  target_segment TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  recipients_count INTEGER DEFAULT 0,
  sent_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Paramètres (settings - une ligne par shop)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  shop_name TEXT,
  shop_phone TEXT,
  shop_address TEXT,
  shop_logo_url TEXT,
  currency TEXT DEFAULT 'FCFA',
  default_stock_alert INTEGER DEFAULT 5,
  receipt_footer TEXT DEFAULT 'Merci de votre achat !',
  tax_rate DECIMAL(10,2) DEFAULT 0,
  owner_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_sales_shop ON sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shop ON expenses(shop_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_shop ON repair_orders(shop_id);

-- RLS policies (activate RLS on all tables)
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policy: les utilisateurs authentifiés peuvent tout faire (on peut raffiner par shop_id si besoin)
CREATE POLICY "Authenticated users full access" ON shops FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON suppliers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON sales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON repair_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON campaigns FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Trigger pour créer le profil à l'inscription
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

-- Créer le bucket Storage pour les uploads (à faire manuellement si besoin)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);
