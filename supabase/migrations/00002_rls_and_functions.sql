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
