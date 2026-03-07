import React, { useMemo } from 'react';
import { Package, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * Affiche la disponibilité des produits pertinents pour un client
 * basée sur sa marque de moto et ses catégories préférées.
 */
export default function CustomerStockPanel({ customer, products = [] }) {
  const relevantProducts = useMemo(() => {
    if (!products.length) return [];

    const brand = customer.motorcycle_brand?.toLowerCase();
    const prefCats = (customer.preferred_categories || []).map(c => c.toLowerCase());
    const prefBrands = (customer.preferred_brands || []).map(b => b.toLowerCase());

    return products.filter(p => {
      if (p.status !== 'active') return false;
      const matchBrand = brand && (
        p.compatible_model?.toLowerCase().includes(brand) ||
        p.brand?.toLowerCase().includes(brand) ||
        p.name?.toLowerCase().includes(brand)
      );
      const matchCat = prefCats.length > 0 && prefCats.some(c =>
        p.category?.toLowerCase().includes(c) ||
        p.subcategory?.toLowerCase().includes(c)
      );
      const matchPrefBrand = prefBrands.length > 0 && prefBrands.some(b =>
        p.brand?.toLowerCase().includes(b)
      );
      return matchBrand || matchCat || matchPrefBrand;
    }).slice(0, 12);
  }, [products, customer]);

  // Alertes stock faible pour les produits liés
  const lowStockAlerts = relevantProducts.filter(p =>
    p.quantity <= (p.min_stock_alert || 5) && p.quantity > 0
  );
  const outOfStock = relevantProducts.filter(p => p.quantity === 0);

  if (relevantProducts.length === 0) return null;

  const getStockStatus = (p) => {
    if (p.quantity === 0) return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Rupture' };
    if (p.quantity <= (p.min_stock_alert || 5)) return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', label: `x${p.quantity}` };
    return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: `x${p.quantity}` };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Package className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          Produits liés ({relevantProducts.length})
        </p>
        {(lowStockAlerts.length > 0 || outOfStock.length > 0) && (
          <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {outOfStock.length + lowStockAlerts.length} alerte(s)
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {relevantProducts.map(p => {
          const status = getStockStatus(p);
          const Icon = status.icon;
          return (
            <div key={p.id} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${status.bg}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{p.brand || ''}{p.category ? ` · ${p.category}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs text-orange-500 dark:text-orange-400 font-medium">{p.sale_price?.toLocaleString()} F</span>
                <div className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {status.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(lowStockAlerts.length > 0 || outOfStock.length > 0) && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <p className="text-xs text-yellow-300 font-medium mb-1">⚠ Alertes stock pour ce client</p>
          {outOfStock.length > 0 && <p className="text-xs text-red-400">{outOfStock.length} produit(s) en rupture</p>}
          {lowStockAlerts.length > 0 && <p className="text-xs text-yellow-400">{lowStockAlerts.length} produit(s) en stock faible</p>}
          <Link to={createPageUrl('Alerts')} className="text-xs text-orange-400 hover:underline mt-1 block">→ Voir toutes les alertes</Link>
        </div>
      )}
    </div>
  );
}