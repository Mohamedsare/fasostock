import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { Search, Plus, Users, Megaphone, Star, UserCheck, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui-custom/PageHeader';
import CustomerCard from '@/components/crm/CustomerCard';
import CustomerDrawer from '@/components/crm/CustomerDrawer';
import CustomerForm from '@/components/crm/CustomerForm';
import CampaignModal from '@/components/crm/CampaignModal';

const SEGMENT_STYLES = {
  vip: { label: 'VIP', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  regular: { label: 'Régulier', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  occasional: { label: 'Occasionnel', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  inactive: { label: 'Inactif', cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  new: { label: 'Nouveau', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

export default function CRM() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState('clients');
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showCampaign, setShowCampaign] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', shopId],
    queryFn: () => api.customers.list(shopId, 500),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales-crm', shopId],
    queryFn: () => api.sales.list(shopId, 1000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', shopId],
    queryFn: () => api.products.filter({ status: 'active' }, shopId),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns', shopId],
    queryFn: () => api.campaigns.list(shopId, 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.customers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const stats = useMemo(() => ({
    total: customers.length,
    vip: customers.filter(c => c.segment === 'vip').length,
    active: customers.filter(c => ['vip', 'regular'].includes(c.segment)).length,
    inactive: customers.filter(c => c.segment === 'inactive').length,
    totalRevenue: customers.reduce((s, c) => s + (c.total_purchases || 0), 0),
  }), [customers]);

  const filtered = useMemo(() => customers.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
    const matchSeg = segmentFilter === 'all' || c.segment === segmentFilter;
    return matchSearch && matchSeg;
  }), [customers, search, segmentFilter]);

  const handleDeleteCampaign = async (id) => {
    if (confirm('Supprimer?')) {
      await api.campaigns.delete(id);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="CRM Clients" subtitle={`${customers.length} clients · ${campaigns.length} campagnes`} actions={
        <div className="flex gap-2">
          <button onClick={() => setShowCampaign(true)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm hover:border-orange-500/40 transition-colors shadow-sm dark:shadow-none"><Megaphone className="w-4 h-4" />Campagne</button>
          <button onClick={() => setEditingCustomer({})} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm transition-colors"><Plus className="w-4 h-4" />Client</button>
        </div>
      } />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[{ label: 'Total clients', value: stats.total, icon: Users, color: 'text-blue-500 dark:text-blue-400' }, { label: 'VIP', value: stats.vip, icon: Star, color: 'text-yellow-600 dark:text-yellow-400' }, { label: 'Actifs', value: stats.active, icon: UserCheck, color: 'text-emerald-600 dark:text-emerald-400' }, { label: 'Inactifs', value: stats.inactive, icon: UserX, color: 'text-slate-500 dark:text-slate-400' }].map((k, i) => (
          <div key={i} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-none">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center flex-shrink-0"><k.icon className={`w-5 h-5 ${k.color}`} /></div>
            <div><p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{k.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {['clients', 'campagnes'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
            {t === 'clients' ? `Clients (${customers.length})` : `Campagnes (${campaigns.length})`}
          </button>
        ))}
      </div>

      {tab === 'clients' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client..." className="pl-10 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[{ value: 'all', label: 'Tous' }, ...Object.entries(SEGMENT_STYLES).map(([k, v]) => ({ value: k, label: v.label }))].map(s => (
                <button key={s.value} onClick={() => setSegmentFilter(s.value)} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${segmentFilter === s.value ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'}`}>{s.label}</button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Aucun client trouvé</p>
              <button onClick={() => setEditingCustomer({})} className="mt-3 text-orange-400 text-xs hover:underline">+ Ajouter un client</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(c => <CustomerCard key={c.id} customer={c} onClick={setSelectedCustomer} />)}
            </div>
          )}
        </>
      )}

      {tab === 'campagnes' && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="text-center py-16">
              <Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Aucune campagne créée</p>
              <button onClick={() => setShowCampaign(true)} className="mt-3 text-orange-400 text-xs hover:underline">+ Créer une campagne</button>
            </div>
          ) : (
            campaigns.map(camp => (
              <div key={camp.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 shadow-sm dark:shadow-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{camp.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${camp.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>{camp.status === 'sent' ? 'Envoyée' : 'Brouillon'}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{camp.message}</p>
                  </div>
                  <button onClick={() => handleDeleteCampaign(camp.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><span className="text-xs">Supprimer</span></button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {selectedCustomer && <CustomerDrawer customer={selectedCustomer} sales={sales} products={products} onClose={() => setSelectedCustomer(null)} onEdit={() => { setEditingCustomer(selectedCustomer); setSelectedCustomer(null); }} />}
      {editingCustomer && <CustomerForm customer={editingCustomer.id ? editingCustomer : null} onClose={() => setEditingCustomer(null)} />}
      {showCampaign && <CampaignModal customers={customers} onClose={() => setShowCampaign(false)} />}
    </div>
  );
}
