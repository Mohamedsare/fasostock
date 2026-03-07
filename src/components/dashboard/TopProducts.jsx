import React from 'react';
import { TrendingUp } from 'lucide-react';

export default function TopProducts({ products }) {
  if (!products?.length) {
    return (
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Top Produits Vendus</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">Aucune donnée</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Produits Vendus</h3>
      </div>
      <div className="space-y-3">
        {products.slice(0, 10).map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-orange-600 dark:text-orange-400">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-900 dark:text-white truncate">{p.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{p.quantity_sold} vendus</p>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.total_revenue?.toLocaleString()} F</p>
          </div>
        ))}
      </div>
    </div>
  );
}