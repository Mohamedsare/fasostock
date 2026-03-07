import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Wrench, Clock, CheckCircle2, Truck, XCircle } from 'lucide-react';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import RepairForm from '../components/workshop/RepairForm';

const statusConfig = {
  pending: { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  in_progress: { label: 'En cours', color: 'bg-blue-500/20 text-blue-400', icon: Wrench },
  completed: { label: 'Terminé', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
  delivered: { label: 'Livré', color: 'bg-purple-500/20 text-purple-400', icon: Truck },
  cancelled: { label: 'Annulé', color: 'bg-red-500/20 text-red-400', icon: XCircle },
};

export default function Workshop() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [showForm, setShowForm] = useState(false);
  const [editRepair, setEditRepair] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const queryClient = useQueryClient();

  const { data: repairs = [] } = useQuery({
    queryKey: ['repairs-all', shopId],
    queryFn: () => api.repairOrders.list(shopId),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.repairOrders.create({ ...data, shop_id: shopId, order_number: data.order_number || `REP${Date.now().toString().slice(-6)}` }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['repairs-all'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.repairOrders.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['repairs-all'] }); setShowForm(false); setEditRepair(null); },
  });

  const handleSave = (data) => {
    if (editRepair) {
      updateMutation.mutate({ id: editRepair.id, data });
    } else {
      createMutation.mutate({ ...data, order_number: `REP${Date.now().toString().slice(-6)}` });
    }
  };

  const filtered = statusFilter === 'all' ? repairs : repairs.filter(r => r.status === statusFilter);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Atelier Mécanique" subtitle={`${repairs.filter(r => r.status === 'in_progress').length} réparation(s) en cours`} actions={
        <Button onClick={() => { setEditRepair(null); setShowForm(true); }} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />Nouvel Ordre
        </Button>
      } />

      <div className="mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(statusConfig).map(([key, val]) => <SelectItem key={key} value={key}>{val.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="Aucun ordre de réparation" description="Créez un nouvel ordre pour commencer" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(repair => {
            const st = statusConfig[repair.status] || statusConfig.pending;
            const StIcon = st.icon;
            return (
              <div key={repair.id} onClick={() => { setEditRepair(repair); setShowForm(true); }}
                className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600/50 transition-all shadow-sm dark:shadow-none">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">#{repair.order_number}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{repair.customer_name}</p>
                  </div>
                  <Badge className={`${st.color} text-xs flex items-center gap-1`}><StIcon className="w-3 h-3" />{st.label}</Badge>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">{repair.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{repair.motorcycle_brand} {repair.motorcycle_model}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{repair.total_cost?.toLocaleString() || 0} F</span>
                </div>
                {repair.mechanic && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Mécanicien: {repair.mechanic}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <RepairForm repair={editRepair} onSave={handleSave} onCancel={() => { setShowForm(false); setEditRepair(null); }} />
      )}
    </div>
  );
}
