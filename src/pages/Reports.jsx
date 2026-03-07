import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { invokeAI } from '@/lib/aiClient';
import { FileText, Sparkles, TrendingUp, Package, Users, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui-custom/PageHeader';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import { subDays, subMonths, startOfWeek, startOfMonth, isAfter, format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PERIODS = [
  { label: 'Cette semaine', value: 'week' },
  { label: 'Ce mois', value: 'month' },
  { label: 'Mois précédent', value: 'last_month' },
];

function ReportSection({ title, icon: Icon, color, content, loading, onGenerate, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 overflow-hidden shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
          <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {!content && !loading && <Button size="sm" onClick={e => { e.stopPropagation(); onGenerate(); setOpen(true); }} className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8 gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Générer</Button>}
          {content && !loading && <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onGenerate(); setOpen(true); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs h-8 gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Actualiser</Button>}
          {open ? <span className="text-slate-500 dark:text-slate-400">▲</span> : <span className="text-slate-500 dark:text-slate-400">▼</span>}
        </div>
      </div>
      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-200 dark:border-slate-700/40">
          {loading ? <div className="flex items-center gap-3 py-8 justify-center"><div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-500 dark:text-slate-400 text-sm">Analyse IA en cours…</span></div> : content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 [&_h2]:text-orange-500 dark:[&_h2]:text-orange-400 [&_h3]:text-slate-700 dark:[&_h3]:text-slate-200 [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_li]:text-slate-600 dark:[&_li]:text-slate-300">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">Cliquez sur « Générer » pour créer ce rapport avec l&apos;IA.</p>}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [period, setPeriod] = useState('week');
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState({});

  const { data: sales = [] } = useQuery({ queryKey: ['sales', shopId], queryFn: () => api.sales.list(shopId, 1000) });
  const { data: products = [] } = useQuery({ queryKey: ['products', shopId], queryFn: () => api.products.list(shopId) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers', shopId], queryFn: () => api.customers.list(shopId) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses', shopId], queryFn: () => api.expenses.list(shopId, 200) });

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'week') return { from: startOfWeek(now, { weekStartsOn: 1 }), label: 'cette semaine' };
    if (period === 'month') return { from: startOfMonth(now), label: 'ce mois' };
    if (period === 'last_month') { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: startOfMonth(now), label: 'le mois dernier' }; }
    return { from: subDays(now, 7), label: 'cette semaine' };
  }, [period]);

  const filteredSales = useMemo(() => sales.filter(s => {
    if (s.status === 'cancelled') return false;
    const d = new Date(s.created_at);
    if (dateRange.to && !isAfter(dateRange.to, d)) return false;
    return isAfter(d, dateRange.from);
  }), [sales, dateRange]);

  const buildSalesSummary = () => {
    const total = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const profit = filteredSales.reduce((acc, s) => acc + (s.profit || 0), 0);
    const byDay = {};
    filteredSales.forEach(s => { const day = format(new Date(s.created_at), 'EEE dd/MM', { locale: fr }); byDay[day] = (byDay[day] || 0) + (s.total || 0); });
    const topProducts = {};
    filteredSales.forEach(s => (s.items || []).forEach(i => { topProducts[i.product_name] = (topProducts[i.product_name] || 0) + (i.quantity || 0); }));
    const topSorted = Object.entries(topProducts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { total, profit, count: filteredSales.length, byDay, topProducts: topSorted };
  };

  const buildProductsSummary = () => {
    const lowStock = products.filter(p => p.quantity <= (p.min_stock_alert || 5));
    const outStock = products.filter(p => p.quantity === 0);
    const productSales = {};
    filteredSales.forEach(s => (s.items || []).forEach(i => {
      if (!productSales[i.product_id]) productSales[i.product_id] = { name: i.product_name, qty: 0, revenue: 0 };
      productSales[i.product_id].qty += i.quantity || 0;
      productSales[i.product_id].revenue += i.total || 0;
    }));
    const top = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    return { lowStock: lowStock.length, outStock: outStock.length, totalProducts: products.length, top };
  };

  const buildCustomersSummary = () => {
    const bySegment = {};
    customers.forEach(c => { bySegment[c.segment || 'new'] = (bySegment[c.segment || 'new'] || 0) + 1; });
    const custSales = {};
    filteredSales.forEach(s => {
      if (!s.customer_phone) return;
      if (!custSales[s.customer_phone]) custSales[s.customer_phone] = { name: s.customer_name, total: 0, count: 0 };
      custSales[s.customer_phone].total += s.total || 0;
      custSales[s.customer_phone].count += 1;
    });
    const top = Object.values(custSales).sort((a, b) => b.total - a.total).slice(0, 8);
    return { total: customers.length, bySegment, topBuyers: top };
  };

  const generate = async (type) => {
    setLoading(l => ({ ...l, [type]: true }));
    const ss = buildSalesSummary();
    const ps = buildProductsSummary();
    const cs = buildCustomersSummary();
    const periodLabel = dateRange.label;
    let prompt = '';
    if (type === 'sales') prompt = `Tu es un analyste business expert en commerce de pièces moto. Génère un rapport de performance des ventes en **markdown structuré** pour ${periodLabel}.
Données : ${ss.count} ventes, CA total: ${ss.total.toLocaleString('fr')} FCFA, Bénéfice: ${ss.profit.toLocaleString('fr')} FCFA. Inclus: résumé exécutif, analyse, recommandations, prévision.`;
    if (type === 'products') prompt = `Tu es un analyste stock expert. Génère un rapport produits en **markdown** pour ${periodLabel}. Données: ${ps.totalProducts} produits, ${ps.outStock} en rupture, ${ps.lowStock} stock faible. Inclus: état du stock, produits stars, recommandations.`;
    if (type === 'customers') prompt = `Tu es un expert CRM. Génère un rapport clients en **markdown** pour ${periodLabel}. Données: ${cs.total} clients, segments: ${JSON.stringify(cs.bySegment)}. Inclus: profil clientèle, clients actifs, actions CRM recommandées.`;
    if (type === 'forecast') {
      const prevSales = sales.filter(s => { if (s.status === 'cancelled') return false; const d = new Date(s.created_at); const from2 = period === 'week' ? subDays(dateRange.from, 7) : subMonths(dateRange.from, 1); return isAfter(d, from2) && !isAfter(d, dateRange.from); });
      const prevTotal = prevSales.reduce((acc, s) => acc + (s.total || 0), 0);
      const currTotal = ss.total;
      const growth = prevTotal > 0 ? (((currTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 'N/A';
      prompt = `Tu es un analyste financier. Génère des prévisions en **markdown** pour ${periodLabel}. CA période précédente: ${prevTotal.toLocaleString('fr')} FCFA. CA actuel: ${currTotal.toLocaleString('fr')} FCFA. Croissance: ${growth}%. Inclus: tendance, prévision CA prochaine période, risques, plan d'action.`;
    }
    try {
      const result = await invokeAI({ prompt });
      setReports(r => ({ ...r, [type]: typeof result === 'string' ? result : result?.raw || JSON.stringify(result) }));
    } catch (err) {
      setReports(r => ({ ...r, [type]: `Erreur: ${err.message}` }));
    }
    setLoading(l => ({ ...l, [type]: false }));
  };

  const generateAll = () => ['sales', 'products', 'customers', 'forecast'].forEach(type => generate(type));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Rapports IA" subtitle="Analyses automatiques basées sur vos données" actions={
        <div className="flex gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-xl p-1 gap-1">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => { setPeriod(p.value); setReports({}); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p.value ? 'bg-orange-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{p.label}</button>
            ))}
          </div>
          <Button onClick={generateAll} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white gap-2"><Sparkles className="w-4 h-4" />Tout générer</Button>
        </div>
      } />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Ventes', value: filteredSales.length }, { label: 'CA', value: filteredSales.reduce((a, s) => a + (s.total || 0), 0).toLocaleString('fr') + ' FCFA' }, { label: 'Bénéfice', value: filteredSales.reduce((a, s) => a + (s.profit || 0), 0).toLocaleString('fr') + ' FCFA' }, { label: 'Clients', value: customers.length }].map((kpi, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 p-4 shadow-sm dark:shadow-none">
            <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <ReportSection title="Rapport des Ventes" icon={TrendingUp} color="bg-blue-500/15 text-blue-400" content={reports.sales} loading={loading.sales} onGenerate={() => generate('sales')} defaultOpen />
        <ReportSection title="Analyse des Produits" icon={Package} color="bg-green-500/15 text-green-400" content={reports.products} loading={loading.products} onGenerate={() => generate('products')} />
        <ReportSection title="Analyse Clients (CRM)" icon={Users} color="bg-purple-500/15 text-purple-400" content={reports.customers} loading={loading.customers} onGenerate={() => generate('customers')} />
        <ReportSection title="Prévisions de Ventes" icon={Sparkles} color="bg-orange-500/15 text-orange-400" content={reports.forecast} loading={loading.forecast} onGenerate={() => generate('forecast')} />
      </div>
    </div>
  );
}
