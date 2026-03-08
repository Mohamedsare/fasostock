/**
 * FasoStock - API Supabase
 * Couche d'accès aux données
 */
import { supabase } from '@/lib/supabase';

// Helpers génériques
export const from = (table) => supabase.from(table);

export const api = {
  // Organizations (entreprises)
  organizations: {
    list: async () => {
      const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('organizations').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('organizations').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  },

  // Organization members (user <-> org, role)
  organizationMembers: {
    list: async (userId) => {
      let q = supabase.from('organization_members').select('*, organizations(name)');
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('organization_members').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (userId, organizationId) => {
      const { error } = await supabase.from('organization_members').delete().eq('user_id', userId).eq('organization_id', organizationId);
      if (error) throw error;
    },
  },

  // Shop members (cashier/product_manager -> shops)
  shopMembers: {
    list: async (userId) => {
      const { data, error } = await supabase.from('shop_members').select('*, shops(name, is_active)').eq('user_id', userId);
      if (error) throw error;
      return data || [];
    },
    setForUser: async (userId, shopIds) => {
      await supabase.from('shop_members').delete().eq('user_id', userId);
      if (shopIds?.length) {
        const rows = shopIds.map(shop_id => ({ user_id: userId, shop_id }));
        const { error } = await supabase.from('shop_members').insert(rows);
        if (error) throw error;
      }
    },
  },

  // Shops
  shops: {
    list: async () => {
      const { data, error } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    listForUser: async (userId, profileRole) => {
      if (profileRole === 'super_admin') {
        const { data, error } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      }
      const { data: orgMembers } = await supabase.from('organization_members').select('organization_id, role').eq('user_id', userId);
      if (orgMembers?.length) {
        const ownerOrgIds = orgMembers.filter(m => m.role === 'owner').map(m => m.organization_id);
        if (ownerOrgIds.length) {
          const { data, error } = await supabase.from('shops').select('*').in('organization_id', ownerOrgIds).eq('is_active', true).order('created_at', { ascending: false });
          if (error) throw error;
          return data || [];
        }
        const { data: sm } = await supabase.from('shop_members').select('shop_id').eq('user_id', userId);
        const shopIds = (sm || []).map(s => s.shop_id).filter(Boolean);
        if (shopIds.length) {
          const { data, error } = await supabase.from('shops').select('*').in('id', shopIds).eq('is_active', true).order('created_at', { ascending: false });
          if (error) throw error;
          return data || [];
        }
      }
      return [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('shops').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('shops').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('shops').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Products (filtrés par shop_id via ShopContext)
  products: {
    get: async (id) => {
      const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    list: async (shopId) => {
      let q = supabase.from('products').select('*').order('created_at', { ascending: false });
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    filter: async (filters, shopId) => {
      let q = supabase.from('products').select('*').order('created_at', { ascending: false });
      if (shopId) q = q.eq('shop_id', shopId);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('products').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('products').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Sales
  sales: {
    list: async (shopId, limit = 500) => {
      let q = supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(limit);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('sales').insert(row).select().single();
      if (error) throw error;
      return data;
    },
  },

  // Customers
  customers: {
    list: async (shopId, limit = 500) => {
      let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(limit);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('customers').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('customers').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Repair orders
  repairOrders: {
    list: async (shopId) => {
      let q = supabase.from('repair_orders').select('*').order('created_at', { ascending: false });
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('repair_orders').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('repair_orders').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  },

  // Expenses
  expenses: {
    list: async (shopId, limit = 500) => {
      let q = supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(limit);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('expenses').insert(row).select().single();
      if (error) throw error;
      return data;
    },
  },

  // Campaigns
  campaigns: {
    list: async (shopId, limit = 100) => {
      let q = supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(limit);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('campaigns').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Categories
  categories: {
    list: async (shopId) => {
      let q = supabase.from('categories').select('*').order('name');
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('categories').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Brands
  brands: {
    list: async (shopId) => {
      let q = supabase.from('brands').select('*').order('name');
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('brands').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
    },
  },

  // Suppliers
  suppliers: {
    list: async (shopId) => {
      let q = supabase.from('suppliers').select('*').order('name');
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  },

  // Settings (par shop ou global)
  settings: {
    list: async (shopId) => {
      let q = supabase.from('settings').select('*');
      if (shopId) q = q.eq('shop_id', shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    create: async (row) => {
      const { data, error } = await supabase.from('settings').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('settings').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  },

  // Profiles (utilisateurs)
  profiles: {
    list: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data || [];
    },
    listByOrganization: async (organizationId) => {
      const { data: memberIds } = await supabase.from('organization_members').select('user_id').eq('organization_id', organizationId);
      const ids = (memberIds || []).map(m => m.user_id).filter(Boolean);
      if (!ids.length) return [];
      const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
      if (error) throw error;
      return data || [];
    },
    update: async (id, row) => {
      const { data, error } = await supabase.from('profiles').update(row).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  },
};
