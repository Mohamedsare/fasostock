import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { invokeAI } from '@/lib/aiClient';
import { format, subDays, startOfMonth, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { TrendingUp, Brain, AlertTriangle, CheckCircle, RefreshCw, Zap } from 'lucide-react';

const COLORS = ['#F97316', '#3B82F6', '#22C55E', '#8B5CF6'];

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value?.toLocaleString()} FCFA</p>
      ))}
    </div>
  );
}

export default function Forecast() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [activeTab, setActiveTab] = useState('weekly');

  const { data: sales = [] } = useQuery({ queryKey: ['sales-forecast', shopId], queryFn: () => api.sales.list(shopId, 500) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses-forecast', shopId], queryFn: () => api.expenses.list(shopId, 200) });

  const historicalData = useMemo(() => {
    const today = new Date();
    const completed = sales.filter(s => s.status !== 'cancelled' && s.status !== 'refunded');
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const wStart = startOfWeek(subDays(today, i * 7), { weekStartsOn: 1 });
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
      const wSales = completed.filter(s => {
        const d = new Date(s.created_at);
        return d >= wStart && d <= wEnd;
      });
      weeks.push({ label: format(wStart, "'Sem' dd MMM", { locale: fr }), revenue: wSales.reduce((s, x) => s + (x.total || 0), 0), profit: wSales.reduce((s, x) => s + (x.profit || 0), 0), count: wSales.length });
    }
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = startOfMonth(subMonths(today, i));
      const mEnd = startOfMonth(subMonths(today, i - 1));
      const mSales = completed.filter(s => { const d = new Date(s.created_at); return d >= mStart && d < mEnd; });
      const mExpenses = expenses.filter(e => { const d = new Date(e.created_at); return d >= mStart && d < mEnd; });
      months.push({ label: format(mStart, 'MMM yyyy', { locale: fr }), revenue: mSales.reduce((s, x) => s + (x.total || 0), 0), profit: mSales.reduce((s, x) => s + (x.profit || 0), 0), expenses: mExpenses.reduce((s, x) => s + (x.amount || 0), 0), count: mSales.length });
    }
    return { weeks, months };
  }, [sales, expenses]);

  const generateForecast = async () => {
    setLoading(true);
    setForecast(null);
    try {
      const res = await invokeAI({
        prompt: `Tu es un expert en analyse financière pour un commerce de pièces moto. Analyse ces données de ventes historiques et génère des prévisions précises.

DONNÉES HEBDOMADAIRES (12 dernières semaines):\n${JSON.stringify(historicalData.weeks)}

DONNÉES MENSUELLES (6 derniers mois):\n${JSON.stringify(historicalData.months)}

Génère un JSON avec:
1. weekly_forecast: tableau de { label, predicted_revenue, lower_bound, upper_bound, is_shortfall } pour les 4 prochaines semaines
2. monthly_forecast: tableau de { label, predicted_revenue, predicted_profit, lower_bound, upper_bound, is_shortfall } pour les 3 prochains mois
3. trend_percent: nombre
4. trend_direction: "up" | "down" | "stable"
5. confidence_score: 0-100
6. alerts: tableau de { type: "warning"|"success"|"info", message: string }
7. summary: string

Tiens compte des tendances et patterns.`,
        response_json_schema: true,
      });
      setForecast(res);
    } catch (err) {
      console.error('Forecast error:', err);
      setForecast({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const weeklyChartData = useMemo(() => {
    const hist = historicalData.weeks.slice(-6).map(w => ({ label: w.label, actual: w.revenue, predicted: null }));
    const pred = (forecast?.weekly_forecast || []).map(w => ({ label: w.label, actual: null, predicted: w.predicted_revenue, shortfall: w.is_shortfall }));
    return [...hist, ...pred];
  }, [historicalData, forecast]);

  const monthlyChartData = useMemo(() => {
    const hist = historicalData.months.map(m => ({ label: m.label, actual: m.revenue, predicted: null, profit: m.profit }));
    const pred = (forecast?.monthly_forecast || []).map(m => ({ label: m.label, actual: null, predicted: m.predicted_revenue, profit: m.predicted_profit, shortfall: m.is_shortfall }));
    return [...hist, ...pred];
  }, [historicalData, forecast]);

  const trendColor = forecast?.trend_direction === 'up' ? 'text-emerald-400' : forecast?.trend_direction === 'down' ? 'text-red-400' : 'text-yellow-400';
  const trendBg = forecast?.trend_direction === 'up' ? 'bg-emerald-500/10 border-emerald-500/20' : forecast?.trend_direction === 'down' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Brain className="w-6 h-6 text-orange-500" />Prévisions IA</h1>
          <p className="text-sm text-slate-400 mt-1">Prédictions basées sur vos données historiques</p>
        </div>
        <button onClick={generateForecast} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {loading ? 'Analyse en cours...' : 'Générer les prévisions'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {historicalData.months.slice(-4).map((m, i) => (
          <div key={i} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm dark:shadow-none">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{m.label}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{m.revenue.toLocaleString()} F</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Bén: {m.profit.toLocaleString()} F</p>
          </div>
        ))}
      </div>

      {forecast?.error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-red-700 dark:text-red-400 text-sm space-y-1">
          <p className="font-medium">Erreur API IA</p>
          <p>{forecast.error}</p>
          <p className="text-xs opacity-90 mt-2">En local : lancez <code className="bg-red-100 dark:bg-red-500/20 px-1 rounded">npm run dev:local</code> et ajoutez <code className="bg-red-100 dark:bg-red-500/20 px-1 rounded">DEEPSEEK_API_KEY</code> dans <code className="bg-red-100 dark:bg-red-500/20 px-1 rounded">.env</code> ou <code className="bg-red-100 dark:bg-red-500/20 px-1 rounded">.env.local</code>. En production : configurez la clé dans Vercel.</p>
        </div>
      )}

      {!forecast && !loading && (
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 border-dashed rounded-2xl p-12 text-center shadow-sm dark:shadow-none">
          <Brain className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Cliquez sur &quot;Générer les prévisions&quot; pour obtenir des prédictions IA</p>
        </div>
      )}

      {loading && (
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-12 text-center shadow-sm dark:shadow-none">
          <RefreshCw className="w-10 h-10 text-orange-500 mx-auto mb-4 animate-spin" />
          <p className="text-slate-900 dark:text-white font-medium">Analyse en cours...</p>
        </div>
      )}

      {forecast && !forecast.error && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`lg:col-span-2 rounded-2xl border p-5 ${trendBg}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Analyse IA</p>
              <p className="text-sm text-slate-700 dark:text-white leading-relaxed">{forecast.summary || '—'}</p>
              <div className={`flex items-center gap-2 font-bold text-lg mt-4 ${trendColor}`}>
                <TrendingUp className="w-5 h-5" />
                {forecast.trend_direction === 'up' ? '+' : forecast.trend_direction === 'down' ? '-' : ''}{Math.abs(forecast.trend_percent || 0).toFixed(1)}% tendance
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 flex flex-col items-center justify-center shadow-sm dark:shadow-none">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Indice de confiance</p>
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E293B" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F97316" strokeWidth="3" strokeDasharray={`${forecast.confidence_score || 0} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-bold text-slate-900 dark:text-white">{forecast.confidence_score || 0}%</span></div>
              </div>
            </div>
          </div>

          {forecast.alerts?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {forecast.alerts.map((alert, i) => (
                <div key={i} className={`rounded-xl p-4 border flex items-start gap-3 ${alert.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' : alert.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                  {alert.type === 'warning' ? <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" /> : alert.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <TrendingUp className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{alert.message}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {['weekly', 'monthly'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                {tab === 'weekly' ? 'Prévisions Hebdo' : 'Prévisions Mensuelle'}
              </button>
            ))}
          </div>

          {activeTab === 'weekly' && (
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">CA Réel vs Prévu</p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={weeklyChartData}>
                  <defs>
                    <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#F97316" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradPred" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ForecastTooltip />} />
                  <Area type="monotone" dataKey="actual" stroke="#F97316" strokeWidth={2} fill="url(#gradActual)" name="Réel" />
                  <Area type="monotone" dataKey="predicted" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 3" fill="url(#gradPred)" name="Prévu" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'monthly' && (
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">CA & Bénéfice — Historique + Prévisions</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ForecastTooltip />} />
                  <Bar dataKey="actual" name="CA Réel" fill="#F97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="predicted" name="CA Prévu" fill="#3B82F6" radius={[3, 3, 0, 0]} opacity={0.8} />
                  <Bar dataKey="profit" name="Bénéfice" fill="#22C55E" radius={[3, 3, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
