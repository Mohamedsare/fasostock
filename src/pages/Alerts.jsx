import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { AlertTriangle, PackageX, TrendingDown, Clock, Users } from 'lucide-react';
import PageHeader from '../components/ui-custom/PageHeader';

export default function Alerts() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;

  const { data: products = [] } = useQuery({
    queryKey: ['products', shopId],
    queryFn: () => api.products.filter({ status: 'active' }, shopId),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', shopId],
    queryFn: () => api.sales.list(shopId, 500),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', shopId],
    queryFn: () => api.customers.list(shopId, 500),
  });

  const alerts = useMemo(() => {
    const list = [];
    products.filter(p => p.quantity === 0).forEach(p => {
      list.push({ type: 'danger', icon: PackageX, title: 'Rupture de stock', desc: `${p.name} — quantité: 0`, product: p });
    });
    products.filter(p => p.quantity > 0 && p.quantity <= (p.min_stock_alert || 5)).forEach(p => {
      list.push({ type: 'warning', icon: AlertTriangle, title: 'Stock faible', desc: `${p.name} — ${p.quantity} restant(s) (seuil: ${p.min_stock_alert || 5})`, product: p });
    });
    products.filter(p => {
      if (!p.sale_price || !p.purchase_price) return false;
      const margin = ((p.sale_price - p.purchase_price) / p.sale_price) * 100;
      return margin < 10 && margin >= 0;
    }).forEach(p => {
      const margin = (((p.sale_price - p.purchase_price) / p.sale_price) * 100).toFixed(1);
      list.push({ type: 'info', icon: TrendingDown, title: 'Marge faible', desc: `${p.name} — marge: ${margin}%`, product: p });
    });
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlySoldIds = new Set();
    sales.filter(s => s.created_at && new Date(s.created_at) >= thirtyDaysAgo).forEach(s => {
      (s.items || []).forEach(item => recentlySoldIds.add(item.product_id));
    });
    products.filter(p => p.quantity > 0 && !recentlySoldIds.has(p.id)).forEach(p => {
      list.push({ type: 'stagnant', icon: Clock, title: 'Produit stagnant', desc: `${p.name} — aucune vente depuis 30 jours`, product: p });
    });
    const prefBrands = new Set();
    const prefCats = new Set();
    customers.forEach(c => {
      (c.preferred_brands || []).forEach(b => prefBrands.add(b.toLowerCase()));
      (c.preferred_categories || []).forEach(cat => prefCats.add(cat.toLowerCase()));
      if (c.motorcycle_brand) prefBrands.add(c.motorcycle_brand.toLowerCase());
    });
    if (prefBrands.size > 0 || prefCats.size > 0) {
      products.filter(p => {
        const inPrefBrand = p.brand && prefBrands.has(p.brand.toLowerCase());
        const inPrefCat = p.category && prefCats.has(p.category.toLowerCase());
        return (inPrefBrand || inPrefCat) && p.quantity <= (p.min_stock_alert || 5);
      }).forEach(p => {
        const alreadyAdded = list.some(a => (a.type === 'danger' || a.type === 'warning') && a.product?.id === p.id);
        if (!alreadyAdded) {
          list.push({ type: 'crm', icon: Users, title: 'Stock faible — produit populaire CRM', desc: `${p.name} — ${p.quantity} restant(s) · Lié aux préférences clients`, product: p });
        }
      });
    }
    return list;
  }, [products, sales, customers]);

  const typeStyles = {
    danger: 'border-red-500/20 bg-red-500/5',
    warning: 'border-yellow-500/20 bg-yellow-500/5',
    info: 'border-blue-500/20 bg-blue-500/5',
    stagnant: 'border-purple-500/20 bg-purple-500/5',
    crm: 'border-orange-500/20 bg-orange-500/5',
  };
  const iconStyles = {
    danger: 'text-red-400 bg-red-500/10',
    warning: 'text-yellow-400 bg-yellow-500/10',
    info: 'text-blue-400 bg-blue-500/10',
    stagnant: 'text-purple-400 bg-purple-500/10',
    crm: 'text-orange-400 bg-orange-500/10',
  };
  const dangerCount = alerts.filter(a => a.type === 'danger').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Alertes Intelligentes" subtitle={`${dangerCount} rupture(s), ${warningCount} stock(s) faible(s), ${alerts.length} alerte(s) au total`} />

      {alerts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tout va bien !</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Aucune alerte pour le moment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => {
            const AlertIcon = alert.icon;
            return (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-xl border bg-white dark:bg-transparent shadow-sm dark:shadow-none ${typeStyles[alert.type]}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconStyles[alert.type]}`}>
                  <AlertIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{alert.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{alert.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
