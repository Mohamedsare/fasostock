-- FasoStock - Multi-tenant & niveaux utilisateurs
-- Entreprises (organizations) -> Boutiques (shops) -> Utilisateurs par rôle

-- ============================================================
-- Fonction set_updated_at (si pas déjà créée)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: organizations (entreprises)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Ajouter organization_id à shops
-- ============================================================
ALTER TABLE shops ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shops_organization ON shops(organization_id);

-- ============================================================
-- TABLE: organization_members (user <-> org, rôle)
-- owner | cashier | product_manager
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'cashier', 'product_manager')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

-- ============================================================
-- TABLE: shop_members (vendeur/gestionnaire -> boutiques)
-- owner voit toutes les boutiques; cashier/product_manager
-- ont accès aux boutiques listées ici
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_members_user ON shop_members(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_members_shop ON shop_members(shop_id);

-- ============================================================
-- Mettre à jour profiles.role
-- super_admin = admin plateforme
-- owner = propriétaire entreprise (tous droits sur ses boutiques)
-- cashier = caissier/vendeur (vente uniquement)
-- product_manager = gestionnaire produits (créer + vendre)
-- manager, stockist, accountant = gardés pour compatibilité
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('super_admin', 'owner', 'manager', 'cashier', 'product_manager', 'stockist', 'accountant')
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access organizations" ON organizations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access org_members" ON organization_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access shop_members" ON shop_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Trigger updated_at pour organizations
-- ============================================================
DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Mettre à jour handle_new_user pour metadata (org, role)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_org_id UUID;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cashier');
  v_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    v_role
  );

  IF v_org_id IS NOT NULL THEN
    INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (NEW.id, v_org_id, v_role);
  END IF;

  -- shop_ids: app insère après signUp
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
