import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function LowStockAlert({ products }) {
  if (!products?.length) {
    return (
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Alertes Stock</h3>
        <div className="text-center py-6">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
            <span className="text-emerald-400 text-lg">✓</span>
          </div>
          <p className="text-sm text-emerald-400">Stock OK</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Alertes Stock ({products.length})</h3>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-900 dark:text-white truncate">{p.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{p.brand || 'Sans marque'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${p.quantity === 0 ? 'text-red-500 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {p.quantity}
              </span>
              <span className="text-xs text-slate-500">/{p.min_stock_alert}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}