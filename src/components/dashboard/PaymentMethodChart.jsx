import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '@/components/context/ThemeContext';

const COLORS = ['#F97316', '#3B82F6', '#8B5CF6', '#EF4444'];
const LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', mixed: 'Mixte', credit: 'Crédit' };

export default function PaymentMethodChart({ sales }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const tooltipBg = isDark ? '#1E293B' : '#FFFFFF';
  const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
  const tooltipColor = isDark ? '#fff' : '#0F172A';
  const legendColor = isDark ? '#94A3B8' : '#64748B';
  const map = {};
  sales.forEach(s => {
    if (s.status === 'cancelled') return;
    const key = s.payment_method || 'cash';
    map[key] = (map[key] || 0) + (s.total || 0);
  });

  const data = Object.entries(map).map(([key, value]) => ({ name: LABELS[key] || key, value }));

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Aucune donnée</div>
  );

  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none">
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Répartition des paiements</p>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v.toLocaleString()} F`} contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, color: tooltipColor }} />
          <Legend iconType="circle" iconSize={8} formatter={(val) => <span style={{ color: legendColor, fontSize: 11 }}>{val}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}