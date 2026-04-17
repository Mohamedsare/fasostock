-- ============================================================================
-- FasoStock — Schéma + données de seed (exécution unique sur base vierge)
-- ============================================================================
-- Contenu :
--   1) Toutes les migrations (supabase/migrations/*.sql), sauf 00062–00068
--      remplacées par le bundle 00072 (même effet, sans doublons CREATE).
--   2) seed.sql — rôles, permissions, entreprises / boutiques / produits démo.
--
-- PRÉREQUIS (indispensable pour que le SQL s''exécute) :
-- • Schéma auth : tables auth.users (et triggers Auth) comme sur Supabase.
--   Ce fichier ne recrée pas Auth : utilisez « supabase db reset », ou un projet
--   Supabase hébergé, ou provisionnez auth.users vous-même.
-- • Rôles Postgres : au minimum les rôles attendus par vos GRANT (ex. authenticated,
--   service_role, anon) si vous rejouez le script hors CLI Supabase.
--
-- HORS DE CE FICHIER (pas du SQL Postgres) :
-- • Edge Functions (supabase/functions/*.ts) — déploiement séparé.
-- • Configuration (config.toml, clés API, Storage fichiers binaires).
-- ============================================================================


-- >>> MIGRATION FILE: 00001_initial_schema.sql <<<

-- FasoStock — Schéma initial
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== ENUMS ==========
CREATE TYPE user_role_enum AS ENUM (
  'super_admin', 'owner', 'manager', 'store_manager',
  'cashier', 'stock_manager', 'accountant', 'viewer'
);

CREATE TYPE store_increase_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE transfer_status AS ENUM (
  'draft', 'pending', 'approved', 'shipped', 'received', 'rejected', 'cancelled'
);

CREATE TYPE purchase_status AS ENUM (
  'draft', 'confirmed', 'partially_received', 'received', 'cancelled'
);

CREATE TYPE sale_status AS ENUM ('draft', 'completed', 'cancelled', 'refunded');

CREATE TYPE payment_method AS ENUM ('cash', 'mobile_money', 'card', 'transfer', 'other');

CREATE TYPE stock_movement_type AS ENUM (
  'purchase_in', 'sale_out', 'adjustment', 'transfer_out', 'transfer_in',
  'return_in', 'return_out', 'loss', 'inventory_correction'
);

CREATE TYPE cash_movement_type AS ENUM (
  'opening', 'closing', 'sale', 'expense', 'withdrawal', 'deposit', 'adjustment'
);

CREATE TYPE customer_type AS ENUM ('individual', 'company');

CREATE TYPE inventory_session_status AS ENUM ('open', 'closed');

-- ========== PROFILES (extends auth.users) ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== COMPANIES ==========
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  store_quota INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug)
);

CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, key)
);

-- ========== ROLES & PERMISSIONS ==========
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE
);

CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.user_company_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- ========== STORES ==========
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

CREATE TABLE public.user_store_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);

CREATE TABLE public.store_increase_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_count INTEGER NOT NULL CHECK (requested_count > 0),
  justification TEXT,
  comment TEXT,
  status store_increase_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== CATALOG ==========
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  unit TEXT NOT NULL DEFAULT 'pce',
  purchase_price DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sale_price DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  min_price DECIMAL(18,4) CHECK (min_price IS NULL OR min_price >= 0),
  stock_min INTEGER NOT NULL DEFAULT 0 CHECK (stock_min >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, sku)
);

CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_store_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  stock_min_override INTEGER CHECK (stock_min_override IS NULL OR stock_min_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, store_id)
);

-- ========== SUPPLIERS & CUSTOMERS ==========
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type customer_type NOT NULL DEFAULT 'individual',
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== INVENTORY ==========
CREATE TABLE public.store_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id)
);

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status inventory_session_status NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_session_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_qty INTEGER NOT NULL,
  counted_qty INTEGER NOT NULL,
  variance INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== SALES ==========
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_number TEXT NOT NULL,
  status sale_status NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax DECIMAL(18,4) NOT NULL DEFAULT 0,
  total DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, sale_number)
);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(18,4) NOT NULL,
  discount DECIMAL(18,4) NOT NULL DEFAULT 0,
  total DECIMAL(18,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  status sale_status NOT NULL DEFAULT 'completed',
  total_refund DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount DECIMAL(18,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== CASH ==========
CREATE TABLE public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  closing_amount DECIMAL(18,4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  type cash_movement_type NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== PURCHASES ==========
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  reference TEXT,
  status purchase_status NOT NULL DEFAULT 'draft',
  total DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(18,4) NOT NULL,
  total DECIMAL(18,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== TRANSFERS ==========
CREATE TABLE public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  to_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status transfer_status NOT NULL DEFAULT 'draft',
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_store_id != to_store_id)
);

CREATE TABLE public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_requested INTEGER NOT NULL CHECK (quantity_requested > 0),
  quantity_shipped INTEGER NOT NULL DEFAULT 0 CHECK (quantity_shipped >= 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== AUDIT & NOTIFICATIONS ==========
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== AI ==========
CREATE TABLE public.ai_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_insights_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  insight_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  snapshot_date DATE NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== INDEXES ==========
CREATE INDEX idx_companies_slug ON public.companies(slug);
CREATE INDEX idx_company_settings_company ON public.company_settings(company_id);
CREATE INDEX idx_user_company_roles_user ON public.user_company_roles(user_id);
CREATE INDEX idx_user_company_roles_company ON public.user_company_roles(company_id);
CREATE INDEX idx_stores_company ON public.stores(company_id);
CREATE INDEX idx_user_store_assignments_user ON public.user_store_assignments(user_id);
CREATE INDEX idx_user_store_assignments_company ON public.user_store_assignments(company_id);
CREATE INDEX idx_store_increase_requests_company ON public.store_increase_requests(company_id);
CREATE INDEX idx_store_increase_requests_status ON public.store_increase_requests(status);
CREATE INDEX idx_categories_company ON public.categories(company_id);
CREATE INDEX idx_products_company ON public.products(company_id);
CREATE INDEX idx_products_sku ON public.products(company_id, sku);
CREATE INDEX idx_products_barcode ON public.products(company_id, barcode);
CREATE INDEX idx_products_deleted ON public.products(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_company ON public.suppliers(company_id);
CREATE INDEX idx_customers_company ON public.customers(company_id);
CREATE INDEX idx_store_inventory_store ON public.store_inventory(store_id);
CREATE INDEX idx_store_inventory_product ON public.store_inventory(product_id);
CREATE INDEX idx_stock_movements_store ON public.stock_movements(store_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at);
CREATE INDEX idx_sales_company ON public.sales(company_id);
CREATE INDEX idx_sales_store ON public.sales(store_id);
CREATE INDEX idx_sales_created ON public.sales(created_at);
CREATE INDEX idx_sales_status ON public.sales(status);
CREATE INDEX idx_cash_register_sessions_store ON public.cash_register_sessions(store_id);
CREATE INDEX idx_purchases_company ON public.purchases(company_id);
CREATE INDEX idx_purchases_store ON public.purchases(store_id);
CREATE INDEX idx_stock_transfers_company ON public.stock_transfers(company_id);
CREATE INDEX idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX idx_audit_logs_company ON public.audit_logs(company_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_ai_requests_company ON public.ai_requests(company_id);

-- ========== TRIGGER: updated_at ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_increase_requests FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_inventory FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- >>> MIGRATION FILE: 00002_rls_and_functions.sql <<<

-- FasoStock — RLS: helper functions and policies

-- ========== HELPER FUNCTIONS ==========

-- Companies the current user belongs to (via user_company_roles)
CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Super admin check: from profiles
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Store IDs the user can access for a given company (assigned stores or all if owner/manager with company-wide role)
CREATE OR REPLACE FUNCTION public.current_user_store_ids(p_company_id UUID)
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.stores s
  WHERE s.company_id = p_company_id
  AND (
    EXISTS (SELECT 1 FROM public.user_store_assignments ua WHERE ua.user_id = auth.uid() AND ua.store_id = s.id AND ua.company_id = p_company_id)
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND r.slug IN ('owner', 'manager', 'super_admin')
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if user has a given permission (by key) in any role for a company
CREATE OR REPLACE FUNCTION public.has_permission(p_company_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND p.key = p_permission_key
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check store access for a company
CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id UUID, p_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_store_id IN (SELECT * FROM public.current_user_store_ids(p_company_id));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ========== ENABLE RLS ON ALL TABLES ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_increase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- ========== PROFILES ==========
-- Users can read/update own profile
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
-- Insert via trigger from auth.users (handled in app or trigger)
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

-- ========== ROLES & PERMISSIONS (read-only for all authenticated) ==========
CREATE POLICY "roles_select_all" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "permissions_select_all" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_select_all" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- ========== COMPANIES ==========
-- companies table has "id" not "company_id"
CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (true); -- signup flow, then restrict in app
CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);

-- ========== COMPANY_SETTINGS ==========
CREATE POLICY "company_settings_select" ON public.company_settings FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "company_settings_insert" ON public.company_settings FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "company_settings_update" ON public.company_settings FOR UPDATE USING (
  company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== USER_COMPANY_ROLES ==========
CREATE POLICY "user_company_roles_select" ON public.user_company_roles FOR SELECT USING (
  auth.uid() = user_id OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "user_company_roles_insert" ON public.user_company_roles FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);
-- Allow first member to add themselves when creating a company (no existing members)
CREATE POLICY "user_company_roles_insert_first_member" ON public.user_company_roles FOR INSERT WITH CHECK (
  user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.user_company_roles u2 WHERE u2.company_id = user_company_roles.company_id)
);
CREATE POLICY "user_company_roles_update" ON public.user_company_roles FOR UPDATE USING (
  company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "user_company_roles_delete" ON public.user_company_roles FOR DELETE USING (
  company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== STORES ==========
CREATE POLICY "stores_select" ON public.stores FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "stores_insert" ON public.stores FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "stores_update" ON public.stores FOR UPDATE USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== USER_STORE_ASSIGNMENTS ==========
CREATE POLICY "user_store_assignments_select" ON public.user_store_assignments FOR SELECT USING (
  auth.uid() = user_id OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "user_store_assignments_insert" ON public.user_store_assignments FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "user_store_assignments_update_delete" ON public.user_store_assignments FOR ALL USING (
  company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== STORE_INCREASE_REQUESTS ==========
CREATE POLICY "store_increase_requests_select" ON public.store_increase_requests FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "store_increase_requests_insert" ON public.store_increase_requests FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "store_increase_requests_update" ON public.store_increase_requests FOR UPDATE USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== CATEGORIES ==========
CREATE POLICY "categories_all" ON public.categories FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== BRANDS ==========
CREATE POLICY "brands_all" ON public.brands FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== PRODUCTS ==========
CREATE POLICY "products_all" ON public.products FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== PRODUCT_IMAGES, PRODUCT_STORE_SETTINGS ==========
CREATE POLICY "product_images_all" ON public.product_images FOR ALL USING (
  EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.company_id IN (SELECT * FROM current_user_company_ids()) OR is_super_admin()))
);
CREATE POLICY "product_store_settings_all" ON public.product_store_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.company_id IN (SELECT * FROM current_user_company_ids()) OR is_super_admin()))
);

-- ========== SUPPLIERS, CUSTOMERS ==========
CREATE POLICY "suppliers_all" ON public.suppliers FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "customers_all" ON public.customers FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ========== STORE_INVENTORY (store-scoped) ==========
CREATE POLICY "store_inventory_select" ON public.store_inventory FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = store_inventory.store_id
    AND s.company_id IN (SELECT * FROM current_user_company_ids())
    AND store_inventory.store_id IN (SELECT * FROM current_user_store_ids(s.company_id))
  )
);
CREATE POLICY "store_inventory_insert" ON public.store_inventory FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);
CREATE POLICY "store_inventory_update" ON public.store_inventory FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);

-- ========== STOCK_MOVEMENTS, STOCK_ADJUSTMENTS ==========
CREATE POLICY "stock_movements_all" ON public.stock_movements FOR ALL USING (
  is_super_admin() OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);
CREATE POLICY "stock_adjustments_all" ON public.stock_adjustments FOR ALL USING (
  is_super_admin() OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);

-- ========== INVENTORY_SESSIONS, INVENTORY_SESSION_ITEMS ==========
CREATE POLICY "inventory_sessions_all" ON public.inventory_sessions FOR ALL USING (
  is_super_admin() OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);
CREATE POLICY "inventory_session_items_all" ON public.inventory_session_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.inventory_sessions isess JOIN public.stores s ON s.id = isess.store_id WHERE isess.id = session_id AND (is_super_admin() OR (s.company_id IN (SELECT * FROM current_user_company_ids()) AND isess.store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))))
);

-- ========== SALES ==========
CREATE POLICY "sales_select" ON public.sales FOR SELECT USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(company_id)))
);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(company_id))
);
CREATE POLICY "sales_update" ON public.sales FOR UPDATE USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(company_id)))
);

-- ========== SALE_ITEMS, SALE_PAYMENTS, SALE_RETURNS, SALE_RETURN_ITEMS ==========
CREATE POLICY "sale_items_all" ON public.sale_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sales sa WHERE sa.id = sale_id AND (is_super_admin() OR (sa.company_id IN (SELECT * FROM current_user_company_ids()) AND sa.store_id IN (SELECT * FROM current_user_store_ids(sa.company_id)))))
);
CREATE POLICY "sale_payments_all" ON public.sale_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sales sa WHERE sa.id = sale_id AND (is_super_admin() OR (sa.company_id IN (SELECT * FROM current_user_company_ids()) AND sa.store_id IN (SELECT * FROM current_user_store_ids(sa.company_id)))))
);
CREATE POLICY "sale_returns_all" ON public.sale_returns FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sales sa WHERE sa.id = sale_id AND (is_super_admin() OR (sa.company_id IN (SELECT * FROM current_user_company_ids()) AND sa.store_id IN (SELECT * FROM current_user_store_ids(sa.company_id)))))
);
CREATE POLICY "sale_return_items_all" ON public.sale_return_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sale_returns sr JOIN public.sales sa ON sa.id = sr.sale_id WHERE sr.id = return_id AND (is_super_admin() OR (sa.company_id IN (SELECT * FROM current_user_company_ids()) AND sa.store_id IN (SELECT * FROM current_user_store_ids(sa.company_id)))))
);

-- ========== CASH ==========
CREATE POLICY "cash_register_sessions_all" ON public.cash_register_sessions FOR ALL USING (
  is_super_admin() OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))
);
CREATE POLICY "cash_movements_all" ON public.cash_movements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.cash_register_sessions crs JOIN public.stores s ON s.id = crs.store_id WHERE crs.id = session_id AND (is_super_admin() OR (s.company_id IN (SELECT * FROM current_user_company_ids()) AND crs.store_id IN (SELECT * FROM current_user_store_ids(s.company_id)))))
);

-- ========== PURCHASES ==========
CREATE POLICY "purchases_all" ON public.purchases FOR ALL USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND store_id IN (SELECT * FROM current_user_store_ids(company_id)))
);

CREATE POLICY "purchase_items_all" ON public.purchase_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND (is_super_admin() OR (p.company_id IN (SELECT * FROM current_user_company_ids()) AND p.store_id IN (SELECT * FROM current_user_store_ids(p.company_id)))))
);
CREATE POLICY "purchase_payments_all" ON public.purchase_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND (is_super_admin() OR (p.company_id IN (SELECT * FROM current_user_company_ids()) AND p.store_id IN (SELECT * FROM current_user_store_ids(p.company_id)))))
);

-- ========== STOCK_TRANSFERS ==========
CREATE POLICY "stock_transfers_all" ON public.stock_transfers FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "stock_transfer_items_all" ON public.stock_transfer_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.stock_transfers st WHERE st.id = transfer_id AND (is_super_admin() OR st.company_id IN (SELECT * FROM current_user_company_ids())))
);

-- ========== AUDIT_LOGS ==========
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT USING (
  is_super_admin() OR (company_id IS NOT NULL AND company_id IN (SELECT * FROM current_user_company_ids()))
);
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT WITH CHECK (true); -- service role or authenticated via trigger

-- ========== NOTIFICATIONS ==========
CREATE POLICY "notifications_all" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- ========== AI ==========
CREATE POLICY "ai_requests_all" ON public.ai_requests FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "ai_insights_cache_all" ON public.ai_insights_cache FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "forecast_snapshots_all" ON public.forecast_snapshots FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);


-- >>> MIGRATION FILE: 00003_fix_companies_rls.sql <<<

-- Fix: companies RLS for signup flow (anon role before email confirmation)
-- Also fix: companies table uses "id" not "company_id" in policies
-- Ensure is_super_admin exists (in case 00002 wasn't run)

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Drop and recreate companies policies
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;

CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);

-- Allow insert for signup flow (anon before email confirmation, or authenticated after)
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (true);

CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);


-- >>> MIGRATION FILE: 00004_rpc_create_company_with_owner.sql <<<

-- FasoStock — RPC pour créer entreprise + owner + première boutique
-- Évite les problèmes RLS lors de l'inscription (exécuté avec session utilisateur)

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Récupérer le rôle owner
  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  -- Créer l'entreprise
  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  -- Lier l'utilisateur comme owner
  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  -- Créer la première boutique
  INSERT INTO public.stores (company_id, name, code, is_active, is_primary)
  VALUES (v_company_id, p_store_name, NULLIF(TRIM(p_store_code), ''), true, true)
  RETURNING id INTO v_store_id;

  -- Mettre à jour le profil si nécessaire
  INSERT INTO public.profiles (id, full_name, is_super_admin)
  VALUES (v_user_id, NULL, false)
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;


-- >>> MIGRATION FILE: 00005_store_extra_fields.sql <<<

-- FasoStock — Colonnes supplémentaires pour stores (logo, téléphone, email, description)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS description TEXT;


-- >>> MIGRATION FILE: 00006_store_logos_bucket.sql <<<

-- FasoStock — Bucket Storage pour logos de boutiques
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-logos', 'store-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies pour store-logos
DROP POLICY IF EXISTS "store_logos_public_read" ON storage.objects;
CREATE POLICY "store_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "store_logos_authenticated_upload" ON storage.objects;
CREATE POLICY "store_logos_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'store-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "store_logos_authenticated_update" ON storage.objects;
CREATE POLICY "store_logos_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'store-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "store_logos_authenticated_delete" ON storage.objects;
CREATE POLICY "store_logos_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'store-logos' AND auth.role() = 'authenticated');


-- >>> MIGRATION FILE: 00007_product_images_bucket.sql <<<

-- FasoStock — Bucket Storage pour images produits
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_upload" ON storage.objects;
CREATE POLICY "product_images_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "product_images_authenticated_update" ON storage.objects;
CREATE POLICY "product_images_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "product_images_authenticated_delete" ON storage.objects;
CREATE POLICY "product_images_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');


-- >>> MIGRATION FILE: 00008_user_company_roles_is_active.sql <<<

-- Add is_active to user_company_roles so owners can enable/disable access per user.
ALTER TABLE public.user_company_roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_company_roles.is_active IS 'When false, user cannot access this company (owner can reactivate).';

-- Restrict "current companies" to active memberships only (deactivated users lose access).
CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- >>> MIGRATION FILE: 00009_company_ai_predictions_enabled.sql <<<

-- Super admin can enable/disable AI predictions per company.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_predictions_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.ai_predictions_enabled IS 'When false, super admin has disabled AI predictions for this company.';


-- >>> MIGRATION FILE: 00010_admin_delete_policies.sql <<<

-- Allow super_admin to delete companies and stores (definitive removal).
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (is_super_admin());
CREATE POLICY "stores_delete" ON public.stores FOR DELETE USING (is_super_admin());

-- Allow super_admin to see all user_company_roles for admin stats.
DROP POLICY IF EXISTS "user_company_roles_select" ON public.user_company_roles;
CREATE POLICY "user_company_roles_select" ON public.user_company_roles FOR SELECT USING (
  is_super_admin() OR auth.uid() = user_id OR company_id IN (SELECT * FROM current_user_company_ids())
);


-- >>> MIGRATION FILE: 00011_rpc_create_company_with_owner_phone.sql <<<

-- Ajouter le téléphone de la première boutique à l'inscription.
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, NULLIF(TRIM(p_store_code), ''), NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.profiles (id, full_name, is_super_admin)
  VALUES (v_user_id, NULL, false)
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;


-- >>> MIGRATION FILE: 00012_grants_profiles_public.sql <<<

-- Grants explicites pour éviter "Database error querying schema" à la connexion.
-- Le rôle authenticated doit pouvoir lire public.profiles (profil utilisateur dont is_super_admin).

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Profils : lecture et mise à jour pour son propre profil (RLS restreint déjà).
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;


-- >>> MIGRATION FILE: 00013_grants_and_reload_schema.sql <<<

-- Suite à la migration 00012 : droits sur les tables utilisées juste après connexion.
-- Si l'erreur persiste, exécutez aussi supabase/troubleshoot_schema_error.sql
-- puis dans le SQL Editor : NOTIFY pgrst, 'reload schema';

GRANT SELECT ON public.user_company_roles TO anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.roles TO anon, authenticated;


-- >>> MIGRATION FILE: 00014_rpc_set_super_admin_profile.sql <<<

-- RPC pour créer/mettre à jour un profil avec is_super_admin = true.
-- Utilisée par l'Edge Function create-super-admin (service role).
-- S'exécute en SECURITY DEFINER pour contourner les politiques RLS sur profiles.

CREATE OR REPLACE FUNCTION public.set_super_admin_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(TRIM(p_full_name), ''), 'Super Admin'),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), profiles.full_name),
    is_super_admin = true,
    updated_at = now();
END;
$$;

-- Rôle service_role doit pouvoir appeler la RPC (Supabase l’utilise pour les Edge Functions)
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO anon;


-- >>> MIGRATION FILE: 00015_admin_list_users.sql <<<

-- Liste des utilisateurs pour l’admin plateforme (id, email, full_name, company_names).
-- S’exécute en SECURITY DEFINER pour pouvoir lire auth.users.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_super_admin boolean,
  company_names text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.is_super_admin,
    COALESCE(
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS company_names
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_company_roles ucr ON ucr.user_id = p.id
  LEFT JOIN public.companies c ON c.id = ucr.company_id
  GROUP BY p.id, u.email, p.full_name, p.is_super_admin
  ORDER BY p.full_name NULLS LAST, u.email;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;


-- >>> MIGRATION FILE: 00016_admin_user_management.sql <<<

-- Gestion des utilisateurs par le super admin : mise à jour profil, affectation entreprises.

-- Mettre à jour le profil d'un utilisateur (full_name, is_super_admin). Réservé au super admin.
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_is_super_admin boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  UPDATE public.profiles
  SET
    full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
    is_super_admin = COALESCE(p_is_super_admin, is_super_admin),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Retourne les company_id auxquelles l'utilisateur est rattaché.
CREATE OR REPLACE FUNCTION public.admin_get_user_company_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(company_id) FILTER (WHERE company_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.user_company_roles
  WHERE user_id = p_user_id;
$$;

-- Remplace les affectations entreprises d'un utilisateur. p_role_slug par défaut : store_manager.
CREATE OR REPLACE FUNCTION public.admin_set_user_companies(
  p_user_id uuid,
  p_company_ids uuid[],
  p_role_slug text DEFAULT 'store_manager'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_cid uuid;
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  SELECT id INTO v_role_id FROM public.roles WHERE slug = p_role_slug LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle % introuvable', p_role_slug;
  END IF;
  DELETE FROM public.user_company_roles WHERE user_id = p_user_id;
  IF array_length(p_company_ids, 1) > 0 THEN
    FOREACH v_cid IN ARRAY p_company_ids
    LOOP
      INSERT INTO public.user_company_roles (user_id, company_id, role_id)
      VALUES (p_user_id, v_cid, v_role_id)
      ON CONFLICT (user_id, company_id) DO UPDATE SET role_id = v_role_id;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_company_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_companies(uuid, uuid[], text) TO authenticated;


-- >>> MIGRATION FILE: 00017_admin_disable_delete_user.sql <<<

-- Désactivation et liste admin : is_active sur profiles + RPC.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS 'Si false, le compte est désactivé par un super admin (connexion refusée).';

-- Liste admin : exposer is_active (changement de type de retour → DROP puis CREATE).
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_super_admin boolean,
  is_active boolean,
  company_names text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.is_super_admin,
    COALESCE(p.is_active, true),
    COALESCE(
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS company_names
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_company_roles ucr ON ucr.user_id = p.id
  LEFT JOIN public.companies c ON c.id = ucr.company_id
  GROUP BY p.id, u.email, p.full_name, p.is_super_admin, p.is_active
  ORDER BY p.full_name NULLS LAST, u.email;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;

-- Désactiver ou réactiver un compte (super admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas désactiver votre propre compte';
  END IF;
  UPDATE public.profiles
  SET is_active = p_active, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO service_role;


-- >>> MIGRATION FILE: 00018_landing_chat_messages.sql <<<

-- Messages du chatbot de la landing page (pour analyse admin).

CREATE TABLE public.landing_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_landing_chat_messages_session ON public.landing_chat_messages(session_id);
CREATE INDEX idx_landing_chat_messages_created ON public.landing_chat_messages(created_at DESC);

COMMENT ON TABLE public.landing_chat_messages IS 'Messages du chatbot landing (anon insert, lecture super admin).';

ALTER TABLE public.landing_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anon peut insérer (visiteurs landing).
CREATE POLICY "landing_chat_messages_insert_anon" ON public.landing_chat_messages
  FOR INSERT TO anon WITH CHECK (true);

-- Seul le super admin peut lire.
CREATE POLICY "landing_chat_messages_select_super_admin" ON public.landing_chat_messages
  FOR SELECT TO authenticated USING (is_super_admin());

GRANT INSERT ON public.landing_chat_messages TO anon;
GRANT SELECT ON public.landing_chat_messages TO authenticated;


-- >>> MIGRATION FILE: 00019_platform_settings.sql <<<

-- Paramètres plateforme (super admin uniquement).

CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_settings IS 'Paramètres globaux de la plateforme (nom, contact, options).';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_select_super_admin" ON public.platform_settings
  FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "platform_settings_update_super_admin" ON public.platform_settings
  FOR UPDATE TO authenticated USING (is_super_admin());

CREATE POLICY "platform_settings_insert_super_admin" ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (is_super_admin());

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;

-- Valeurs par défaut optionnelles (clés utilisées par l'app)
INSERT INTO public.platform_settings (key, value) VALUES
  ('platform_name', 'FasoStock'),
  ('contact_email', ''),
  ('contact_phone', ''),
  ('contact_whatsapp', '+226 64 71 20 44'),
  ('registration_enabled', 'true'),
  ('landing_chat_enabled', 'true')
ON CONFLICT (key) DO NOTHING;


-- >>> MIGRATION FILE: 00020_rpc_create_store_auto_code.sql <<<

-- Créer une boutique avec code automatique (B1, B2, B3...).
-- Le code est généré côté serveur, non saisi par l'utilisateur.

CREATE OR REPLACE FUNCTION public.create_store(
  p_company_id uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota int;
  v_count int;
  v_next_num int;
  v_next_code text;
  v_store_id uuid;
  v_store jsonb;
BEGIN
  SELECT store_quota INTO v_quota FROM public.companies WHERE id = p_company_id;
  IF v_quota IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.stores WHERE company_id = p_company_id;
  IF v_count >= v_quota THEN
    RAISE EXCEPTION 'Quota de boutiques atteint (% boutique(s)). Demandez une augmentation.', v_quota;
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^B[0-9]+$' THEN CAST(SUBSTRING(code FROM 2) AS INTEGER) ELSE 0 END
  ), 0) + 1 INTO v_next_num
  FROM public.stores WHERE company_id = p_company_id;
  v_next_code := 'B' || v_next_num::text;

  INSERT INTO public.stores (company_id, name, code, address, phone, email, description, is_primary, is_active)
  VALUES (p_company_id, p_name, v_next_code, p_address, p_phone, p_email, p_description, COALESCE(p_is_primary, false), true)
  RETURNING id INTO v_store_id;

  SELECT to_jsonb(s) INTO v_store
  FROM public.stores s WHERE s.id = v_store_id;

  RETURN v_store;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(uuid, text, text, text, text, text, boolean) TO authenticated;


-- >>> MIGRATION FILE: 00021_stock_min_default_and_company_setting.sql <<<

-- Seuil d'alerte stock : valeur par défaut 5 pour les nouveaux produits
ALTER TABLE public.products
  ALTER COLUMN stock_min SET DEFAULT 5;

COMMENT ON COLUMN public.products.stock_min IS 'Seuil d''alerte stock (défaut 5). En dessous, le produit est considéré en alerte.';


-- >>> MIGRATION FILE: 00022_company_settings_updated_at.sql <<<

-- company_settings avait un trigger set_updated_at mais pas de colonne updated_at,
-- ce qui faisait échouer les UPDATE (dont l'upsert du paramètre seuil d'alerte stock).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.company_settings.updated_at IS 'Défini par le trigger set_updated_at.';


-- >>> MIGRATION FILE: 00023_atomic_stock_and_sale_rpc.sql <<<

-- Opérations atomiques sur le stock pour éviter oversell et race conditions.
-- 1) Création vente avec décrément stock atomique
-- 2) Annulation vente avec restauration stock atomique
-- 3) Ajustement stock atomique

-- Séquence pour numéros de vente uniques (évite collision si deux ventes à la même ms)
CREATE SEQUENCE IF NOT EXISTS public.sale_number_seq;

-- Crée une vente et décrémente le stock de façon atomique. En cas de stock insuffisant, rollback et exception.
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  -- Générer numéro de vente unique
  v_sale_number := 'S-' || nextval('sale_number_seq');

  -- 1) Décrémenter le stock atomiquement pour chaque ligne (évite oversell)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  -- 2) Calculer totaux
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  -- 3) Insertion vente
  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by)
  RETURNING id INTO v_sale_id;

  -- 4) Lignes de vente + mouvements de stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  -- 5) Paiements
  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  RETURN v_sale_id;
END;
$$;

-- Annule une vente et restaure le stock de façon atomique
CREATE OR REPLACE FUNCTION public.cancel_sale_restore_stock(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item record;
  v_row_count int;
BEGIN
  SELECT id, store_id, status INTO v_sale
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente non trouvée';
  END IF;
  IF v_sale.status != 'completed' THEN
    RAISE EXCEPTION 'Vente déjà annulée ou non complétée';
  END IF;

  -- Restaurer le stock pour chaque ligne (atomique: UPDATE quantity = quantity + qty)
  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.store_inventory
    SET quantity = quantity + v_item.quantity,
        updated_at = now()
    WHERE store_id = v_sale.store_id AND product_id = v_item.product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_sale.store_id, v_item.product_id, v_item.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, notes)
    VALUES (v_sale.store_id, v_item.product_id, 'return_in', v_item.quantity, 'sale', p_sale_id, 'Annulation vente');
  END LOOP;

  UPDATE public.sales SET status = 'cancelled' WHERE id = p_sale_id;
END;
$$;

-- Ajustement de stock atomique (évite race entre read et write)
CREATE OR REPLACE FUNCTION public.inventory_adjust_atomic(
  p_store_id uuid,
  p_product_id uuid,
  p_delta int,
  p_reason text,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count int;
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;

  IF p_delta > 0 THEN
    -- Entrée: UPDATE ou INSERT
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (p_store_id, p_product_id, p_delta, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + p_delta,
        updated_at = now();
  ELSE
    -- Sortie: décrémenter seulement si stock suffisant
    UPDATE public.store_inventory
    SET quantity = quantity + p_delta,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = p_product_id
      AND quantity >= -p_delta;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour cet ajustement (delta: %)', p_delta;
    END IF;
  END IF;

  INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
  VALUES (p_store_id, p_product_id, 'adjustment', p_delta, NULL, NULL, p_created_by, COALESCE(p_reason, 'Ajustement manuel'));
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_stock IS 'Crée une vente et décrémente le stock de façon atomique. Évite oversell en concurrence.';
COMMENT ON FUNCTION public.cancel_sale_restore_stock IS 'Annule une vente et restaure le stock atomiquement.';
COMMENT ON FUNCTION public.inventory_adjust_atomic IS 'Ajuste le stock de façon atomique (évite race read/write).';

GRANT EXECUTE ON FUNCTION public.create_sale_with_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_restore_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_adjust_atomic TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sale_number_seq TO authenticated;

-- Activer Realtime sur store_inventory pour que les vues (Stock, POS) se rafraîchissent quand le stock change.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_inventory;
EXCEPTION
  WHEN OTHERS THEN NULL;  -- ignorer si déjà dans la publication ou publication absente
END $$;


-- >>> MIGRATION FILE: 00024_confirm_purchase_atomic.sql <<<

-- Confirmation d'achat avec entrée de stock atomique (évite race en concurrence).
CREATE OR REPLACE FUNCTION public.confirm_purchase_with_stock(
  p_purchase_id uuid,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase record;
  v_item record;
BEGIN
  -- Verrouiller la ligne achat et vérifier qu'elle est en brouillon
  SELECT id, store_id, status INTO v_purchase
  FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Achat non trouvé';
  END IF;
  IF v_purchase.status != 'draft' THEN
    RAISE EXCEPTION 'Achat déjà confirmé ou annulé';
  END IF;

  -- Pour chaque ligne : entrée de stock atomique (INSERT ou UPDATE quantity = quantity + qty)
  FOR v_item IN
    SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = p_purchase_id
  LOOP
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (v_purchase.store_id, v_item.product_id, v_item.quantity, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + v_item.quantity,
        updated_at = now();

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_purchase.store_id, v_item.product_id, 'purchase_in', v_item.quantity, 'purchase', p_purchase_id, p_created_by, NULL);
  END LOOP;

  UPDATE public.purchases SET status = 'received' WHERE id = p_purchase_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_purchase_with_stock IS 'Confirme un achat (brouillon) et enregistre les entrées de stock de façon atomique.';

GRANT EXECUTE ON FUNCTION public.confirm_purchase_with_stock TO authenticated;


-- >>> MIGRATION FILE: 00025_grants_stores.sql <<<

-- Align with 00013: explicit SELECT on stores so authenticated users can list stores.
-- Without this, some setups may deny access to stores (empty list after login).
GRANT SELECT ON public.stores TO anon, authenticated;


-- >>> MIGRATION FILE: 00026_rpc_get_my_permission_keys.sql <<<

-- RPC: retourne la liste des clés de permissions de l'utilisateur courant pour une entreprise.
-- Utilisé par le frontend (usePermissions) pour afficher/masquer menus et actions selon le rôle.
CREATE OR REPLACE FUNCTION public.get_my_permission_keys(p_company_id UUID)
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = auth.uid()
    AND ucr.company_id = p_company_id
    AND ucr.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_permission_keys(uuid) TO authenticated;


-- >>> MIGRATION FILE: 00027_stores_pos_discount_enabled.sql <<<

-- Option par boutique : activer la remise en caisse (POS). Par défaut désactivé.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pos_discount_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.pos_discount_enabled IS 'When true, the POS cart shows a discount (remise) field for this store.';


-- >>> MIGRATION FILE: 00028_fix_first_store_code_b1.sql <<<

-- Première boutique créée à l'inscription : attribuer le code B1 par défaut (au lieu de NULL).
-- Ainsi create_store génèrera B2, B3... pour les boutiques suivantes.
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_store_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  -- Première boutique : code B1 par défaut si non fourni (cohérent avec create_store B1, B2, ...)
  v_store_code := COALESCE(NULLIF(TRIM(p_store_code), ''), 'B1');

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, v_store_code, NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.profiles (id, full_name, is_super_admin)
  VALUES (v_user_id, NULL, false)
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;

-- Optionnel : mettre à jour les boutiques existantes qui ont code NULL en B1 (une seule par entreprise)
UPDATE public.stores s
SET code = 'B1'
WHERE s.code IS NULL
  AND (SELECT COUNT(*) FROM public.stores s2 WHERE s2.company_id = s.company_id) = 1;


-- >>> MIGRATION FILE: 00029_create_store_check_company_access.sql <<<

-- Sécurité : create_store ne doit créer une boutique que pour une entreprise à laquelle l'utilisateur appartient.
CREATE OR REPLACE FUNCTION public.create_store(
  p_company_id uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota int;
  v_count int;
  v_next_num int;
  v_next_code text;
  v_store_id uuid;
  v_store jsonb;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;

  SELECT store_quota INTO v_quota FROM public.companies WHERE id = p_company_id;
  IF v_quota IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.stores WHERE company_id = p_company_id;
  IF v_count >= v_quota THEN
    RAISE EXCEPTION 'Quota de boutiques atteint (% boutique(s)). Demandez une augmentation.', v_quota;
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^B[0-9]+$' THEN CAST(SUBSTRING(code FROM 2) AS INTEGER) ELSE 0 END
  ), 0) + 1 INTO v_next_num
  FROM public.stores WHERE company_id = p_company_id;
  v_next_code := 'B' || v_next_num::text;

  INSERT INTO public.stores (company_id, name, code, address, phone, email, description, is_primary, is_active)
  VALUES (p_company_id, p_name, v_next_code, p_address, p_phone, p_email, p_description, COALESCE(p_is_primary, false), true)
  RETURNING id INTO v_store_id;

  SELECT to_jsonb(s) INTO v_store
  FROM public.stores s WHERE s.id = v_store_id;

  RETURN v_store;
END;
$$;


-- >>> MIGRATION FILE: 00030_stores_and_members_owner_scope.sql <<<

-- 1) Stores : un utilisateur ne voit que les boutiques auxquelles il est assigné (ou toutes si owner/manager).
--    Avant : tout membre de l'entreprise voyait toutes les boutiques.
DROP POLICY IF EXISTS "stores_select" ON public.stores;
CREATE POLICY "stores_select" ON public.stores FOR SELECT USING (
  is_super_admin() OR id IN (SELECT * FROM public.current_user_store_ids(company_id))
);

-- 2) user_company_roles DELETE : seul le propriétaire (owner) peut retirer un membre, et ne peut pas se retirer lui-même.
DROP POLICY IF EXISTS "user_company_roles_delete" ON public.user_company_roles;
CREATE POLICY "user_company_roles_delete" ON public.user_company_roles FOR DELETE USING (
  user_id <> auth.uid()
  AND company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = user_company_roles.company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  )
);

-- 3) RPC : retirer un membre de l'entreprise (supprime ses assignations boutique puis son rôle). Réservé au owner.
CREATE OR REPLACE FUNCTION public.remove_company_member(p_ucr_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_is_owner boolean;
BEGIN
  SELECT user_id, company_id INTO v_row
  FROM public.user_company_roles
  WHERE id = p_ucr_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable.';
  END IF;
  IF v_row.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous retirer vous-même.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_row.company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut retirer un membre.';
  END IF;
  DELETE FROM public.user_store_assignments
  WHERE user_id = v_row.user_id AND company_id = v_row.company_id;
  DELETE FROM public.user_company_roles WHERE id = p_ucr_id;
END;
$$;

COMMENT ON FUNCTION public.remove_company_member(uuid) IS 'Retire un membre de l''entreprise (owner uniquement). Supprime ses assignations boutique puis son rôle.';
GRANT EXECUTE ON FUNCTION public.remove_company_member(uuid) TO authenticated;


-- >>> MIGRATION FILE: 00031_fix_register_profile_is_active.sql <<<

-- Fix: les comptes créés à l'inscription doivent avoir is_active = true.
-- Le RPC create_company_with_owner crée/met à jour le profil : on force is_active = true explicitement.

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_store_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  v_store_code := COALESCE(NULLIF(TRIM(p_store_code), ''), 'B1');

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, v_store_code, NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  -- Nouveau profil à l'inscription : is_active = true obligatoire
  INSERT INTO public.profiles (id, full_name, is_super_admin, is_active)
  VALUES (v_user_id, NULL, false, true)
  ON CONFLICT (id) DO UPDATE SET updated_at = now(), is_active = true;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;


-- >>> MIGRATION FILE: 00031_register_profile_is_active.sql <<<

-- À l'inscription (create_company_with_owner), garantir is_active = true pour le nouveau profil.
-- Évite que les comptes créés par inscription soient considérés désactivés.
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_store_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  v_store_code := COALESCE(NULLIF(TRIM(p_store_code), ''), 'B1');

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, v_store_code, NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  -- Toujours activer le profil à l'inscription (is_active = true).
  INSERT INTO public.profiles (id, full_name, is_super_admin, is_active)
  VALUES (v_user_id, NULL, false, true)
  ON CONFLICT (id) DO UPDATE SET updated_at = now(), is_active = true;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;


-- >>> MIGRATION FILE: 00032_rpc_get_my_role_slug.sql <<<

-- RPC: retourne le slug du rôle de l'utilisateur courant pour une entreprise.
-- Permet à l'app d'afficher "Utilisateurs" aux owners même si role_permissions ne leur donne pas users.manage.
CREATE OR REPLACE FUNCTION public.get_my_role_slug(p_company_id UUID)
RETURNS TEXT AS $$
  SELECT r.slug
  FROM public.user_company_roles ucr
  JOIN public.roles r ON r.id = ucr.role_id
  WHERE ucr.user_id = auth.uid()
    AND ucr.company_id = p_company_id
    AND ucr.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_role_slug(uuid) TO authenticated;


-- >>> MIGRATION FILE: 00033_current_user_store_ids_owner_only.sql <<<

-- Seul le propriétaire (owner) voit toutes les boutiques ; les autres rôles ne voient que les boutiques auxquelles ils sont assignés.
-- Avant : owner, manager et super_admin voyaient tout. Désormais : uniquement owner et super_admin.
CREATE OR REPLACE FUNCTION public.current_user_store_ids(p_company_id UUID)
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.stores s
  WHERE s.company_id = p_company_id
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
        AND ucr.is_active = true
        AND r.slug = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_store_assignments ua
      WHERE ua.user_id = auth.uid() AND ua.store_id = s.id AND ua.company_id = p_company_id
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.current_user_store_ids(uuid) IS 'Store IDs the user can access: super_admin and owner see all; others only their assigned stores (user_store_assignments).';


-- >>> MIGRATION FILE: 00034_cashier_permissions_restrict.sql <<<

-- Caissier : ne garder que sales.create (Ventes). Retirer reports.view_store et cash.open_close.
-- Il ne voit que : Ventes, Produits, Clients, Stock (lecture seule) — géré côté app (nav + redirect).
DELETE FROM public.role_permissions
WHERE role_id = (SELECT id FROM public.roles WHERE slug = 'cashier')
  AND permission_id IN (SELECT id FROM public.permissions WHERE key IN ('reports.view_store', 'cash.open_close'));


-- >>> MIGRATION FILE: 00035_role_permissions_full_matrix.sql <<<

-- Matrice complète des rôles : Manager, Store Manager, Magasinier, Caissier, Comptable, Lecture seule.
-- Ne modifie pas super_admin ni owner.

DELETE FROM public.role_permissions
WHERE role_id IN (SELECT id FROM public.roles WHERE slug IN ('manager', 'store_manager', 'stock_manager', 'cashier', 'accountant', 'viewer'));

-- Manager : produits, ventes, stock, achats, rapports ; pas utilisateurs, paramètres, créer boutiques, IA
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_global', 'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Store Manager : comme Manager mais rapports boutique uniquement
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Magasinier : stock (ajuster, transfert)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key IN ('stock.adjust', 'stock.transfer')
ON CONFLICT DO NOTHING;

-- Caissier : ventes (caisse)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier' AND p.key IN ('sales.create')
ON CONFLICT DO NOTHING;

-- Comptable : rapports et audit (accès ventes/achats/clients/fournisseurs géré par rôle dans l'app)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant' AND p.key IN ('reports.view_global', 'reports.view_store', 'audit.view')
ON CONFLICT DO NOTHING;

-- Lecture seule : rapports (accès produits/stock/clients en lecture géré par rôle dans l'app)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer' AND p.key IN ('reports.view_global', 'reports.view_store')
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00036_login_attempt_tracking.sql <<<

-- Blocage après 5 tentatives de connexion. Le super_admin peut débloquer dans son espace.

CREATE TABLE IF NOT EXISTS public.login_attempt_tracking (
  email_lower text PRIMARY KEY,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_attempt_tracking IS 'Suivi des échecs de connexion : après 5 tentatives le compte est bloqué jusqu''à déblocage par super_admin.';

-- Enregistrer un échec de connexion (appelé par le client après un signInWithPassword échoué).
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_attempts int;
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.login_attempt_tracking (email_lower, failed_attempts, locked_at, updated_at)
  VALUES (v_email, 1, NULL, now())
  ON CONFLICT (email_lower) DO UPDATE SET
    failed_attempts = LEAST(login_attempt_tracking.failed_attempts + 1, 5),
    locked_at = CASE
      WHEN login_attempt_tracking.failed_attempts + 1 >= 5 THEN now()
      ELSE login_attempt_tracking.locked_at
    END,
    updated_at = now();
END;
$$;

-- Statut de verrouillage pour un email (avant ou après tentative).
CREATE OR REPLACE FUNCTION public.get_login_lock_status(p_email text)
RETURNS TABLE (locked boolean, failed_attempts int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT lat.locked_at IS NOT NULL FROM public.login_attempt_tracking lat WHERE lat.email_lower = lower(trim(p_email))), false),
    COALESCE((SELECT lat.failed_attempts FROM public.login_attempt_tracking lat WHERE lat.email_lower = lower(trim(p_email))), 0);
$$;

-- Réinitialiser les tentatives après une connexion réussie (utilisateur authentifié, pour son propre email).
CREATE OR REPLACE FUNCTION public.reset_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(email::text) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM public.login_attempt_tracking WHERE email_lower = v_email;
  END IF;
END;
$$;

-- Liste des comptes bloqués (super_admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_list_locked_logins()
RETURNS TABLE (email_lower text, failed_attempts int, locked_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lat.email_lower, lat.failed_attempts, lat.locked_at
  FROM public.login_attempt_tracking lat
  WHERE lat.locked_at IS NOT NULL
  ORDER BY lat.locked_at DESC;
$$;

-- Débloquer un compte (super_admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_unlock_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  UPDATE public.login_attempt_tracking
  SET failed_attempts = 0, locked_at = NULL, updated_at = now()
  WHERE email_lower = lower(trim(p_email));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_lock_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_locked_logins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_login(text) TO authenticated;


-- >>> MIGRATION FILE: 00037_profiles_select_same_company.sql <<<

-- Permettre de lire le profil (full_name) des utilisateurs de la même entreprise,
-- pour afficher "Vente par X" dans le détail d'une vente.
CREATE POLICY "profiles_select_same_company" ON public.profiles FOR SELECT USING (
  id IN (
    SELECT ucr.user_id FROM public.user_company_roles ucr
    WHERE ucr.company_id IN (SELECT * FROM current_user_company_ids())
      AND ucr.is_active = true
  )
);


-- >>> MIGRATION FILE: 00038_user_permission_overrides.sql <<<

-- Gestion des droits par l'owner : surcharge des permissions par utilisateur (ajout/retrait).
-- Les permissions effectives = rôle de base + overrides (granted=true ajoute, granted=false retire).

CREATE TABLE public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, permission_id)
);

COMMENT ON TABLE public.user_permission_overrides IS 'Surcharges de permissions par utilisateur (owner peut ajouter ou retirer des droits).';
COMMENT ON COLUMN public.user_permission_overrides.granted IS 'true = ajouter la permission, false = retirer (par rapport au rôle).';

CREATE INDEX idx_user_permission_overrides_user_company ON public.user_permission_overrides(user_id, company_id);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Seul l''owner de l''entreprise peut gérer les overrides (via RPC en SECURITY DEFINER ; la table peut rester sans policy SELECT pour les utilisateurs normaux).
CREATE POLICY "user_permission_overrides_owner_only" ON public.user_permission_overrides
FOR ALL USING (
  company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.is_active = true AND r.slug = 'owner'
  )
)
WITH CHECK (
  company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.is_active = true AND r.slug = 'owner'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;

-- RPC : liste des clés de permissions effectives d'un utilisateur (rôle + overrides). Appelable par l'owner uniquement.
CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_from_role TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
  v_result TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un utilisateur.';
  END IF;

  -- Permissions issues du rôle
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  -- Overrides : ajouts (granted = true)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  -- Overrides : retraits (granted = false)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  -- Résultat = (rôle + grants) - revokes, sans doublons
  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes)
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS 'Retourne les clés de permissions effectives d''un utilisateur (rôle + overrides). Owner uniquement.';

GRANT EXECUTE ON FUNCTION public.get_user_permission_keys(uuid, uuid) TO authenticated;

-- RPC : définir une surcharge (ajouter ou retirer une permission pour un utilisateur). Owner uniquement.
CREATE OR REPLACE FUNCTION public.set_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT,
  p_granted BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_permission_id UUID;
  v_member_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un utilisateur.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Permission inconnue : %.', p_permission_key;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted)
  VALUES (p_user_id, p_company_id, v_permission_id, p_granted)
  ON CONFLICT (user_id, company_id, permission_id)
  DO UPDATE SET granted = EXCLUDED.granted, id = public.user_permission_overrides.id;
END;
$$;

COMMENT ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) IS 'Ajoute (p_granted=true) ou retire (p_granted=false) une permission pour un utilisateur. Owner uniquement.';

GRANT EXECUTE ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) TO authenticated;

-- RPC : supprimer une surcharge (réinitialiser à la valeur du rôle).
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_permission_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.user_permission_overrides
  WHERE user_id = p_user_id AND company_id = p_company_id AND permission_id = v_permission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, uuid, text) TO authenticated;


-- >>> MIGRATION FILE: 00039_get_my_permission_keys_with_overrides.sql <<<

-- Appliquer les overrides de permissions à get_my_permission_keys (droits effectifs = rôle + granted - revoked).
CREATE OR REPLACE FUNCTION public.get_my_permission_keys(p_company_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_keys AS (
    SELECT p.key
    FROM public.user_company_roles ucr
    JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
  ),
  granted AS (
    SELECT p.key
    FROM public.user_permission_overrides o
    JOIN public.permissions p ON p.id = o.permission_id
    WHERE o.user_id = auth.uid() AND o.company_id = p_company_id AND o.granted = true
  ),
  revoked AS (
    SELECT p.key
    FROM public.user_permission_overrides o
    JOIN public.permissions p ON p.id = o.permission_id
    WHERE o.user_id = auth.uid() AND o.company_id = p_company_id AND o.granted = false
  ),
  combined AS (
    SELECT key FROM role_keys
    UNION
    SELECT key FROM granted
    EXCEPT
    SELECT key FROM revoked
  )
  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::TEXT[]) FROM combined;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permission_keys(uuid) TO authenticated;


-- >>> MIGRATION FILE: 00040_get_user_permission_keys_require_member.sql <<<

-- Exiger que l'utilisateur cible soit membre de l'entreprise dans get_user_permission_keys (cohérence avec set_user_permission_override).
CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_member_exists boolean;
  v_from_role TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
  v_result TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un utilisateur.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  -- Permissions issues du rôle
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  -- Overrides : ajouts (granted = true)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  -- Overrides : retraits (granted = false)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  -- Résultat = (rôle + grants) - revokes, sans doublons
  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes) AS k
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS 'Retourne les clés de permissions effectives d''un utilisateur (rôle + overrides). Owner uniquement. L''utilisateur cible doit être membre de l''entreprise.';


-- >>> MIGRATION FILE: 00041_transfer_ship_receive_atomic.sql <<<

-- Expédition et réception des transferts de stock (atomiques + stock_movements).

-- Expédition : draft ou approved → shipped. Décrémente le stock de la boutique d'origine.
CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
  v_available int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Seuls les transferts en brouillon ou approuvés peuvent être expédiés (statut actuel: %)', v_transfer.status;
  END IF;
  IF v_transfer.from_store_id = v_transfer.to_store_id THEN
    RAISE EXCEPTION 'Boutique origine et destination identiques';
  END IF;

  FOR v_item IN
    SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
    FROM public.stock_transfer_items sti
    JOIN public.products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_available
    FROM public.store_inventory si
    WHERE si.store_id = v_transfer.from_store_id AND si.product_id = v_item.product_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_item.quantity_requested THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%" (demandé: %, disponible: %)',
        v_product_name, v_item.quantity_requested, COALESCE(v_available, 0);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_item.quantity_requested,
        updated_at = now()
    WHERE store_id = v_transfer.from_store_id AND product_id = v_item.product_id;

    IF NOT FOUND THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%"', v_product_name;
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.from_store_id, v_item.product_id, 'transfer_out', v_item.quantity_requested, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_shipped = v_item.quantity_requested
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'shipped',
      shipped_at = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.ship_transfer IS 'Expédie un transfert : décrémente le stock de la boutique d''origine et enregistre les sorties (transfer_out).';

-- Réception : shipped → received. Incrémente le stock de la boutique de destination.
CREATE OR REPLACE FUNCTION public.receive_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
BEGIN
  SELECT id, to_store_id, status
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status != 'shipped' THEN
    RAISE EXCEPTION 'Seuls les transferts expédiés peuvent être réceptionnés (statut actuel: %)', v_transfer.status;
  END IF;

  FOR v_item IN
    SELECT id, product_id, quantity_shipped
    FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND quantity_shipped > 0
  LOOP
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (v_transfer.to_store_id, v_item.product_id, v_item.quantity_shipped, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + v_item.quantity_shipped,
        updated_at = now();

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.to_store_id, v_item.product_id, 'transfer_in', v_item.quantity_shipped, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_received = v_item.quantity_shipped
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      received_by = p_user_id,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.receive_transfer IS 'Réceptionne un transfert : incrémente le stock de la boutique de destination et enregistre les entrées (transfer_in).';

GRANT EXECUTE ON FUNCTION public.ship_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_transfer TO authenticated;


-- >>> MIGRATION FILE: 00042_create_sale_check_store_access.sql <<<

-- Sécurité multi-tenant : create_sale_with_stock doit vérifier que l'utilisateur a accès à la boutique.
-- (RPC en SECURITY DEFINER, donc RLS ne s'applique pas à l'intérieur de la fonction.)
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : créateur de la vente invalide';
  END IF;

  -- Générer numéro de vente unique
  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  -- 1) Décrémenter le stock atomiquement pour chaque ligne (évite oversell)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  -- 2) Calculer totaux
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  -- 3) Insertion vente
  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by)
  RETURNING id INTO v_sale_id;

  -- 4) Lignes de vente + mouvements de stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  -- 5) Paiements
  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_stock(uuid, uuid, uuid, uuid, jsonb, jsonb, decimal) IS 'Crée une vente et décrémente le stock de façon atomique. Vérifie accès entreprise et boutique (multi-tenant).';


-- >>> MIGRATION FILE: 00043_sale_mode_document_type_and_store_invoice.sql <<<

-- Dual-POS : type de vente et type de document (ticket thermique vs facture A4).
-- + Colonnes personnalisation facture A4 sur stores.

-- Enums
DO $$ BEGIN
  CREATE TYPE public.sale_mode AS ENUM ('quick_pos', 'invoice_pos');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_type AS ENUM ('thermal_receipt', 'a4_invoice');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Sales : mode et type de document (défaut = caisse rapide / ticket thermique pour l'existant)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_mode public.sale_mode NOT NULL DEFAULT 'quick_pos',
  ADD COLUMN IF NOT EXISTS document_type public.document_type NOT NULL DEFAULT 'thermal_receipt';

COMMENT ON COLUMN public.sales.sale_mode IS 'quick_pos = caisse rapide, invoice_pos = vente détaillée facture A4';
COMMENT ON COLUMN public.sales.document_type IS 'thermal_receipt = ticket thermique, a4_invoice = facture A4';

-- Stores : personnalisation facture A4 (logo, couleurs, mentions légales, etc.)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'FAC',
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS legal_info TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS tax_label TEXT,
  ADD COLUMN IF NOT EXISTS tax_number TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS commercial_name TEXT,
  ADD COLUMN IF NOT EXISTS slogan TEXT;

COMMENT ON COLUMN public.stores.invoice_prefix IS 'Préfixe numérotation factures (ex: FAC, INV)';
COMMENT ON COLUMN public.stores.primary_color IS 'Couleur principale (hex) pour en-tête facture';
COMMENT ON COLUMN public.stores.signature_url IS 'URL image signature pour facture A4';
COMMENT ON COLUMN public.stores.stamp_url IS 'URL image cachet pour facture A4';


-- >>> MIGRATION FILE: 00044_create_sale_with_stock_sale_mode.sql <<<

-- Dual-POS : étendre create_sale_with_stock pour enregistrer sale_mode et document_type.
-- Paramètres optionnels (défaut quick_pos / thermal_receipt) pour ne pas casser les appels existants.
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : créateur de la vente invalide';
  END IF;

  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, sale_mode, document_type)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by, COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode), COALESCE(p_document_type, 'thermal_receipt'::public.document_type))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_stock(uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type) IS 'Crée une vente et décrémente le stock. Paramètres sale_mode (quick_pos|invoice_pos) et document_type (thermal_receipt|a4_invoice) pour dual-POS.';


-- >>> MIGRATION FILE: 00045_stores_invoice_short_title.sql <<<

-- Titre court / acronyme affiché en tête de la facture A4 (ex. E L O F)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_short_title TEXT;

COMMENT ON COLUMN public.stores.invoice_short_title IS 'Titre court ou acronyme affiché en haut à droite sur la facture A4 (ex. E L O F)';


-- >>> MIGRATION FILE: 00046_stores_invoice_signer.sql <<<

-- Bloc signataire en bas de la dernière page de la facture A4 (titre + nom ; signature et cachet à la main)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_signer_title TEXT,
  ADD COLUMN IF NOT EXISTS invoice_signer_name TEXT;

COMMENT ON COLUMN public.stores.invoice_signer_title IS 'Titre du signataire affiché en bas de la facture A4 (ex. Directeur General)';
COMMENT ON COLUMN public.stores.invoice_signer_name IS 'Nom du signataire affiché sous le titre (ex. M. MAHAMADI ELOF)';


-- >>> MIGRATION FILE: 00047_new_permissions_and_invoice_a4.sql <<<

-- Nouveaux droits que l'owner peut accorder + droit factures A4.
-- Tous insérés dans public.permissions ; owner reçoit tout (sauf stores.approve_extra déjà exclu).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'dashboard.view'),
  (uuid_generate_v4(), 'products.view'),
  (uuid_generate_v4(), 'sales.view'),
  (uuid_generate_v4(), 'purchases.view'),
  (uuid_generate_v4(), 'stock.view'),
  (uuid_generate_v4(), 'customers.view'),
  (uuid_generate_v4(), 'customers.manage'),
  (uuid_generate_v4(), 'suppliers.view'),
  (uuid_generate_v4(), 'suppliers.manage'),
  (uuid_generate_v4(), 'stores.view'),
  (uuid_generate_v4(), 'cash.view'),
  (uuid_generate_v4(), 'products.import'),
  (uuid_generate_v4(), 'transfers.create'),
  (uuid_generate_v4(), 'transfers.approve'),
  (uuid_generate_v4(), 'purchases.cancel'),
  (uuid_generate_v4(), 'sales.invoice_a4')
ON CONFLICT (key) DO NOTHING;

-- Owner : ajouter tous les nouveaux droits (owner a déjà les anciens via seed ; on lie les nouveaux).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN (
    'dashboard.view', 'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Manager : droits de vue + facture A4 + import + transferts. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Store Manager : idem manager. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Magasinier : vues stock + produits + transferts (create + approve).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager'
  AND p.key IN ('stock.view', 'products.view', 'transfers.create', 'transfers.approve')
ON CONFLICT DO NOTHING;

-- Caissier : ventes + vues produits/clients/stock pour le menu (nav 100 % permission-based).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier'
  AND p.key IN ('sales.view', 'sales.create', 'products.view', 'customers.view', 'stock.view')
ON CONFLICT DO NOTHING;

-- Comptable : vues pour rapports et audit.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant'
  AND p.key IN (
    'dashboard.view', 'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'suppliers.view', 'stores.view', 'cash.view'
  )
ON CONFLICT DO NOTHING;

-- Lecture seule : vues uniquement. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'suppliers.view', 'stores.view'
  )
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.permissions IS 'Clés de permission : owner peut accorder/retirer via user_permission_overrides.';


-- >>> MIGRATION FILE: 00048_dashboard_view_owner_only_by_default.sql <<<

-- Par défaut seul l'owner a dashboard.view ; les autres rôles ne l'ont pas (l'owner peut l'accorder à qui il veut).
-- Retire dashboard.view des rôles manager, store_manager, accountant, viewer pour les bases ayant déjà exécuté 00047.
DELETE FROM public.role_permissions
WHERE permission_id = (SELECT id FROM public.permissions WHERE key = 'dashboard.view' LIMIT 1)
  AND role_id IN (SELECT id FROM public.roles WHERE slug IN ('manager', 'store_manager', 'accountant', 'viewer'));


-- >>> MIGRATION FILE: 00049_cashier_view_permissions.sql <<<

-- Caissier : doit voir Produits, Clients et Stock (alertes) pour le menu ; nav est 100 % permission-based.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier'
  AND p.key IN ('products.view', 'customers.view', 'stock.view')
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00050_purchases_update_delete_permissions.sql <<<

-- Droits pour modifier et supprimer des achats (brouillons). Owner les reçoit.
INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'purchases.update'),
  (uuid_generate_v4(), 'purchases.delete')
ON CONFLICT (key) DO NOTHING;

-- Owner : ajouter les nouveaux droits achats.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN ('purchases.update', 'purchases.delete')
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00051_stores_activity.sql <<<

-- Champ "Activité" (secteur d'activité) pour la facture A4, affiché après le slogan.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS activity TEXT;

COMMENT ON COLUMN public.stores.activity IS 'Secteur d''activité / Activité (affiché sur la facture A4 après le slogan)';


-- >>> MIGRATION FILE: 00052_stores_mobile_money.sql <<<

-- Champ "Mobile money" (optionnel) pour la facture A4, affiché après Activité.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS mobile_money TEXT;

COMMENT ON COLUMN public.stores.mobile_money IS 'Numéro ou compte Mobile money (affiché sur la facture A4 si renseigné)';


-- >>> MIGRATION FILE: 00053_audit_log_rpc_and_owner.sql <<<

-- Journal d'audit : droit owner + RPC pour insérer des entrées.
-- Owner doit pouvoir voir l'audit (accordable aussi aux autres via overrides).
INSERT INTO public.permissions (id, key)
SELECT uuid_generate_v4(), 'audit.view'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = 'audit.view');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'audit.view'
ON CONFLICT DO NOTHING;

-- RPC : insérer une entrée d'audit (appelable par tout membre de l'entreprise pour son company_id).
CREATE OR REPLACE FUNCTION public.log_audit(
  p_company_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_action IS NULL OR p_entity_type IS NULL THEN
    RAISE EXCEPTION 'company_id, action and entity_type are required';
  END IF;
  -- Vérifier que l'utilisateur appartient à l'entreprise
  IF NOT (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND ucr.is_active = true
  )) THEN
    RAISE EXCEPTION 'Access denied: not a member of this company';
  END IF;
  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_company_id, p_store_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old_data, p_new_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) IS 'Enregistre une action dans le journal d''audit (réservé aux membres de l''entreprise).';

GRANT EXECUTE ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) TO authenticated;

-- Politique SELECT : seuls les utilisateurs avec audit.view voient les logs de leur entreprise.
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT USING (
  is_super_admin()
  OR (
    company_id IS NOT NULL
    AND company_id IN (SELECT * FROM current_user_company_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        JOIN public.roles r ON r.id = ucr.role_id
        WHERE ucr.user_id = auth.uid() AND ucr.company_id = audit_logs.company_id AND ucr.is_active = true
        AND r.slug = 'owner'
      )
      OR 'audit.view' = ANY (public.get_my_permission_keys(company_id))
    )
  )
);


-- >>> MIGRATION FILE: 00054_audit_triggers_sales_products.sql <<<

-- Triggers pour alimenter le journal d'audit automatiquement (ventes et produits).
CREATE OR REPLACE FUNCTION public.audit_trigger_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    NEW.company_id,
    NEW.store_id,
    COALESCE(NEW.created_by, auth.uid()),
    'sale.create',
    'sale',
    NEW.id,
    jsonb_build_object('sale_number', NEW.sale_number, 'total', NEW.total, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_after_sale_insert ON public.sales;
CREATE TRIGGER audit_after_sale_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_sale();

-- Produits : création, modification, suppression (soft delete via deleted_at ou hard delete).
CREATE OR REPLACE FUNCTION public.audit_trigger_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
      NEW.company_id,
      auth.uid(),
      'product.create',
      'product',
      NEW.id,
      jsonb_build_object('name', NEW.name, 'sku', NEW.sku)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.company_id,
      auth.uid(),
      CASE WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN 'product.delete' ELSE 'product.update' END,
      'product',
      NEW.id,
      jsonb_build_object('name', OLD.name, 'sku', OLD.sku),
      jsonb_build_object('name', NEW.name, 'sku', NEW.sku)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data)
    VALUES (
      OLD.company_id,
      auth.uid(),
      'product.delete',
      'product',
      OLD.id,
      jsonb_build_object('name', OLD.name, 'sku', OLD.sku)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_after_product_insert ON public.products;
DROP TRIGGER IF EXISTS audit_after_product_update ON public.products;
DROP TRIGGER IF EXISTS audit_after_product_delete ON public.products;
CREATE TRIGGER audit_after_product_insert AFTER INSERT ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();
CREATE TRIGGER audit_after_product_update AFTER UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();
CREATE TRIGGER audit_after_product_delete AFTER DELETE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();


-- >>> MIGRATION FILE: 00055_subscription_plans_and_company_subscriptions.sql <<<

-- Plans d'abonnement et abonnements par entreprise (base pour Stripe).
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  max_stores INTEGER, -- NULL = illimité
  max_users INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company ON public.company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_stripe ON public.company_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

-- Lecture des plans : tout authentifié.
CREATE POLICY "subscription_plans_select" ON public.subscription_plans FOR SELECT TO authenticated USING (is_active = true);

-- Lecture abonnement : uniquement les membres de l'entreprise (ou super_admin).
CREATE POLICY "company_subscriptions_select" ON public.company_subscriptions FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- Insert/Update abonnement : réservé au backend (service role) ou super_admin.
CREATE POLICY "company_subscriptions_insert" ON public.company_subscriptions FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "company_subscriptions_update" ON public.company_subscriptions FOR UPDATE USING (is_super_admin());

COMMENT ON TABLE public.subscription_plans IS 'Plans d''abonnement (ex. Starter, Pro, Enterprise).';
COMMENT ON TABLE public.company_subscriptions IS 'Abonnement actif par entreprise (lien Stripe optionnel).';

-- Plan gratuit par défaut (pour compatibilité sans Stripe).
INSERT INTO public.subscription_plans (id, slug, name, description, price_cents, currency, interval, max_stores, max_users, is_active)
SELECT uuid_generate_v4(), 'free', 'Gratuit', '1 boutique, utilisateurs limités', 0, 'XOF', 'month', 1, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE slug = 'free');


-- >>> MIGRATION FILE: 00056_api_keys_and_webhooks.sql <<<

-- Clés API et webhooks (API publique, intégrations).
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company ON public.webhook_endpoints(company_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Seul l'owner (ou super_admin) peut gérer les clés et webhooks de son entreprise.
CREATE POLICY "api_keys_select" ON public.api_keys FOR SELECT USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);
CREATE POLICY "api_keys_insert" ON public.api_keys FOR INSERT WITH CHECK (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);
CREATE POLICY "api_keys_delete" ON public.api_keys FOR DELETE USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);

CREATE POLICY "webhook_endpoints_all_owner" ON public.webhook_endpoints FOR ALL USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = webhook_endpoints.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);

COMMENT ON TABLE public.api_keys IS 'Clés API pour accès programme (owner uniquement).';
COMMENT ON TABLE public.webhook_endpoints IS 'URLs de webhook pour événements (vente, stock, etc.).';


-- >>> MIGRATION FILE: 00057_profiles_totp_2fa.sql <<<

-- 2FA (TOTP) pour les owners : secret stocké de manière sécurisée.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.totp_secret_encrypted IS 'Secret TOTP chiffré (2FA). Vide si 2FA désactivé.';
COMMENT ON COLUMN public.profiles.totp_enabled_at IS 'Date d''activation de la 2FA.';


-- >>> MIGRATION FILE: 00058_rpc_create_api_key.sql <<<

-- Extension pour gen_random_bytes et digest (sha256).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- RPC : créer une clé API (owner uniquement). Retourne la clé en clair une seule fois.
CREATE OR REPLACE FUNCTION public.create_api_key(p_company_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner boolean;
  v_key_raw text;
  v_key_prefix text;
  v_key_hash text;
  v_id uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Le nom est requis';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_owner;
  IF NOT v_owner AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  -- Générer une clé (32 octets en hex = 64 caractères)
  v_key_raw := 'fs_' || encode(gen_random_bytes(32), 'hex');
  v_key_prefix := left(v_key_raw, 12);
  v_key_hash := encode(digest(v_key_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (company_id, name, key_prefix, key_hash, created_by)
  VALUES (p_company_id, trim(p_name), v_key_prefix, v_key_hash, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key_raw', v_key_raw, 'key_prefix', v_key_prefix);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_api_key(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_api_key(uuid, text) IS 'Crée une clé API pour l''entreprise (owner). La clé en clair n''est retournée qu''une fois.';


-- >>> MIGRATION FILE: 00059_admin_send_notification.sql <<<

-- Le super admin peut envoyer des notifications aux utilisateurs (ex. owners).
-- Ces notifications s'affichent dans la partie "Notifications" de chaque utilisateur.

-- Envoyer à un utilisateur précis (super admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'admin_message'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_user_id IS NULL OR p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'user_id et title sont requis';
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (p_user_id, COALESCE(NULLIF(trim(p_type), ''), 'admin_message'), trim(p_title), NULLIF(trim(p_body), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_notification(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_create_notification(uuid, text, text, text) IS 'Super admin : envoie une notification à un utilisateur (visible dans son espace Notifications).';

-- Envoyer à tous les owners (un message par owner).
CREATE OR REPLACE FUNCTION public.admin_create_notification_to_owners(
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'admin_message'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_owner_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'title est requis';
  END IF;
  FOR v_owner_id IN
    SELECT DISTINCT ucr.user_id
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE r.slug = 'owner' AND ucr.is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_owner_id, COALESCE(NULLIF(trim(p_type), ''), 'admin_message'), trim(p_title), NULLIF(trim(p_body), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_notification_to_owners(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_create_notification_to_owners(text, text, text) IS 'Super admin : envoie une notification à tous les owners (chaque owner la voit dans Notifications).';


-- >>> MIGRATION FILE: 00060_stores_invoice_template.sql <<<

-- Choix du modèle d'en-tête pour la facture A4 : classique (défaut) ou ELOF (E L O F, ordre fixe, Orange money en orange).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_template TEXT NOT NULL DEFAULT 'classic';

COMMENT ON COLUMN public.stores.invoice_template IS 'Modèle facture A4 : classic = en-tête actuel, elof = en-tête style E L O F (ordre fixe, Orange money en orange)';


-- >>> MIGRATION FILE: 00061_sale_sync_idempotency.sql <<<

-- Idempotence des ventes rejouées depuis la file offline : évite doubles ventes / doubles déstockages
-- si le client retente après timeout alors que le serveur a déjà enregistré la vente.

CREATE TABLE IF NOT EXISTS public.sale_sync_idempotency (
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_sync_idempotency_sale_id ON public.sale_sync_idempotency (sale_id);

ALTER TABLE public.sale_sync_idempotency ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sale_sync_idempotency IS 'Lien idempotence client (UUID par tentative de vente offline) → vente créée. Rempli uniquement par create_sale_with_stock (SECURITY DEFINER).';

DROP FUNCTION IF EXISTS public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type
);

CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt',
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : créateur de la vente invalide';
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT i.sale_id INTO v_sale_id
    FROM public.sale_sync_idempotency i
    WHERE i.company_id = p_company_id
      AND i.client_request_id = p_client_request_id;
    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, sale_mode, document_type)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by, COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode), COALESCE(p_document_type, 'thermal_receipt'::public.document_type))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.sale_sync_idempotency (company_id, client_request_id, sale_id)
    VALUES (p_company_id, p_client_request_id, v_sale_id)
    ON CONFLICT (company_id, client_request_id) DO NOTHING;
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_sale_with_stock(uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid) IS
  'Crée une vente et décrémente le stock. p_client_request_id (UUID stable par tentative offline) garantit l''idempotence au rejouage de la file sync.';


-- >>> MIGRATION FILE: 00072_warehouse_bundle_00062_00068.sql <<<

-- Bundle unique MAGASIN
-- Exécute, dans cet ordre, les migrations:
-- 00062 -> 00063 -> 00064 -> 00065 -> 00066 -> 00067 -> 00068
-- Objectif: base où le module magasin est absent (objets NULL à la vérification).

-- ============================================================================
-- 00062_company_warehouse_inventory.sql
-- ============================================================================
-- Magasin (dépôt central) par entreprise : stock, mouvements, entrées manuelles, sorties liées aux ventes validées.
-- Accès données + RPC réservés au rôle owner actif sur l'entreprise.

CREATE OR REPLACE FUNCTION public.user_is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  );
$$;

COMMENT ON FUNCTION public.user_is_company_owner(uuid) IS 'True si l''utilisateur courant est propriétaire (owner) actif de l''entreprise.';

GRANT EXECUTE ON FUNCTION public.user_is_company_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.warehouse_inventory (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  avg_unit_cost numeric(18,4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id)
);

CREATE INDEX idx_warehouse_inventory_company ON public.warehouse_inventory (company_id);

CREATE TABLE public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_kind text NOT NULL CHECK (movement_kind IN ('entry', 'exit')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4),
  packaging_type text NOT NULL DEFAULT 'unite',
  packs_quantity numeric(12,4) NOT NULL DEFAULT 1 CHECK (packs_quantity > 0),
  reference_type text NOT NULL DEFAULT 'manual',
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warehouse_movements_company_created ON public.warehouse_movements (company_id, created_at DESC);
CREATE INDEX idx_warehouse_movements_company_product ON public.warehouse_movements (company_id, product_id);

COMMENT ON TABLE public.warehouse_inventory IS 'Stock central (magasin) par entreprise — unités catalogue (pièces).';
COMMENT ON TABLE public.warehouse_movements IS 'Historique entrées/sorties dépôt ; sortie vente liée à une vente status completed.';

-- ---------------------------------------------------------------------------
-- RLS : lecture owner uniquement ; pas d''INSERT/UPDATE direct sur inventory (RPC seulement).
-- ---------------------------------------------------------------------------

ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_inventory_select_owner ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

CREATE POLICY warehouse_movements_select_owner ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

GRANT SELECT ON public.warehouse_inventory TO authenticated;
GRANT SELECT ON public.warehouse_movements TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : entrée manuelle (réception au dépôt, conditionnement tracé).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une entrée magasin.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Prix d''achat unitaire invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
  END IF;

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN
    v_old_q := 0;
  END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
  VALUES (p_company_id, p_product_id, p_quantity, v_new_avg, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_manual_entry IS 'Entrée stock magasin (owner) : quantité en unités, conditionnement informatif, CMP mis à jour.';

GRANT EXECUTE ON FUNCTION public.warehouse_register_manual_entry(uuid, uuid, integer, numeric, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : sortie liée à une vente déjà validée (facture / vente complétée).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_wh_q integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin.';
  END IF;

  SELECT id, company_id, status INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable';
  END IF;
  IF v_sale.company_id <> p_company_id THEN
    RAISE EXCEPTION 'La vente n''appartient pas à cette entreprise';
  END IF;
  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'La vente doit être validée (statut complété) pour autoriser une sortie magasin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.company_id = p_company_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_exit_for_sale IS 'Sortie magasin (owner) pour une vente completed ; une seule fois par vente.';

GRANT EXECUTE ON FUNCTION public.warehouse_register_exit_for_sale(uuid, uuid) TO authenticated;

-- ============================================================================
-- 00063_warehouse_thresholds_transfer_from_warehouse.sql
-- ============================================================================
-- Seuils magasin dédiés + transferts boutique depuis le dépôt central (magasin).

ALTER TABLE public.warehouse_inventory
  ADD COLUMN IF NOT EXISTS stock_min_warehouse integer NOT NULL DEFAULT 0
  CHECK (stock_min_warehouse >= 0);

COMMENT ON COLUMN public.warehouse_inventory.stock_min_warehouse IS 'Seuil alerte dépôt ; 0 = recours au stock_min du produit en UI.';

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_warehouse boolean NOT NULL DEFAULT false;

ALTER TABLE public.stock_transfers
  ALTER COLUMN from_store_id DROP NOT NULL;

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_from_source_check;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_from_source_check CHECK (
    (from_warehouse = true AND from_store_id IS NULL)
    OR
    (from_warehouse = false AND from_store_id IS NOT NULL)
  );

COMMENT ON COLUMN public.stock_transfers.from_warehouse IS 'Si true, l''expédition consomme warehouse_inventory au lieu de store_inventory.';

CREATE OR REPLACE FUNCTION public.warehouse_set_stock_min_warehouse(
  p_company_id uuid,
  p_product_id uuid,
  p_min integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut définir les seuils magasin.';
  END IF;
  IF p_min IS NULL OR p_min < 0 THEN
    RAISE EXCEPTION 'Seuil invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
  END IF;

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_set_stock_min_warehouse IS 'Définit le seuil d''alerte magasin pour un produit (upsert ligne inventaire si besoin).';
GRANT EXECUTE ON FUNCTION public.warehouse_set_stock_min_warehouse(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
  v_available int;
  v_wh_q int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status, from_warehouse
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Seuls les transferts en brouillon ou approuvés peuvent être expédiés (statut actuel: %)', v_transfer.status;
  END IF;

  IF v_transfer.from_warehouse THEN
    IF NOT public.user_is_company_owner(v_transfer.company_id) THEN
      RAISE EXCEPTION 'Seul le propriétaire peut expédier un transfert depuis le magasin (dépôt).';
    END IF;

    FOR v_item IN
      SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
      FROM public.stock_transfer_items sti
      JOIN public.products p ON p.id = sti.product_id
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
      FROM public.warehouse_inventory wi
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_wh_q, 0) < v_item.quantity_requested THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
          v_product_name, v_item.quantity_requested, COALESCE(v_wh_q, 0);
      END IF;

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_transfer.company_id, v_item.product_id, 'exit', v_item.quantity_requested, NULL,
        'unite', 1, 'stock_transfer', p_transfer_id, NULL, p_user_id
      );

      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity - v_item.quantity_requested,
          updated_at = now()
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id;

      UPDATE public.stock_transfer_items
      SET quantity_shipped = v_item.quantity_requested
      WHERE id = v_item.id;
    END LOOP;

    UPDATE public.stock_transfers
    SET status = 'shipped',
        shipped_at = now(),
        approved_by = COALESCE(approved_by, p_user_id),
        updated_at = now()
    WHERE id = p_transfer_id;
    RETURN;
  END IF;

  IF v_transfer.from_store_id = v_transfer.to_store_id THEN
    RAISE EXCEPTION 'Boutique origine et destination identiques';
  END IF;

  FOR v_item IN
    SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
    FROM public.stock_transfer_items sti
    JOIN public.products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_available
    FROM public.store_inventory si
    WHERE si.store_id = v_transfer.from_store_id AND si.product_id = v_item.product_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_item.quantity_requested THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%" (demandé: %, disponible: %)',
        v_product_name, v_item.quantity_requested, COALESCE(v_available, 0);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_item.quantity_requested,
        updated_at = now()
    WHERE store_id = v_transfer.from_store_id AND product_id = v_item.product_id;

    IF NOT FOUND THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%"', v_product_name;
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.from_store_id, v_item.product_id, 'transfer_out', v_item.quantity_requested, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_shipped = v_item.quantity_requested
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'shipped',
      shipped_at = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.ship_transfer IS 'Expédie un transfert : depuis le magasin (owner) ou depuis une boutique (stock boutique).';

-- ============================================================================
-- 00064_warehouse_dispatch_invoices.sql
-- ============================================================================
CREATE TABLE public.warehouse_dispatch_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  document_number text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_number)
);

CREATE INDEX idx_warehouse_dispatch_invoices_company_created
  ON public.warehouse_dispatch_invoices (company_id, created_at DESC);

CREATE TABLE public.warehouse_dispatch_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid NOT NULL REFERENCES public.warehouse_dispatch_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_warehouse_dispatch_items_invoice ON public.warehouse_dispatch_items (invoice_id);

ALTER TABLE public.warehouse_dispatch_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_dispatch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

CREATE POLICY warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouse_dispatch_invoices w
      WHERE w.id = warehouse_dispatch_items.invoice_id
        AND public.user_is_company_owner(w.company_id)
    )
  );

GRANT SELECT ON public.warehouse_dispatch_invoices TO authenticated;
GRANT SELECT ON public.warehouse_dispatch_items TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_doc text;
  v_line record;
  v_wh_q integer;
  v_attempt int := 0;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin (bon / facture dépôt).';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne produit est requise';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Client introuvable pour cette entreprise';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_line IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch_invoice(uuid, uuid, text, jsonb) TO authenticated;

-- ============================================================================
-- 00065_warehouse_register_adjustment.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.warehouse_register_adjustment(
  p_company_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
  v_abs integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut ajuster le stock magasin.';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Variation invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
  END IF;

  IF p_delta > 0 THEN
    v_pc := COALESCE(
      p_unit_cost,
      (SELECT purchase_price FROM public.products WHERE id = p_product_id)
    );
    IF v_pc IS NULL OR v_pc < 0 THEN
      RAISE EXCEPTION 'Indiquez un prix d''achat unitaire pour l''ajout en stock';
    END IF;

    SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
    INTO v_old_q, v_old_cost
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF v_old_q IS NULL THEN
      v_old_q := 0;
    END IF;

    IF v_old_q = 0 THEN
      v_new_avg := v_pc;
    ELSE
      v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_delta * v_pc)::numeric / (v_old_q + p_delta);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'entry', p_delta, v_pc,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
    VALUES (p_company_id, p_product_id, p_delta, v_new_avg, now())
    ON CONFLICT (company_id, product_id) DO UPDATE
    SET quantity = public.warehouse_inventory.quantity + p_delta,
        avg_unit_cost = v_new_avg,
        updated_at = now();
  ELSE
    v_abs := -p_delta;
    SELECT COALESCE(wi.quantity, 0)
    INTO v_old_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF COALESCE(v_old_q, 0) < v_abs THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour cet ajustement (disponible: %)', COALESCE(v_old_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'exit', v_abs, NULL,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_abs,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_register_adjustment(uuid, uuid, integer, numeric, text) TO authenticated;

-- ============================================================================
-- 00066_product_scope_warehouse_boutique.sql
-- ============================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_scope text NOT NULL DEFAULT 'both'
  CHECK (product_scope IN ('both', 'warehouse_only', 'boutique_only'));

CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une entrée magasin.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Prix d''achat unitaire invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''entrée au dépôt magasin.';
  END IF;

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN
    v_old_q := 0;
  END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at, stock_min_warehouse)
  VALUES (p_company_id, p_product_id, p_quantity, v_new_avg, now(), 0)
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_set_stock_min_warehouse(
  p_company_id uuid,
  p_product_id uuid,
  p_min integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut définir les seuils magasin.';
  END IF;
  IF p_min IS NULL OR p_min < 0 THEN
    RAISE EXCEPTION 'Seuil invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas de seuil dépôt.';
  END IF;

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at = now();
END;
$$;

-- ============================================================================
-- 00067_product_scope_sales_and_transfers.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : créateur de la vente invalide';
  END IF;

  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    ) THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Produit réservé au dépôt magasin, pas à la vente en boutique : %',
        COALESCE(v_product_name, v_product_id::text);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, sale_mode, document_type)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by, COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode), COALESCE(p_document_type, 'thermal_receipt'::public.document_type))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
BEGIN
  SELECT id, to_store_id, status
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status != 'shipped' THEN
    RAISE EXCEPTION 'Seuls les transferts expédiés peuvent être réceptionnés (statut actuel: %)', v_transfer.status;
  END IF;

  FOR v_item IN
    SELECT id, product_id, quantity_shipped
    FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND quantity_shipped > 0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_item.product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    ) THEN
      RAISE EXCEPTION 'Produit réservé au dépôt : réception en boutique impossible.';
    END IF;

    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (v_transfer.to_store_id, v_item.product_id, v_item.quantity_shipped, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + v_item.quantity_shipped,
        updated_at = now();

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.to_store_id, v_item.product_id, 'transfer_in', v_item.quantity_shipped, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_received = v_item.quantity_shipped
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      received_by = p_user_id,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
  v_available int;
  v_wh_q int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status, from_warehouse
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Seuls les transferts en brouillon ou approuvés peuvent être expédiés (statut actuel: %)', v_transfer.status;
  END IF;

  IF v_transfer.from_warehouse THEN
    IF NOT public.user_is_company_owner(v_transfer.company_id) THEN
      RAISE EXCEPTION 'Seul le propriétaire peut expédier un transfert depuis le magasin (dépôt).';
    END IF;

    FOR v_item IN
      SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
      FROM public.stock_transfer_items sti
      JOIN public.products p ON p.id = sti.product_id
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      IF COALESCE((SELECT product_scope FROM public.products WHERE id = v_item.product_id), 'both') <> 'both' THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Vers une boutique : l''article « % » doit être « dépôt + boutiques » (pas dépôt seul).', v_product_name;
      END IF;

      SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
      FROM public.warehouse_inventory wi
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_wh_q, 0) < v_item.quantity_requested THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
          v_product_name, v_item.quantity_requested, COALESCE(v_wh_q, 0);
      END IF;

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_transfer.company_id, v_item.product_id, 'exit', v_item.quantity_requested, NULL,
        'unite', 1, 'stock_transfer', p_transfer_id, NULL, p_user_id
      );

      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity - v_item.quantity_requested,
          updated_at = now()
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id;

      UPDATE public.stock_transfer_items
      SET quantity_shipped = v_item.quantity_requested
      WHERE id = v_item.id;
    END LOOP;

    UPDATE public.stock_transfers
    SET status = 'shipped',
        shipped_at = now(),
        approved_by = COALESCE(approved_by, p_user_id),
        updated_at = now()
    WHERE id = p_transfer_id;
    RETURN;
  END IF;

  IF v_transfer.from_store_id = v_transfer.to_store_id THEN
    RAISE EXCEPTION 'Boutique origine et destination identiques';
  END IF;

  FOR v_item IN
    SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
    FROM public.stock_transfer_items sti
    JOIN public.products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_available
    FROM public.store_inventory si
    WHERE si.store_id = v_transfer.from_store_id AND si.product_id = v_item.product_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_item.quantity_requested THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%" (demandé: %, disponible: %)',
        v_product_name, v_item.quantity_requested, COALESCE(v_available, 0);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_item.quantity_requested,
        updated_at = now()
    WHERE store_id = v_transfer.from_store_id AND product_id = v_item.product_id;

    IF NOT FOUND THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%"', v_product_name;
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.from_store_id, v_item.product_id, 'transfer_out', v_item.quantity_requested, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_shipped = v_item.quantity_requested
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'shipped',
      shipped_at = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ============================================================================
-- 00068_product_scope_warehouse_exit_dispatch.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_wh_q integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin.';
  END IF;

  SELECT id, company_id, status INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable';
  END IF;
  IF v_sale.company_id <> p_company_id THEN
    RAISE EXCEPTION 'La vente n''appartient pas à cette entreprise';
  END IF;
  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'La vente doit être validée (statut complété) pour autoriser une sortie magasin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.company_id = p_company_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_item.product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'La vente contient un produit réservé aux boutiques : sortie dépôt impossible pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_register_adjustment(
  p_company_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
  v_abs integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut ajuster le stock magasin.';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Variation invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''ajustement au dépôt.';
  END IF;

  IF p_delta > 0 THEN
    v_pc := COALESCE(
      p_unit_cost,
      (SELECT purchase_price FROM public.products WHERE id = p_product_id)
    );
    IF v_pc IS NULL OR v_pc < 0 THEN
      RAISE EXCEPTION 'Indiquez un prix d''achat unitaire pour l''ajout en stock';
    END IF;

    SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
    INTO v_old_q, v_old_cost
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF v_old_q IS NULL THEN
      v_old_q := 0;
    END IF;

    IF v_old_q = 0 THEN
      v_new_avg := v_pc;
    ELSE
      v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_delta * v_pc)::numeric / (v_old_q + p_delta);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'entry', p_delta, v_pc,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
    VALUES (p_company_id, p_product_id, p_delta, v_new_avg, now())
    ON CONFLICT (company_id, product_id) DO UPDATE
    SET quantity = public.warehouse_inventory.quantity + p_delta,
        avg_unit_cost = v_new_avg,
        updated_at = now();
  ELSE
    v_abs := -p_delta;
    SELECT COALESCE(wi.quantity, 0)
    INTO v_old_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF COALESCE(v_old_q, 0) < v_abs THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour cet ajustement (disponible: %)', COALESCE(v_old_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'exit', v_abs, NULL,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_abs,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_doc text;
  v_line record;
  v_wh_q integer;
  v_attempt int := 0;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin (bon / facture dépôt).';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne produit est requise';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Client introuvable pour cette entreprise';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_line IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
        AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'Produit réservé aux boutiques : pas de sortie dépôt pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;


-- >>> MIGRATION FILE: 00069_app_error_logs.sql <<<

-- Centralise les erreurs Flutter pour affichage côté super admin SaaS.

CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'app',
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack_trace TEXT NULL,
  error_type TEXT NULL,
  platform TEXT NULL,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  context JSONB NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at
  ON public.app_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_company_id
  ON public.app_error_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_user_id
  ON public.app_error_logs(user_id);

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_error_logs_insert_self" ON public.app_error_logs;
CREATE POLICY "app_error_logs_insert_self"
ON public.app_error_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "app_error_logs_select_super_admin" ON public.app_error_logs;
CREATE POLICY "app_error_logs_select_super_admin"
ON public.app_error_logs
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.log_app_error(
  p_source TEXT DEFAULT 'app',
  p_level TEXT DEFAULT 'error',
  p_message TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_error_type TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_message IS NULL OR btrim(p_message) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.app_error_logs (
    user_id,
    source,
    level,
    message,
    stack_trace,
    error_type,
    platform,
    company_id,
    store_id,
    context
  ) VALUES (
    auth.uid(),
    COALESCE(NULLIF(btrim(p_source), ''), 'app'),
    COALESCE(NULLIF(btrim(p_level), ''), 'error'),
    left(p_message, 4000),
    CASE
      WHEN p_stack_trace IS NULL THEN NULL
      ELSE left(p_stack_trace, 16000)
    END,
    p_error_type,
    p_platform,
    p_company_id,
    p_store_id,
    COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB)
  IS 'Enregistre une erreur applicative côté SaaS (visible super admin).';

GRANT SELECT ON public.app_error_logs TO authenticated;
GRANT INSERT ON public.app_error_logs TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated, anon;



-- >>> MIGRATION FILE: 00070_owner_clear_company_histories.sql <<<

-- Owner settings: clear company histories (danger zone actions).

CREATE OR REPLACE FUNCTION public.owner_clear_sales_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  SELECT COUNT(*) INTO v_deleted
  FROM public.sales s
  WHERE s.company_id = p_company_id
    AND (p_store_id IS NULL OR s.store_id = p_store_id);

  DELETE FROM public.sales
  WHERE company_id = p_company_id
    AND (p_store_id IS NULL OR store_id = p_store_id);

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_sales_history(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_purchases_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  SELECT COUNT(*) INTO v_deleted
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND (p_store_id IS NULL OR p.store_id = p_store_id);

  DELETE FROM public.purchases
  WHERE company_id = p_company_id
    AND (p_store_id IS NULL OR store_id = p_store_id);

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_purchases_history(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_transfers_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  SELECT COUNT(*) INTO v_deleted
  FROM public.stock_transfers t
  WHERE t.company_id = p_company_id
    AND (
      p_store_id IS NULL
      OR t.from_store_id = p_store_id
      OR t.to_store_id = p_store_id
    );

  DELETE FROM public.stock_transfers
  WHERE company_id = p_company_id
    AND (
      p_store_id IS NULL
      OR from_store_id = p_store_id
      OR to_store_id = p_store_id
    );

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_transfers_history(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_products_catalog(
  p_company_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  SELECT COUNT(*) INTO v_deleted
  FROM public.products p
  WHERE p.company_id = p_company_id;

  DELETE FROM public.products
  WHERE company_id = p_company_id;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_products_catalog(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_stock(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory si
    JOIN public.stores s ON s.id = si.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.store_inventory si
    USING public.stores s
    WHERE si.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_inventory'
    ) THEN
      DELETE FROM public.warehouse_inventory
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory
    WHERE store_id = p_store_id;

    DELETE FROM public.store_inventory
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_stock_movements_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements sm
    JOIN public.stores s ON s.id = sm.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.stock_movements sm
    USING public.stores s
    WHERE sm.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_movements'
    ) THEN
      DELETE FROM public.warehouse_movements
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements
    WHERE store_id = p_store_id;

    DELETE FROM public.stock_movements
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock_movements_history(UUID, UUID) TO authenticated;


-- >>> MIGRATION FILE: 00071_owner_clear_warehouse_tables_optional.sql <<<

-- Replaces owner_clear_stock / owner_clear_stock_movements_history so they do not
-- fail when warehouse_* tables are missing (older DBs without warehouse migrations).

CREATE OR REPLACE FUNCTION public.owner_clear_stock(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory si
    JOIN public.stores s ON s.id = si.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.store_inventory si
    USING public.stores s
    WHERE si.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_inventory'
    ) THEN
      DELETE FROM public.warehouse_inventory
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory
    WHERE store_id = p_store_id;

    DELETE FROM public.store_inventory
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_stock_movements_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements sm
    JOIN public.stores s ON s.id = sm.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.stock_movements sm
    USING public.stores s
    WHERE sm.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_movements'
    ) THEN
      DELETE FROM public.warehouse_movements
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements
    WHERE store_id = p_store_id;

    DELETE FROM public.stock_movements
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock_movements_history(UUID, UUID) TO authenticated;


-- >>> MIGRATION FILE: 00073_warehouse_void_dispatch_invoice.sql <<<

-- Annuler un bon / facture de sortie dépôt : réintègre le stock, supprime mouvements et document.

CREATE OR REPLACE FUNCTION public.warehouse_void_dispatch_invoice(
  p_company_id uuid,
  p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_line record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut annuler un bon de sortie magasin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_dispatch_invoices w
    WHERE w.id = p_invoice_id AND w.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
    VALUES (p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE company_id = p_company_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) IS
  'Annule un bon de sortie dépôt : réintègre le stock magasin, supprime les mouvements et le document.';

GRANT EXECUTE ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) TO authenticated;


-- >>> MIGRATION FILE: 00074_app_error_logs_client_kind.sql <<<

-- Distinction super-admin : erreurs app web (Next.js) vs app Flutter (mobile / desktop).

ALTER TABLE public.app_error_logs
  ADD COLUMN IF NOT EXISTS client_kind TEXT;

COMMENT ON COLUMN public.app_error_logs.client_kind IS
  'Origine client : web (FasoStock web), flutter (app Flutter), ou NULL (inconnu / ancien).';

CREATE INDEX IF NOT EXISTS idx_app_error_logs_client_kind
  ON public.app_error_logs(client_kind);

-- Rétro-remplissage (lignes sans client_kind explicite dans context).
UPDATE public.app_error_logs
SET client_kind = context->>'client_kind'
WHERE client_kind IS NULL
  AND context ? 'client_kind'
  AND btrim(context->>'client_kind') <> '';

UPDATE public.app_error_logs
SET client_kind = 'flutter'
WHERE client_kind IS NULL
  AND platform IS NOT NULL
  AND lower(btrim(platform)) <> 'web';

UPDATE public.app_error_logs
SET client_kind = 'web'
WHERE client_kind IS NULL
  AND lower(btrim(COALESCE(platform, ''))) = 'web';

CREATE OR REPLACE FUNCTION public.app_error_logs_sync_client_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_kind IS NULL OR btrim(NEW.client_kind) = '' THEN
    IF NEW.context ? 'client_kind' AND btrim(NEW.context->>'client_kind') <> '' THEN
      NEW.client_kind := NEW.context->>'client_kind';
    ELSIF NEW.platform IS NOT NULL AND lower(btrim(NEW.platform)) <> 'web' THEN
      NEW.client_kind := 'flutter';
    ELSIF lower(btrim(COALESCE(NEW.platform, ''))) = 'web' THEN
      NEW.client_kind := 'web';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_error_logs_client_kind ON public.app_error_logs;
CREATE TRIGGER trg_app_error_logs_client_kind
  BEFORE INSERT OR UPDATE ON public.app_error_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.app_error_logs_sync_client_kind();


-- >>> MIGRATION FILE: 00075_companies_business_type_slug.sql <<<

-- Type d’activité choisi à l’inscription (slug aligné appweb `lib/config/business-types.ts`).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_type_slug TEXT NULL;

COMMENT ON COLUMN public.companies.business_type_slug IS
  'Slug activité onboarding (ex. pharmacie, quincaillerie). NULL si non renseigné ou compte ancien.';

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL,
  p_business_type_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_store_code TEXT;
  v_business_slug TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  v_business_slug := NULLIF(TRIM(COALESCE(p_business_type_slug, '')), '');

  INSERT INTO public.companies (name, slug, is_active, store_quota, business_type_slug)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3, v_business_slug)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  v_store_code := COALESCE(NULLIF(TRIM(p_store_code), ''), 'B1');

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, v_store_code, NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.profiles (id, full_name, is_super_admin, is_active)
  VALUES (v_user_id, NULL, false, true)
  ON CONFLICT (id) DO UPDATE SET updated_at = now(), is_active = true;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;


-- >>> MIGRATION FILE: 00076_sales_update_permission_and_rpc.sql <<<

-- Droit « modifier une vente complétée » : owner par défaut ; l'owner peut l'accorder à d'autres via user_permission_overrides.

INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'sales.update')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'sales.update'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_completed_sale_with_stock(
  p_sale_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT NULL,
  p_document_type public.document_type DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item jsonb;
  v_item_old record;
  v_row_count int;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_subtotal decimal := 0;
  v_total decimal;
  v_product_name text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne d''article est requise';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Paiements invalides';
  END IF;

  SELECT id, company_id, store_id, customer_id, status, sale_mode, document_type
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente non trouvée';
  END IF;

  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'Seules les ventes complétées peuvent être modifiées';
  END IF;

  IF v_sale.company_id IS NULL OR NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;

  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_sale.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : modifier des ventes';
  END IF;

  IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;

  -- Restaurer le stock des anciennes lignes (sans changer le statut).
  FOR v_item_old IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.store_inventory
    SET quantity = quantity + v_item_old.quantity,
        updated_at = now()
    WHERE store_id = v_sale.store_id AND product_id = v_item_old.product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_sale.store_id, v_item_old.product_id, v_item_old.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (
      v_sale.store_id,
      v_item_old.product_id,
      'return_in',
      v_item_old.quantity,
      'sale',
      p_sale_id,
      auth.uid(),
      'Modification vente (lignes précédentes)'
    );
  END LOOP;

  DELETE FROM public.sale_payments WHERE sale_id = p_sale_id;
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;

  -- Décrémenter pour les nouvelles lignes (même logique que create_sale_with_stock).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = v_sale.store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  UPDATE public.sales s
  SET
    customer_id = p_customer_id,
    subtotal = v_subtotal,
    discount = COALESCE(p_discount, 0),
    tax = 0,
    total = v_total,
    sale_mode = COALESCE(p_sale_mode, s.sale_mode),
    document_type = COALESCE(p_document_type, s.document_type),
    updated_at = now()
  WHERE s.id = p_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (p_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_sale.store_id, v_product_id, 'sale_out', -v_qty, 'sale', p_sale_id, auth.uid(), NULL);
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT p_sale_id,
         (elem->>'method')::public.payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;
END;
$$;

COMMENT ON FUNCTION public.update_completed_sale_with_stock(uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type) IS
  'Remplace lignes et paiements d''une vente complétée, avec recalcul stock (undo + nouveau déstockage). Exige sales.update.';

GRANT EXECUTE ON FUNCTION public.update_completed_sale_with_stock(uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type) TO authenticated;


-- >>> MIGRATION FILE: 00077_realtime_publication_sales.sql <<<

-- Realtime sur public.sales (Flutter : Drift mis à jour hors sync périodique).
-- RLS existant filtre les lignes ; canal privé + JWT côté client (comme store_inventory).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- >>> MIGRATION FILE: 00078_warehouse_manage_magasinier.sql <<<

-- Dépôt magasin : droit dédié warehouse.manage pour le rôle Magasinier (stock_manager) et contrôles RPC/RLS alignés.

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'warehouse.manage')
ON CONFLICT (key) DO NOTHING;

-- Propriétaire : droit magasin explicite (utile pour overrides / cohérence).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'warehouse.manage'
ON CONFLICT DO NOTHING;

-- Magasinier (stock_manager) : Magasin (dépôt) + Stock boutiques + Produits (CRUD complet) + flux magasin (achats, transferts, etc.).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager'
  AND p.key IN (
    'warehouse.manage',
    'products.view', 'products.create', 'products.update', 'products.delete', 'products.import',
    'stock.view', 'stock.adjust', 'stock.transfer',
    'transfers.create', 'transfers.approve',
    'stores.view',
    'purchases.view', 'purchases.create', 'purchases.update', 'purchases.cancel', 'purchases.delete',
    'suppliers.view', 'suppliers.manage',
    'sales.view',
    'customers.view', 'customers.manage'
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_can_manage_company_warehouse(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
    OR 'warehouse.manage' = ANY(public.get_my_permission_keys(p_company_id));
$$;

COMMENT ON FUNCTION public.user_can_manage_company_warehouse(uuid) IS
  'Propriétaire ou utilisateur avec la permission warehouse.manage (magasinier).';

GRANT EXECUTE ON FUNCTION public.user_can_manage_company_warehouse(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS : lecture tables magasin pour owner OU warehouse.manage
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS warehouse_inventory_select_owner ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_select_owner ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_movements_select_owner ON public.warehouse_movements;
CREATE POLICY warehouse_movements_select_owner ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices;
CREATE POLICY warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items;
CREATE POLICY warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouse_dispatch_invoices w
      WHERE w.id = warehouse_dispatch_items.invoice_id
        AND public.user_can_manage_company_warehouse(w.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPC magasin : propriétaire OU permission warehouse.manage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour enregistrer une entrée au dépôt.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Prix d''achat unitaire invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''entrée au dépôt magasin.';
  END IF;

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN
    v_old_q := 0;
  END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at, stock_min_warehouse)
  VALUES (p_company_id, p_product_id, p_quantity, v_new_avg, now(), 0)
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_set_stock_min_warehouse(
  p_company_id uuid,
  p_product_id uuid,
  p_min integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour définir les seuils dépôt.';
  END IF;
  IF p_min IS NULL OR p_min < 0 THEN
    RAISE EXCEPTION 'Seuil invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas de seuil dépôt.';
  END IF;

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
  v_available int;
  v_wh_q int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status, from_warehouse
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Seuls les transferts en brouillon ou approuvés peuvent être expédiés (statut actuel: %)', v_transfer.status;
  END IF;

  IF v_transfer.from_warehouse THEN
    IF NOT public.user_can_manage_company_warehouse(v_transfer.company_id) THEN
      RAISE EXCEPTION 'Droit magasin requis pour expédier un transfert depuis le dépôt.';
    END IF;

    FOR v_item IN
      SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
      FROM public.stock_transfer_items sti
      JOIN public.products p ON p.id = sti.product_id
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      IF COALESCE((SELECT product_scope FROM public.products WHERE id = v_item.product_id), 'both') <> 'both' THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Vers une boutique : l''article « % » doit être « dépôt + boutiques » (pas dépôt seul).', v_product_name;
      END IF;

      SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
      FROM public.warehouse_inventory wi
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_wh_q, 0) < v_item.quantity_requested THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
          v_product_name, v_item.quantity_requested, COALESCE(v_wh_q, 0);
      END IF;

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_transfer.company_id, v_item.product_id, 'exit', v_item.quantity_requested, NULL,
        'unite', 1, 'stock_transfer', p_transfer_id, NULL, p_user_id
      );

      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity - v_item.quantity_requested,
          updated_at = now()
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id;

      UPDATE public.stock_transfer_items
      SET quantity_shipped = v_item.quantity_requested
      WHERE id = v_item.id;
    END LOOP;

    UPDATE public.stock_transfers
    SET status = 'shipped',
        shipped_at = now(),
        approved_by = COALESCE(approved_by, p_user_id),
        updated_at = now()
    WHERE id = p_transfer_id;
    RETURN;
  END IF;

  IF v_transfer.from_store_id = v_transfer.to_store_id THEN
    RAISE EXCEPTION 'Boutique origine et destination identiques';
  END IF;

  FOR v_item IN
    SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
    FROM public.stock_transfer_items sti
    JOIN public.products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_available
    FROM public.store_inventory si
    WHERE si.store_id = v_transfer.from_store_id AND si.product_id = v_item.product_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_item.quantity_requested THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%" (demandé: %, disponible: %)',
        v_product_name, v_item.quantity_requested, COALESCE(v_available, 0);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_item.quantity_requested,
        updated_at = now()
    WHERE store_id = v_transfer.from_store_id AND product_id = v_item.product_id;

    IF NOT FOUND THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%"', v_product_name;
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.from_store_id, v_item.product_id, 'transfer_out', v_item.quantity_requested, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_shipped = v_item.quantity_requested
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'shipped',
      shipped_at = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_wh_q integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour enregistrer une sortie liée à une vente.';
  END IF;

  SELECT id, company_id, status INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable';
  END IF;
  IF v_sale.company_id <> p_company_id THEN
    RAISE EXCEPTION 'La vente n''appartient pas à cette entreprise';
  END IF;
  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'La vente doit être validée (statut complété) pour autoriser une sortie magasin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.company_id = p_company_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_item.product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'La vente contient un produit réservé aux boutiques : sortie dépôt impossible pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_register_adjustment(
  p_company_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
  v_abs integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour ajuster le stock dépôt.';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Variation invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''ajustement au dépôt.';
  END IF;

  IF p_delta > 0 THEN
    v_pc := COALESCE(
      p_unit_cost,
      (SELECT purchase_price FROM public.products WHERE id = p_product_id)
    );
    IF v_pc IS NULL OR v_pc < 0 THEN
      RAISE EXCEPTION 'Indiquez un prix d''achat unitaire pour l''ajout en stock';
    END IF;

    SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
    INTO v_old_q, v_old_cost
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF v_old_q IS NULL THEN
      v_old_q := 0;
    END IF;

    IF v_old_q = 0 THEN
      v_new_avg := v_pc;
    ELSE
      v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_delta * v_pc)::numeric / (v_old_q + p_delta);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'entry', p_delta, v_pc,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
    VALUES (p_company_id, p_product_id, p_delta, v_new_avg, now())
    ON CONFLICT (company_id, product_id) DO UPDATE
    SET quantity = public.warehouse_inventory.quantity + p_delta,
        avg_unit_cost = v_new_avg,
        updated_at = now();
  ELSE
    v_abs := -p_delta;
    SELECT COALESCE(wi.quantity, 0)
    INTO v_old_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF COALESCE(v_old_q, 0) < v_abs THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour cet ajustement (disponible: %)', COALESCE(v_old_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'exit', v_abs, NULL,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_abs,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_doc text;
  v_line record;
  v_wh_q integer;
  v_attempt int := 0;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour créer un bon / une facture de sortie dépôt.';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne produit est requise';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Client introuvable pour cette entreprise';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_line IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
        AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'Produit réservé aux boutiques : pas de sortie dépôt pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_void_dispatch_invoice(
  p_company_id uuid,
  p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_line record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour annuler un bon de sortie dépôt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_dispatch_invoices w
    WHERE w.id = p_invoice_id AND w.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
    VALUES (p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE company_id = p_company_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
END;
$$;


-- >>> MIGRATION FILE: 00079_stock_manager_products_delete_default.sql <<<

-- Magasinier : suppression produits incluse dans le profil par défaut (catalogue complet).
-- Idempotent pour les environnements où 00078 a déjà été appliqué avant l'ajout de products.delete.

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key = 'products.delete'
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00080_permission_overrides_owner_or_users_manage.sql <<<

-- Gestion fine des permissions : propriétaire OU utilisateur avec users.manage (cible non-owner pour les non-propriétaires).

CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
  v_member_exists boolean;
  v_from_role TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
  v_result TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour consulter les droits d''un utilisateur.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un autre propriétaire.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes) AS k
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS
  'Clés effectives (rôle + surcharges). Propriétaire ou users.manage ; seul le propriétaire peut cibler un autre propriétaire.';

CREATE OR REPLACE FUNCTION public.set_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT,
  p_granted BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
  v_permission_id UUID;
  v_member_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier les droits d''un utilisateur.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un autre propriétaire.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Permission inconnue : %.', p_permission_key;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted)
  VALUES (p_user_id, p_company_id, v_permission_id, p_granted)
  ON CONFLICT (user_id, company_id, permission_id)
  DO UPDATE SET granted = EXCLUDED.granted, id = public.user_permission_overrides.id;
END;
$$;

COMMENT ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) IS
  'Surcharge de permission. Propriétaire ou users.manage ; seul le propriétaire peut cibler un autre propriétaire.';

CREATE OR REPLACE FUNCTION public.delete_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
  v_permission_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier les droits.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un autre propriétaire.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.user_permission_overrides
  WHERE user_id = p_user_id AND company_id = p_company_id AND permission_id = v_permission_id;
END;
$$;


-- >>> MIGRATION FILE: 00081_sales_invoice_a4_table_permission.sql <<<

-- Interface POS « facture tableau » : droit séparé ; seul l’owner l’a par défaut (accord explicite aux autres via overrides / gestion des droits).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'sales.invoice_a4_table')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'sales.invoice_a4_table'
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00082_sale_credit_due_and_append_payment.sql <<<

-- Page Crédit : échéances + RPC encaissement partiel (sales.update).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS credit_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_internal_note TEXT;

CREATE OR REPLACE FUNCTION public.append_sale_payment(
  p_sale_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_paid numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  SELECT id, company_id, store_id, status, total
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Vente non trouvée'; END IF;

  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'Encaissement impossible sur une vente non complétée';
  END IF;

  IF v_sale.company_id IS NULL OR NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;

  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_sale.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : sales.update';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.sale_payments WHERE sale_id = p_sale_id;

  IF (v_paid + p_amount) > (v_sale.total + 0.0001) THEN
    RAISE EXCEPTION 'Montant supérieur au reste à payer';
  END IF;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  VALUES (p_sale_id, p_method, p_amount, NULLIF(trim(COALESCE(p_reference, '')), ''));

  UPDATE public.sales SET updated_at = now() WHERE id = p_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_sale_payment(uuid, public.payment_method, numeric, text) TO authenticated;


-- >>> MIGRATION FILE: 00083_owner_purge_cancelled_sale.sql <<<

-- Propriétaire : supprimer définitivement une vente déjà au statut « annulée » (purge liste / historique).
-- Le stock a déjà été rétabli lors de l’annulation ; pas de mouvement stock ici.

CREATE OR REPLACE FUNCTION public.owner_purge_cancelled_sale(
  p_company_id uuid,
  p_sale_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status public.sale_status;
BEGIN
  IF p_company_id IS NULL OR p_sale_number IS NULL OR trim(p_sale_number) = '' THEN
    RAISE EXCEPTION 'Paramètres invalides';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé : propriétaire requis';
  END IF;

  SELECT id, status INTO v_id, v_status
  FROM public.sales
  WHERE company_id = p_company_id
    AND sale_number = trim(p_sale_number)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable pour ce numéro';
  END IF;

  IF v_status IS DISTINCT FROM 'cancelled'::public.sale_status THEN
    RAISE EXCEPTION 'Seules les ventes déjà annulées peuvent être purgées';
  END IF;

  DELETE FROM public.sales WHERE id = v_id;
END;
$$;

COMMENT ON FUNCTION public.owner_purge_cancelled_sale(uuid, text) IS
  'Owner uniquement : DELETE une vente cancelled (cascade sale_items, sale_payments).';

GRANT EXECUTE ON FUNCTION public.owner_purge_cancelled_sale(uuid, text) TO authenticated;


-- >>> MIGRATION FILE: 00084_append_sale_payment_exclude_credit_placeholder.sql <<<

-- Encaissements : ne pas compter les lignes `sale_payments.method = 'other'` (solde à crédit POS / facture A4).
-- Sinon une vente 100 % crédit a déjà SUM(amount)=total et append_sale_payment refuse tout encaissement réel.

CREATE OR REPLACE FUNCTION public.append_sale_payment(
  p_sale_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_paid numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  SELECT id, company_id, store_id, status, total
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Vente non trouvée'; END IF;

  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'Encaissement impossible sur une vente non complétée';
  END IF;

  IF v_sale.company_id IS NULL OR NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;

  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_sale.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : sales.update';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.sale_payments
  WHERE sale_id = p_sale_id
    AND method IS DISTINCT FROM 'other'::public.payment_method;

  IF (v_paid + p_amount) > (v_sale.total + 0.0001) THEN
    RAISE EXCEPTION 'Montant supérieur au reste à payer';
  END IF;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  VALUES (p_sale_id, p_method, p_amount, NULLIF(trim(COALESCE(p_reference, '')), ''));

  UPDATE public.sales SET updated_at = now() WHERE id = p_sale_id;
END;
$$;


-- >>> MIGRATION FILE: 00085_realtime_publication_products.sql <<<

-- Realtime sur public.products (Flutter : Drift catalogue mis à jour hors sync périodique).
-- RLS filtre les lignes ; canal privé + JWT côté client (comme store_inventory / sales).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- >>> MIGRATION FILE: 00086_realtime_publication_product_images.sql <<<

-- Realtime sur public.product_images (Flutter : vignette Drift après fetch léger).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.product_images;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- >>> MIGRATION FILE: 00087_credit_view_permission.sql <<<

-- Page Crédit / créances : droit séparé ; seul le rôle owner l’a par défaut (le propriétaire peut l’accorder aux autres via la gestion des droits).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'credit.view')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'credit.view'
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00088_company_saas_feature_flags.sql <<<

-- Fonctionnalités pilotées par la plateforme (super admin) : module Magasin, augmentation quota boutiques.
-- `ai_predictions_enabled` existait déjà (00009).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS warehouse_feature_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_quota_increase_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.warehouse_feature_enabled IS
  'Si false, le module dépôt Magasin est masqué / désactivé pour cette entreprise.';
COMMENT ON COLUMN public.companies.store_quota_increase_enabled IS
  'Si false, le quota de boutiques ne peut pas être augmenté (hors super admin selon politique — appliqué côté API + trigger).';

-- Garde : seuls les super admins modifient les interrupteurs plateforme ;
-- les membres ne peuvent pas augmenter store_quota si désactivé.
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.warehouse_feature_enabled IS DISTINCT FROM OLD.warehouse_feature_enabled
     OR NEW.store_quota_increase_enabled IS DISTINCT FROM OLD.store_quota_increase_enabled
     OR NEW.ai_predictions_enabled IS DISTINCT FROM OLD.ai_predictions_enabled
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administration plateforme.';
  END IF;

  IF NEW.store_quota IS DISTINCT FROM OLD.store_quota THEN
    IF NEW.store_quota > OLD.store_quota AND NOT COALESCE(OLD.store_quota_increase_enabled, true) THEN
      RAISE EXCEPTION 'L''augmentation du quota de boutiques est désactivée pour cette entreprise.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_platform_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_platform_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_platform_flags();


-- >>> MIGRATION FILE: 00089_barcodes_manage_permission.sql <<<

-- Page Code Barre : accès owner par défaut ; le propriétaire peut accorder
-- explicitement la permission aux autres utilisateurs.

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'barcodes.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'barcodes.manage'
ON CONFLICT DO NOTHING;


-- >>> MIGRATION FILE: 00090_products_wholesale_price_qty.sql <<<

-- Prix / quantité seuil pour vente au détail vs gros (caisse : PU = gros si qté >= seuil).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(18,4) NOT NULL DEFAULT 0
    CHECK (wholesale_price >= 0),
  ADD COLUMN IF NOT EXISTS wholesale_qty INTEGER NOT NULL DEFAULT 0
    CHECK (wholesale_qty >= 0);

COMMENT ON COLUMN public.products.wholesale_price IS 'Prix unitaire gros (FCFA). Utilisé en caisse si quantité ligne >= wholesale_qty (> 0).';
COMMENT ON COLUMN public.products.wholesale_qty IS 'Seuil : si quantité dans le panier >= ce nombre (et > 0), appliquer wholesale_price. 0 = pas de palier gros.';


-- >>> SEED FILE: seed.sql (après schéma — rôles, démo, etc.) <<<

-- FasoStock — Seed: roles, permissions, demo companies/stores/products
-- Run after migrations. For full demo, create a user in Supabase Auth and set SEED_USER_ID below.

-- ========== ROLES ==========
INSERT INTO public.roles (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Super Admin', 'super_admin'),
  ('11111111-1111-1111-1111-111111111102', 'Owner', 'owner'),
  ('11111111-1111-1111-1111-111111111103', 'Manager', 'manager'),
  ('11111111-1111-1111-1111-111111111104', 'Store Manager', 'store_manager'),
  ('11111111-1111-1111-1111-111111111105', 'Caissier', 'cashier'),
  ('11111111-1111-1111-1111-111111111106', 'Magasinier', 'stock_manager'),
  ('11111111-1111-1111-1111-111111111107', 'Comptable', 'accountant'),
  ('11111111-1111-1111-1111-111111111108', 'Lecture seule', 'viewer')
ON CONFLICT (id) DO NOTHING;

-- ========== PERMISSIONS ==========
INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'company.manage'),
  (uuid_generate_v4(), 'stores.create'),
  (uuid_generate_v4(), 'stores.request_extra'),
  (uuid_generate_v4(), 'stores.approve_extra'),
  (uuid_generate_v4(), 'products.create'),
  (uuid_generate_v4(), 'products.update'),
  (uuid_generate_v4(), 'products.delete'),
  (uuid_generate_v4(), 'sales.create'),
  (uuid_generate_v4(), 'sales.cancel'),
  (uuid_generate_v4(), 'sales.refund'),
  (uuid_generate_v4(), 'purchases.create'),
  (uuid_generate_v4(), 'stock.adjust'),
  (uuid_generate_v4(), 'stock.transfer'),
  (uuid_generate_v4(), 'reports.view_global'),
  (uuid_generate_v4(), 'reports.view_store'),
  (uuid_generate_v4(), 'users.manage'),
  (uuid_generate_v4(), 'settings.manage'),
  (uuid_generate_v4(), 'ai.insights.view'),
  (uuid_generate_v4(), 'cash.open_close'),
  (uuid_generate_v4(), 'audit.view')
ON CONFLICT (key) DO NOTHING;

-- ========== ROLE_PERMISSIONS ==========
-- Super admin : tout
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;

-- Owner : tout sauf stores.approve_extra
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key != 'stores.approve_extra'
ON CONFLICT DO NOTHING;

-- Manager : produits, ventes, stock, achats, rapports ; pas utilisateurs, paramètres, créer boutiques, IA
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_global', 'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Store Manager : comme Manager mais rapports boutique uniquement ; pas rapports globaux, pas utilisateurs, paramètres, boutiques, IA
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Magasinier : jeux de droits minimaux pour seed seul — en prod les migrations (ex. 00047, 00078) étendent le rôle (magasin, stock complet, produits CRUD).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key IN ('stock.adjust', 'stock.transfer')
ON CONFLICT DO NOTHING;

-- Caissier : ventes (caisse) uniquement
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier' AND p.key IN ('sales.create')
ON CONFLICT DO NOTHING;

-- Comptable : voir ventes, achats, clients, fournisseurs, rapports (lecture / export)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant' AND p.key IN ('reports.view_global', 'reports.view_store', 'audit.view')
ON CONFLICT DO NOTHING;

-- Lecture seule : produits, stock, clients, rapports en lecture
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer' AND p.key IN ('reports.view_global', 'reports.view_store')
ON CONFLICT DO NOTHING;

-- ========== DEMO COMPANIES ==========
INSERT INTO public.companies (id, name, slug, is_active, store_quota) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Entreprise Demo 1', 'demo-1', true, 3),
  ('22222222-2222-2222-2222-222222222202', 'Entreprise Demo 2', 'demo-2', true, 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- ========== DEMO STORES ==========
INSERT INTO public.stores (id, company_id, name, code, is_active, is_primary) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'Boutique Ouaga', 'B1', true, true),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201', 'Boutique Bobo', 'B2', true, false),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222202', 'Magasin Principal', 'M1', true, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;

-- ========== CATEGORIES ==========
INSERT INTO public.categories (id, company_id, name, slug) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Boissons', 'boissons'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Alimentation', 'alimentation'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Hygiène', 'hygiene'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222202', 'Divers', 'divers')
ON CONFLICT DO NOTHING;

-- ========== BRANDS ==========
INSERT INTO public.brands (id, company_id, name) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Marque A'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Marque B')
ON CONFLICT DO NOTHING;

-- ========== PRODUCTS (company 1) ==========
INSERT INTO public.products (company_id, name, sku, unit, purchase_price, sale_price, stock_min, is_active) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Eau minérale 1.5L', 'EAU-001', 'pce', 150, 250, 10, true),
  ('22222222-2222-2222-2222-222222222201', 'Soda orange 33cl', 'SOD-001', 'pce', 120, 200, 20, true),
  ('22222222-2222-2222-2222-222222222201', 'Riz 5kg', 'RIZ-001', 'pce', 2500, 3200, 5, true),
  ('22222222-2222-2222-2222-222222222201', 'Savon 200g', 'SAV-001', 'pce', 350, 500, 15, true),
  ('22222222-2222-2222-2222-222222222201', 'Huile 1L', 'HUI-001', 'pce', 1800, 2200, 8, true)
ON CONFLICT (company_id, sku) DO NOTHING;

-- ========== STORE INVENTORY (assign stock to stores) ==========
INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
SELECT s.id, p.id, 100, 0
FROM public.stores s
CROSS JOIN public.products p
WHERE s.company_id = '22222222-2222-2222-2222-222222222201' AND p.company_id = '22222222-2222-2222-2222-222222222201'
ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = 100;

-- ========== SUPPLIERS ==========
INSERT INTO public.suppliers (id, company_id, name, phone) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Fournisseur Boissons SARL', '+226 70 00 00 01'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Grossiste Alimentaire', '+226 70 00 00 02')
ON CONFLICT DO NOTHING;

-- ========== CUSTOMERS ==========
INSERT INTO public.customers (id, company_id, name, type, phone) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Client Particulier', 'individual', '+226 71 00 00 01'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Restaurant Le Bon Goût', 'company', '+226 71 00 00 02')
ON CONFLICT DO NOTHING;
