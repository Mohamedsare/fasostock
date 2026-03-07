import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  LayoutDashboard, Package, ShoppingCart, Wrench, Wallet,
  Bell, Users, ChevronLeft, ChevronRight, LogOut,
  TrendingUp, Settings, MoreHorizontal, Sun, Moon,
  Store, ChevronDown, Plus, Brain, ContactRound, FileText
} from 'lucide-react';
import { useTheme } from './components/context/ThemeContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useShop } from './components/context/ShopContext';
import { useAuth } from '@/lib/AuthContext';

const ALL_NAV = [
  { name: 'Dashboard', page: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'owner', 'manager', 'cashier', 'product_manager', 'stockist', 'accountant'] },
  { name: 'Point de Vente', page: 'POS', icon: ShoppingCart, roles: ['super_admin', 'owner', 'manager', 'cashier', 'product_manager'] },
  { name: 'Stock', page: 'Stock', icon: Package, roles: ['super_admin', 'owner', 'manager', 'product_manager', 'stockist'] },
  { name: 'Ventes', page: 'Sales', icon: TrendingUp, roles: ['super_admin', 'owner', 'manager', 'accountant', 'cashier', 'product_manager'] },
  { name: 'Atelier', page: 'Workshop', icon: Wrench, roles: ['super_admin', 'owner', 'manager'] },
  { name: 'Finances', page: 'Finance', icon: Wallet, roles: ['super_admin', 'owner', 'manager', 'accountant'] },
  { name: 'Alertes', page: 'Alerts', icon: Bell, roles: ['super_admin', 'owner', 'manager', 'stockist', 'product_manager'] },
  { name: 'Prévisions IA', page: 'Forecast', icon: Brain, roles: ['super_admin', 'owner', 'manager', 'accountant'] },
  { name: 'CRM', page: 'CRM', icon: ContactRound, roles: ['super_admin', 'owner', 'manager'] },
  { name: 'Rapports IA', page: 'Reports', icon: FileText, roles: ['super_admin', 'owner', 'manager', 'accountant'] },
  { name: 'Utilisateurs', page: 'UserManagement', icon: Users, roles: ['super_admin', 'owner'] },
  { name: 'Boutiques', page: 'ShopManager', icon: Store, roles: ['super_admin', 'owner', 'manager'] },
  { name: 'Paramètres', page: 'Settings', icon: Settings, roles: ['super_admin', 'owner', 'manager'] },
];

const BOTTOM_TABS = [
  { name: 'Accueil', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Vente', page: 'POS', icon: ShoppingCart },
  { name: 'Stock', page: 'Stock', icon: Package },
  { name: 'CRM', page: 'CRM', icon: ContactRound },
  { name: 'Plus', page: '__more', icon: MoreHorizontal },
];

function LayoutInner({ children, currentPageName }) {
  const { theme, toggleTheme } = useTheme();
  const { currentShop, shops, setCurrentShop } = useShop();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shopDropdown, setShopDropdown] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isDark = theme === 'dark';
  const userRole = user?.role || 'cashier';
  const navItems = ALL_NAV.filter(item => item.roles.includes(userRole));

  const sidebarBg = isDark ? 'bg-[#1E293B] border-slate-700/50' : 'bg-white border-gray-200';
  const headerBg = isDark ? 'bg-[#1E293B]/80 border-slate-700/50' : 'bg-white/90 border-gray-200';
  const mainBg = isDark ? 'bg-[#0F172A]' : 'bg-slate-50';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-gray-500';
  const cardBg = isDark ? 'bg-slate-800/50' : 'bg-white';
  const iconBtn = isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900';
  const activeNav = isDark ? 'bg-orange-500/10 text-orange-500' : 'bg-orange-50 text-orange-600';
  const inactiveNav = isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100';
  const bottomTabBg = isDark ? 'bg-[#1E293B]/95 border-slate-700/50' : 'bg-white/95 border-gray-200';
  const moreBg = isDark ? 'bg-[#1E293B] border-slate-700/50' : 'bg-white border-gray-200';
  const moreCardBg = isDark ? 'border-slate-700/50 bg-slate-800/50 text-slate-300' : 'border-gray-200 bg-gray-50 text-gray-700';

  if (currentPageName === 'POS') {
    return <div className={`min-h-screen ${mainBg}`}>{children}</div>;
  }

  const handleLogout = () => logout();

  return (
    <div className={`min-h-screen ${mainBg} flex`}>
      <aside className={`hidden lg:flex fixed top-0 left-0 z-50 h-screen border-r transition-all duration-300 flex-col ${sidebarBg} ${collapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        <div className={`h-16 flex items-center justify-between px-4 border-b ${isDark ? 'border-slate-700/50' : 'border-gray-100'} flex-shrink-0`}>
          {!collapsed ? (
            <div className="flex-1 min-w-0">
              {shops.length > 1 ? (
                <div className="relative">
                  <button onClick={() => setShopDropdown(!shopDropdown)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">{currentShop?.name?.[0] || 'F'}</span>
                    </div>
                    <span className={`text-sm font-bold truncate flex-1 ${textPrimary}`}>{currentShop?.name || 'FasoStock'}</span>
                    <ChevronDown className={`w-3 h-3 ${textSecondary}`} />
                  </button>
                  {shopDropdown && (
                    <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl z-50 py-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                      {shops.map(s => (
                        <button key={s.id} onClick={() => { setCurrentShop(s); setShopDropdown(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${s.id === currentShop?.id ? 'text-orange-500' : textSecondary} ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-50'}`}>
                          <Store className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">F</span>
                  </div>
                  <span className={`text-sm font-bold ${textPrimary}`}>{currentShop?.name || 'FasoStock'}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{currentShop?.name?.[0] || 'F'}</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? activeNav : inactiveNav} ${collapsed ? 'justify-center' : ''}`}>
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-gray-100'}`}>
          <button onClick={toggleTheme}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${inactiveNav} ${collapsed ? 'justify-center' : ''}`}>
            {isDark ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
            {!collapsed && <span className="text-sm">{isDark ? 'Thème clair' : 'Thème sombre'}</span>}
          </button>
        </div>

        <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-gray-100'}`}>
          <button onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all ${iconBtn}`}>
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span className="text-sm">Réduire</span>}
          </button>
        </div>

        {user && (
          <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-gray-100'}`}>
            <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{user.full_name?.[0]?.toUpperCase() || 'U'}</span>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${textPrimary}`}>{user.full_name}</p>
                  <button onClick={handleLogout} className={`text-xs flex items-center gap-1 mt-0.5 ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition-colors`}>
                    <LogOut className="w-3 h-3" />Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${!collapsed ? 'lg:ml-[240px]' : 'lg:ml-[72px]'}`}>
        <header className={`hidden lg:flex h-16 backdrop-blur-sm border-b items-center justify-between px-6 sticky top-0 z-30 ${headerBg}`}>
          <h1 className={`text-sm font-medium ${textSecondary}`}>
            {navItems.find(n => n.page === currentPageName)?.name || currentPageName}
          </h1>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            <p className={`text-sm font-mono font-semibold tabular-nums ${textPrimary}`}>
              {format(now, 'HH:mm:ss')}
            </p>
            <p className={`text-xs ${textSecondary}`}>
              {format(now, "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${iconBtn}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link to={createPageUrl('Alerts')} className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${iconBtn}`}>
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-transparent" />
            </Link>
            <button onClick={handleLogout} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? 'bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400' : 'bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500'}`}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <header className={`lg:hidden h-14 backdrop-blur-sm border-b flex items-center justify-between px-4 sticky top-0 z-30 ${headerBg}`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">{currentShop?.name?.[0] || 'F'}</span>
            </div>
            <span className={`font-semibold text-sm ${textPrimary}`}>
              {navItems.find(n => n.page === currentPageName)?.name || currentShop?.name || 'FasoStock'}
            </span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            <p className={`text-xs font-mono font-semibold tabular-nums ${textPrimary}`}>
              {format(now, 'HH:mm:ss')}
            </p>
            <p className={`text-[10px] ${textSecondary}`}>
              {format(now, "d MMM yyyy", { locale: fr })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${iconBtn}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link to={createPageUrl('Alerts')} className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${iconBtn}`}>
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full" />
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto pb-20 lg:pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
          {children}
        </main>
      </div>

      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md border-t ${bottomTabBg}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 h-16">
          {BOTTOM_TABS.map((tab) => {
            if (tab.page === '__more') {
              return (
                <button key="more" onClick={() => setMobileMenuOpen(true)}
                  className={`flex flex-col items-center justify-center gap-1 transition-colors ${mobileMenuOpen ? 'text-orange-500' : textSecondary}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${mobileMenuOpen ? 'bg-orange-500/15' : ''}`}>
                    <tab.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Plus</span>
                </button>
              );
            }
            const isActive = currentPageName === tab.page;
            return (
              <Link key={tab.page} to={createPageUrl(tab.page)}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${isActive ? 'text-orange-500' : textSecondary}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-orange-500/15 scale-110' : ''}`}>
                  <tab.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium">{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {mobileMenuOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setMobileMenuOpen(false)} />
          <div className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t rounded-t-3xl pb-safe animate-slide-up ${moreBg}`}>
            <div className="w-12 h-1 bg-slate-300 dark:bg-slate-400 rounded-full mx-auto mt-3 mb-4 opacity-40" />
            <div className="grid grid-cols-3 gap-3 px-4 pb-8">
              {[
                { name: 'Ventes', page: 'Sales', icon: TrendingUp },
                { name: 'Finances', page: 'Finance', icon: Wallet },
                { name: 'Alertes', page: 'Alerts', icon: Bell },
                { name: 'Prévisions IA', page: 'Forecast', icon: Brain },
                { name: 'CRM', page: 'CRM', icon: ContactRound },
                { name: 'Rapports IA', page: 'Reports', icon: FileText },
                ...(userRole === 'super_admin' || userRole === 'owner' ? [
                  { name: 'Utilisateurs', page: 'UserManagement', icon: Users },
                  { name: 'Boutiques', page: 'ShopManager', icon: Store },
                ] : []),
                { name: 'Paramètres', page: 'Settings', icon: Settings },
              ].map(item => (
                <Link key={item.page} to={createPageUrl(item.page)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${currentPageName === item.page ? 'border-orange-500/40 bg-orange-500/10 text-orange-500' : moreCardBg}`}>
                  <item.icon className="w-6 h-6" />
                  <span className="text-xs font-medium text-center">{item.name}</span>
                </Link>
              ))}
              <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400">
                <LogOut className="w-6 h-6" />
                <span className="text-xs font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout(props) {
  return <LayoutInner {...props} />;
}
