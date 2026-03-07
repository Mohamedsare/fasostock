import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '@/components/context/ThemeContext';

const COLORS = ['#F97316', '#3B82F6', '#22C55E', '#8B5CF6', '#EAB308', '#EF4444', '#06B6D4', '#EC4899'];

export default function CategoryRevenueChart({ sales, products }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const tickFill = isDark ? '#94A3B8' : '#64748B';
  const tooltipBg = isDark ? '#1E293B' : '#FFFFFF';
  const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
  const tooltipColor = isDark ? '#fff' : '#0F172A';
  // Build category map from products
  const productCategory = {};
  products.forEach(p => { productCategory[p.id] = p.category || 'Autre'; });

  const catMap = {};
  sales.forEach(s => {
    if (s.status === 'cancelled') return;
    s.items?.forEach(item => {
      const cat = productCategory[item.product_id] || 'Autre';
      catMap[cat] = (catMap[cat] || 0) + (item.total || 0);
    });
  });

  const data = Object.entries(catMap)
    .map(([cat, value]) => ({ name: cat.length > 12 ? cat.slice(0, 12) + '…' : cat, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Aucune donnée</div>
  );

  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">CA par catégorie</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={18}>
          <XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: tickFill, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => `${v.toLocaleString()} F`} contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, color: tooltipColor }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}