import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { DollarSign, ShoppingCart, Package, TrendingUp, Wrench, Receipt, Percent, Users } from 'lucide-react';
import KPICard from '../components/ui-custom/KPICard';
import SalesChart from '../components/dashboard/SalesChart';
import TopProducts from '../components/dashboard/TopProducts';
import RecentSales from '../components/dashboard/RecentSales';
import LowStockAlert from '../components/dashboard/LowStockAlert';
import PaymentMethodChart from '../components/dashboard/PaymentMethodChart';
import CategoryRevenueChart from '../components/dashboard/CategoryRevenueChart';
import ProfitChart from '../components/dashboard/ProfitChart';
import StatsMiniCard from '../components/dashboard/StatsMiniCard';
import { format, subDays, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Dashboard() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', shopId],
    queryFn: () => api.sales.list(shopId, 500),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products', shopId],
    queryFn: () => api.products.list(shopId),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', shopId],
    queryFn: () => api.expenses.list(shopId, 200),
  });
  const { data: repairs = [] } = useQuery({
    queryKey: ['repairs-all', shopId],
    queryFn: () => api.repairOrders.list(shopId),
  });

  const stats = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const monthStart = startOfMonth(today);
    const prevMonthStart = startOfMonth(subMonths(today, 1));
    const prevMonthEnd = monthStart;

    const completedSales = sales.filter(s => s.status !== 'cancelled' && s.status !== 'refunded');

    const todaySales = completedSales.filter(s => s.created_at && format(new Date(s.created_at), 'yyyy-MM-dd') === todayStr);
    const weekSales = completedSales.filter(s => s.created_at && new Date(s.created_at) >= weekStart);
    const monthSales = completedSales.filter(s => s.created_at && new Date(s.created_at) >= monthStart);
    const prevMonthSales = completedSales.filter(s => s.created_at && new Date(s.created_at) >= prevMonthStart && new Date(s.created_at) < prevMonthEnd);

    const todayRevenue = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
    const weekRevenue = weekSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const monthRevenue = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const prevMonthRevenue = prevMonthSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const todayProfit = todaySales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const monthExpenses = expenses.filter(e => e.created_at && new Date(e.created_at) >= monthStart).reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = monthProfit - monthExpenses;

    const avgBasket = monthSales.length > 0 ? monthRevenue / monthSales.length : 0;
    const marginPercent = monthRevenue > 0 ? ((monthProfit / monthRevenue) * 100).toFixed(1) : 0;
    const revenueGrowth = prevMonthRevenue > 0 ? (((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100).toFixed(1) : null;
    const uniqueCustomers = new Set(monthSales.filter(s => s.customer_name).map(s => s.customer_name)).size;

    const totalProducts = products.length;
    const lowStock = products.filter(p => p.quantity <= (p.min_stock_alert || 5) && p.status === 'active');
    const outOfStock = products.filter(p => p.quantity === 0 && p.status === 'active');
    const totalStockValue = products.reduce((sum, p) => sum + (p.purchase_price || 0) * (p.quantity || 0), 0);
    const totalRetailValue = products.reduce((sum, p) => sum + (p.sale_price || 0) * (p.quantity || 0), 0);

    const pendingRepairs = repairs.filter(r => r.status === 'pending').length;
    const inProgressRepairs = repairs.filter(r => r.status === 'in_progress').length;
    const repairRevenue = repairs.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + (r.total_cost || 0), 0);

    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(today, i);
      const dStr = format(d, 'yyyy-MM-dd');
      const daySales = completedSales.filter(s => s.created_at && format(new Date(s.created_at), 'yyyy-MM-dd') === dStr);
      chartData.push({
        name: format(d, 'EEE', { locale: fr }),
        revenue: daySales.reduce((sum, s) => sum + (s.total || 0), 0),
        profit: daySales.reduce((sum, s) => sum + (s.profit || 0), 0),
      });
    }

    const productSalesMap = {};
    completedSales.forEach(s => {
      (s.items || []).forEach(item => {
        if (!productSalesMap[item.product_name]) {
          productSalesMap[item.product_name] = { name: item.product_name, quantity_sold: 0, total_revenue: 0 };
        }
        productSalesMap[item.product_name].quantity_sold += item.quantity || 0;
        productSalesMap[item.product_name].total_revenue += item.total || 0;
      });
    });
    const topProducts = Object.values(productSalesMap).sort((a, b) => b.total_revenue - a.total_revenue);

    return {
      todayRevenue, weekRevenue, monthRevenue, prevMonthRevenue, revenueGrowth,
      todayProfit, monthProfit, netProfit, marginPercent, avgBasket,
      todaySalesCount: todaySales.length, monthSalesCount: monthSales.length,
      uniqueCustomers, monthExpenses,
      totalProducts, lowStock, outOfStock, totalStockValue, totalRetailValue,
      chartData, topProducts,
      pendingRepairs, inProgressRepairs, repairRevenue,
    };
  }, [sales, products, expenses, repairs]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tableau de Bord</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="CA Aujourd'hui" value={`${stats.todayRevenue.toLocaleString()} F`} subtitle={`${stats.todaySalesCount} vente(s)`} icon={DollarSign} color="orange" delay={0} />
        <KPICard title="CA Ce Mois" value={`${stats.monthRevenue.toLocaleString()} F`} subtitle={stats.revenueGrowth !== null ? `${stats.revenueGrowth > 0 ? '+' : ''}${stats.revenueGrowth}% vs mois préc.` : `${stats.monthSalesCount} vente(s)`} icon={TrendingUp} color="green" delay={0.05} trend={stats.revenueGrowth !== null ? `${stats.revenueGrowth > 0 ? '+' : ''}${stats.revenueGrowth}%` : null} trendUp={parseFloat(stats.revenueGrowth) >= 0} />
        <KPICard title="Bénéfice brut mois" value={`${stats.monthProfit.toLocaleString()} F`} subtitle={`Marge: ${stats.marginPercent}%`} icon={Percent} color="blue" delay={0.1} />
        <KPICard title="Bénéfice net mois" value={`${stats.netProfit.toLocaleString()} F`} subtitle={`Dépenses: ${stats.monthExpenses.toLocaleString()} F`} icon={Receipt} color={stats.netProfit >= 0 ? 'green' : 'red'} delay={0.15} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatsMiniCard label="CA semaine" value={`${stats.weekRevenue.toLocaleString()} F`} />
        <StatsMiniCard label="Panier moyen" value={`${Math.round(stats.avgBasket).toLocaleString()} F`} />
        <StatsMiniCard label="Clients ce mois" value={stats.uniqueCustomers || '—'} />
        <StatsMiniCard label="Valeur stock (achat)" value={`${stats.totalStockValue.toLocaleString()} F`} />
        <StatsMiniCard label="Valeur stock (vente)" value={`${stats.totalRetailValue.toLocaleString()} F`} color="text-orange-400" />
        <StatsMiniCard label="Produits en rupture" value={stats.outOfStock.length} color={stats.outOfStock.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProfitChart data={stats.chartData} />
        </div>
        <PaymentMethodChart sales={sales} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CategoryRevenueChart sales={sales} products={products} />
        </div>
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Atelier Mécanique</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">En attente</span>
              <span className="text-sm font-bold text-yellow-400">{stats.pendingRepairs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">En cours</span>
              <span className="text-sm font-bold text-blue-400">{stats.inProgressRepairs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total réparations</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{repairs.length}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700/40">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Revenus atelier</span>
                <span className="text-sm font-bold text-emerald-400">{stats.repairRevenue.toLocaleString()} F</span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700/40 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Produits actifs</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{stats.totalProducts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Stock faible</span>
              <span className={`text-sm font-bold ${stats.lowStock.length > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>{stats.lowStock.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecentSales sales={sales} />
        </div>
        <div className="flex flex-col gap-4">
          <LowStockAlert products={stats.lowStock} />
        </div>
      </div>

      <TopProducts products={stats.topProducts} />
    </div>
  );
}
