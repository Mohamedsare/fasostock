import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/supabase';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X, Lock, Loader2 } from 'lucide-react';
import PageHeader from '../components/ui-custom/PageHeader';

const ROLES_OWNER = [
  { value: 'cashier', label: 'Caissier/Vendeur (vente uniquement)', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'product_manager', label: 'Gestionnaire produits (créer + vendre)', color: 'bg-green-500/20 text-green-400' },
];

const ROLES_SUPER_ADMIN = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-500/20 text-red-400' },
  { value: 'owner', label: 'Propriétaire', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'manager', label: 'Gérant', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'cashier', label: 'Caissier', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'product_manager', label: 'Gestionnaire produits', color: 'bg-green-500/20 text-green-400' },
  { value: 'stockist', label: 'Magasinier', color: 'bg-teal-500/20 text-teal-400' },
  { value: 'accountant', label: 'Comptable', color: 'bg-purple-500/20 text-purple-400' },
];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', full_name: '', role: 'cashier', shop_ids: [] });
  const [createError, setCreateError] = useState('');

  const isOwner = currentUser?.role === 'owner';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManage = isOwner || isSuperAdmin;

  const { data: orgMembers = [] } = useQuery({
    queryKey: ['organizationMembers', currentUser?.id],
    queryFn: () => api.organizationMembers.list(currentUser?.id),
    enabled: !!currentUser?.id,
  });

  const ownerOrgId = orgMembers?.find(m => m.role === 'owner')?.organization_id;

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles', ownerOrgId, isSuperAdmin],
    queryFn: () => isSuperAdmin ? api.profiles.list() : (ownerOrgId ? api.profiles.listByOrganization(ownerOrgId) : Promise.resolve([])),
    enabled: canManage,
  });

  const { data: shops = [] } = useQuery({
    queryKey: ['shops'],
    queryFn: () => api.shops.list(),
    enabled: canManage && showCreate,
  });

  const orgShops = ownerOrgId ? shops.filter(s => s.organization_id === ownerOrgId) : shops;

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }) => api.profiles.update(id, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      setCreateError('');
      const { data, error } = await supabase.auth.signUp({
        email: createForm.email,
        password: createForm.password,
        options: {
          data: {
            full_name: createForm.full_name,
            organization_id: ownerOrgId,
            role: createForm.role,
          },
        },
      });
      if (error) throw error;
      if (data?.user && createForm.shop_ids?.length) {
        await api.shopMembers.setForUser(data.user.id, createForm.shop_ids);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setShowCreate(false);
      setCreateForm({ email: '', password: '', full_name: '', role: 'cashier', shop_ids: [] });
    },
    onError: (err) => setCreateError(err.message || 'Erreur'),
  });

  const roleConfig = (role) => (isSuperAdmin ? ROLES_SUPER_ADMIN : ROLES_OWNER).find(r => r.value === role) || ROLES_OWNER[0];

  if (!canManage) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Utilisateurs" subtitle={`${profiles.length} utilisateur(s)`} />
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 text-center shadow-sm dark:shadow-none">
          <Lock className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-900 dark:text-white font-medium">Accès restreint</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Seul le propriétaire ou le Super Admin peut gérer les utilisateurs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Gestion des Utilisateurs"
        subtitle={`${profiles.length} utilisateur(s)`}
        actions={
          isOwner ? (
            <Button onClick={() => setShowCreate(true)} className="bg-orange-500 hover:bg-orange-600">
              <UserPlus className="w-4 h-4 mr-2" />Créer Caissier / Gestionnaire
            </Button>
          ) : (
            <Button onClick={() => setShowCreate(true)} disabled className="opacity-50">
              <UserPlus className="w-4 h-4 mr-2" />Inviter via Supabase Dashboard
            </Button>
          )
        }
      />

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700/50">
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Utilisateur</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Email</th>
                <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Rôle</th>
                {isSuperAdmin && <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Changer rôle</th>}
                {isOwner && <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase p-4">Changer rôle</th>}
              </tr>
            </thead>
            <tbody>
              {profiles.map(profile => {
                const rc = roleConfig(profile.role);
                const isMe = profile.id === currentUser?.id;
                return (
                  <tr key={profile.id} className="border-b border-slate-200 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                          <span className="text-slate-900 dark:text-white text-sm font-bold">{(profile.full_name || profile.email || 'U')[0].toUpperCase()}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{profile.full_name || 'Sans nom'}{isMe && ' (moi)'}</p>
                      </div>
                    </td>
                    <td className="p-4"><span className="text-sm text-slate-600 dark:text-slate-300">{profile.email || '-'}</span></td>
                    <td className="p-4 text-center"><Badge className={`${rc.color} text-xs`}>{rc.label}</Badge></td>
                    <td className="p-4 text-right">
                      {!isMe && (isSuperAdmin || (isOwner && ['cashier', 'product_manager'].includes(profile.role))) ? (
                        <Select
                          value={profile.role || 'cashier'}
                          onValueChange={(v) => updateRoleMutation.mutate({ id: profile.id, role: v })}
                        >
                          <SelectTrigger className="w-44 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(isSuperAdmin ? ROLES_SUPER_ADMIN : ROLES_OWNER).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <span className="text-xs text-slate-500 italic">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && isOwner && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 pt-20 pb-20">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md animate-slide-up shadow-xl dark:shadow-none my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Créer un utilisateur</h2>
              <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); createUserMutation.mutate(); }}>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-xs">Email *</Label>
                <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="email@exemple.com" required />
              </div>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-xs">Mot de passe *</Label>
                <Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="••••••••" minLength={6} required />
              </div>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-xs">Nom complet</Label>
                <Input value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="Jean Dupont" />
              </div>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-xs">Rôle</Label>
                <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES_OWNER.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-xs">Boutiques accessibles</Label>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {orgShops.map(shop => (
                    <label key={shop.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={createForm.shop_ids.includes(shop.id)} onChange={e => setCreateForm(f => ({ ...f, shop_ids: e.target.checked ? [...f.shop_ids, shop.id] : f.shop_ids.filter(id => id !== shop.id) }))} />
                      <span className="text-slate-700 dark:text-slate-300">{shop.name}</span>
                    </label>
                  ))}
                  {!orgShops.length && <p className="text-xs text-slate-500">Aucune boutique dans votre entreprise.</p>}
                </div>
              </div>
              {createError && <p className="text-sm text-red-500">{createError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="flex-1">Annuler</Button>
                <Button type="submit" disabled={!createForm.email || !createForm.password || createUserMutation.isPending} className="flex-1 bg-orange-500 hover:bg-orange-600">
                  {createUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
