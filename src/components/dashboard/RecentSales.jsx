import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Receipt } from 'lucide-react';

export default function RecentSales({ sales }) {
  if (!sales?.length) {
    return (
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Ventes Récentes</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">Aucune vente récente</p>
      </div>
    );
  }

  const paymentLabels = { cash: 'Cash', mobile_money: 'Mobile Money', mixed: 'Mixte', credit: 'Crédit' };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-white">Ventes Récentes</h3>
      </div>
      <div className="space-y-3">
        {sales.slice(0, 8).map((sale) => (
          <div key={sale.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">#{sale.sale_number || sale.id?.slice(0, 8)}</p>
              <p className="text-xs text-slate-400">
                {sale.created_at ? format(new Date(sale.created_at), 'dd MMM HH:mm', { locale: fr }) : ''}
                {' · '}{sale.items?.length || 0} article(s)
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{sale.total?.toLocaleString()} F</p>
              <span className="text-xs text-slate-500 dark:text-slate-400">{paymentLabels[sale.payment_method] || sale.payment_method}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}