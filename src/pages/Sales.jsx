import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Receipt, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReceiptModal from '@/components/pos/ReceiptModal';

export default function Sales() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [period, setPeriod] = useState('month');
  const [selectedSale, setSelectedSale] = useState(null);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', shopId],
    queryFn: () => api.sales.list(shopId, 500),
  });

  const now = new Date();
  const filtered = useMemo(() => {
    return sales.filter(s => {
      if (s.status === 'cancelled') return false;
      const d = s.created_at ? new Date(s.created_at) : null;
      if (!d) return false;
      let matchPeriod = true;
      if (period === 'today') matchPeriod = format(d, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
      if (period === 'week') matchPeriod = d >= startOfWeek(now, { weekStartsOn: 1 });
      if (period === 'month') matchPeriod = d >= startOfMonth(now);
      return matchPeriod;
    });
  }, [sales, period, now]);

  const totalRevenue = filtered.reduce((a, s) => a + (s.total || 0), 0);
  const totalProfit = filtered.reduce((a, s) => a + (s.profit || 0), 0);

  const periods = [
    { value: 'today', label: "Aujourd'hui" },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ventes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{filtered.length} vente(s) sur la période</p>
      </div>

      <div className="flex gap-2">
        {periods.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${period === p.value ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Chiffre d'affaires</p>
          <p className="text-2xl font-bold text-orange-500 dark:text-orange-400 mt-1">{totalRevenue.toLocaleString()} F</p>
        </div>
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Bénéfice</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totalProfit.toLocaleString()} F</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Historique des ventes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">N°</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 hidden md:table-cell">Date</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Total</th>
                <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 hidden md:table-cell">Mode</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sale => (
                <tr key={sale.id} className="border-b border-slate-200 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="p-4">
                    <button type="button" onClick={() => setSelectedSale(sale)} className="text-left w-full">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-slate-400 dark:text-slate-500 hidden sm:block" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">#{sale.sale_number || sale.id?.slice(0, 8)}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 sm:hidden mt-0.5">{sale.created_at ? format(new Date(sale.created_at), 'dd MMM yy · HH:mm', { locale: fr }) : ''}</p>
                    </button>
                  </td>
                  <td className="p-4 hidden md:table-cell"><span className="text-sm text-slate-600 dark:text-slate-300">{sale.created_at ? format(new Date(sale.created_at), 'dd MMM yy HH:mm', { locale: fr }) : ''}</span></td>
                  <td className="p-4 text-right"><span className="text-sm font-semibold text-slate-900 dark:text-white">{sale.total?.toLocaleString()} F</span></td>
                  <td className="p-4 text-center hidden md:table-cell"><span className="text-xs text-slate-500 dark:text-slate-400">{sale.payment_method || '-'}</span></td>
                  <td className="p-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSale(sale)} className="h-9 gap-1.5 text-slate-600 dark:text-slate-400 hover:text-orange-500">
                      <Eye className="w-4 h-4" /> <span className="hidden sm:inline">Ticket</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSale && (
        <ReceiptModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          shop={currentShop}
          title="Détail de la vente"
        />
      )}
    </div>
  );
}
