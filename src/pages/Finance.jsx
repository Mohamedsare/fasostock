import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Wallet, TrendingDown, TrendingUp, DollarSign, X, Save } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import KPICard from '../components/ui-custom/KPICard';
import PageHeader from '../components/ui-custom/PageHeader';

const CATEGORIES = [
  { value: 'supplier_purchase', label: 'Achat fournisseur' },
  { value: 'rent', label: 'Loyer' },
  { value: 'salary', label: 'Salaires' },
  { value: 'utilities', label: 'Charges' },
  { value: 'transport', label: 'Transport' },
  { value: 'maintenance', label: 'Entretien' },
  { value: 'other', label: 'Autre' },
];

export default function Finance() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', amount: 0, category: 'other', payment_method: 'cash', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  const queryClient = useQueryClient();

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', shopId],
    queryFn: () => api.expenses.list(shopId, 500),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', shopId],
    queryFn: () => api.sales.list(shopId, 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.expenses.create({ ...data, shop_id: shopId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setShowForm(false); setForm({ description: '', amount: 0, category: 'other', payment_method: 'cash', date: format(new Date(), 'yyyy-MM-dd'), notes: '' }); },
  });

  const stats = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const monthExpenses = expenses.filter(e => e.created_at && new Date(e.created_at) >= monthStart);
    const monthSales = sales.filter(s => s.created_at && new Date(s.created_at) >= monthStart && s.status !== 'cancelled');
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalRevenue = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const netProfit = totalProfit - totalExpenses;
    return { totalExpenses, totalRevenue, totalProfit, netProfit };
  }, [expenses, sales]);

  const catLabel = (cat) => CATEGORIES.find(c => c.value === cat)?.label || cat;
  const payLabels = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Virement' };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Gestion Financière" subtitle="Suivi des dépenses et revenus" actions={
        <Button onClick={() => setShowForm(true)} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />Nouvelle Dépense
        </Button>
      } />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Revenus du mois" value={`${stats.totalRevenue.toLocaleString()} F`} icon={DollarSign} color="green" />
        <KPICard title="Dépenses du mois" value={`${stats.totalExpenses.toLocaleString()} F`} icon={TrendingDown} color="red" />
        <KPICard title="Bénéfice brut" value={`${stats.totalProfit.toLocaleString()} F`} icon={TrendingUp} color="blue" />
        <KPICard title="Bénéfice net" value={`${stats.netProfit.toLocaleString()} F`} icon={Wallet} color={stats.netProfit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dépenses récentes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Description</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 hidden md:table-cell">Catégorie</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 hidden md:table-cell">Date</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Montant</th>
                <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4 hidden md:table-cell">Paiement</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id} className="border-b border-slate-200 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="p-4">
                    <p className="text-sm text-slate-900 dark:text-white">{exp.description}</p>
                    {exp.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{exp.notes}</p>}
                  </td>
                  <td className="p-4 hidden md:table-cell"><Badge className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs">{catLabel(exp.category)}</Badge></td>
                  <td className="p-4 hidden md:table-cell"><span className="text-sm text-slate-600 dark:text-slate-300">{exp.date || (exp.created_at ? format(new Date(exp.created_at), 'dd MMM yy', { locale: fr }) : '')}</span></td>
                  <td className="p-4 text-right"><span className="text-sm font-semibold text-red-600 dark:text-red-400">-{exp.amount?.toLocaleString()} F</span></td>
                  <td className="p-4 text-center hidden md:table-cell"><span className="text-xs text-slate-500 dark:text-slate-400">{payLabels[exp.payment_method] || exp.payment_method}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 pt-20 pb-20">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md animate-slide-up shadow-xl dark:shadow-none my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nouvelle Dépense</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Description *</Label><Input value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" required /></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Montant (FCFA) *</Label><Input type="number" value={form.amount} onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" required /></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Catégorie</Label><Select value={form.category} onValueChange={(v) => setForm(prev => ({ ...prev, category: v }))}><SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Mode de paiement</Label><Select value={form.payment_method} onValueChange={(v) => setForm(prev => ({ ...prev, payment_method: v }))}><SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement</SelectItem></SelectContent></Select></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" /></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-16" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Annuler</Button>
                <Button onClick={() => createMutation.mutate(form)} className="bg-orange-500 hover:bg-orange-600 text-white"><Save className="w-4 h-4 mr-2" />Enregistrer</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
