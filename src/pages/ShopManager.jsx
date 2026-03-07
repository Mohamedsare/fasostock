import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { uploadFile } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Store, Edit2, Trash2, Check, X, Upload, Power, PowerOff } from 'lucide-react';
import PageHeader from '../components/ui-custom/PageHeader';

const emptyShop = { name: '', phone: '', address: '', logo_url: '', currency: 'FCFA', receipt_footer: 'Merci de votre achat !', tax_rate: 0, owner_name: '', default_stock_alert: 5, is_active: true };

// Colonnes attendues par la table shops (évite d'envoyer des champs inconnus)
const SHOP_FIELDS = ['name', 'phone', 'address', 'logo_url', 'currency', 'receipt_footer', 'tax_rate', 'owner_name', 'default_stock_alert', 'is_active', 'organization_id'];

function buildShopPayload(data, organizationId) {
  const payload = {};
  SHOP_FIELDS.forEach((key) => {
    if (key === 'organization_id') {
      payload[key] = organizationId ?? null;
      return;
    }
    if (key === 'name') {
      payload[key] = (data[key] ?? '').toString().trim() || 'Boutique';
      return;
    }
    if (data[key] === undefined) return;
    if (key === 'tax_rate' || key === 'default_stock_alert') payload[key] = Number(data[key]) || 0;
    else if (key === 'is_active') payload[key] = Boolean(data[key]);
    else payload[key] = data[key];
  });
  return payload;
}

export default function ShopManager() {
  const { user, updateProfile } = useAuth();
  const { shops, refetchShops } = useShop();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editShop, setEditShop] = useState(null);
  const [form, setForm] = useState(emptyShop);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const isOwner = user?.role === 'owner';
  const isSuperAdmin = user?.role === 'super_admin';
  const isManager = user?.role === 'manager';
  const canManage = isOwner || isSuperAdmin || isManager;

  const { data: orgMembers = [] } = useQuery({
    queryKey: ['organizationMembers', user?.id],
    queryFn: () => api.organizationMembers.list(user?.id),
    enabled: !!user?.id && canManage,
  });

  const ownerOrgId = orgMembers?.find(m => m.role === 'owner')?.organization_id;

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const name = (data.name || '').trim();
      if (!name) throw new Error('Le nom de la boutique est obligatoire.');

      let orgId = data.organization_id || ownerOrgId;

      if (editShop) {
        const payload = buildShopPayload(data, editShop.organization_id ?? orgId);
        return api.shops.update(editShop.id, payload);
      }

      try {
        // Nouvelle boutique : owner ou manager sans org → créer l'entreprise et le promouvoir owner
        if ((isOwner || isManager) && !orgId) {
          const org = await api.organizations.create({ name: name || 'Mon entreprise' });
          orgId = org.id;
          await api.organizationMembers.create({ user_id: user.id, organization_id: orgId, role: 'owner' });
          await updateProfile({ role: 'owner' });
        }
      } catch (err) {
        console.error('ShopManager: erreur création org/membre:', err);
        const msg = err?.message || err?.details || err?.hint || 'Erreur lors de la création de l\'entreprise.';
        throw new Error(msg);
      }

      const payload = buildShopPayload(data, orgId ?? null);
      if (!payload.name) throw new Error('Le nom de la boutique est obligatoire.');
      return api.shops.create(payload);
    },
    onSuccess: () => {
      setSaveError('');
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      refetchShops?.();
      setShowForm(false);
      setEditShop(null);
      setForm(emptyShop);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      console.error('ShopManager: erreur sauvegarde boutique', err);
      const msg = err?.message || err?.details || err?.hint || 'Erreur lors de l\'enregistrement.';
      setSaveError(msg);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.shops.update(id, { is_active }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shops'] }); refetchShops?.(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.shops.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shops'] }); refetchShops?.(); },
  });

  const openEdit = (shop) => { setSaveError(''); setUploadError(''); setEditShop(shop); setForm({ ...emptyShop, ...shop }); setShowForm(true); };
  const openNew = () => { setSaveError(''); setUploadError(''); setEditShop(null); setForm(emptyShop); setShowForm(true); };

  const handleLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const { file_url } = await uploadFile(file);
      setForm(f => ({ ...f, logo_url: file_url }));
    } catch (err) {
      console.error('Upload logo:', err);
      setUploadError(err?.message || 'Impossible d\'envoyer l\'image.');
    } finally {
      setUploading(false);
    }
    e.target.value = '';
  };

  if (!canManage) {
    return <div className="flex items-center justify-center h-64"><p className="text-slate-500 dark:text-slate-400">Accès réservé au propriétaire, au gérant ou au Super Admin.</p></div>;
  }

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <PageHeader title="Gestion des Boutiques" subtitle={`${shops.length} boutique(s)`} actions={<Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600"><Plus className="w-4 h-4 mr-2" />Nouvelle boutique</Button>} />

      <div className="space-y-3">
        {shops.map(shop => (
          <div key={shop.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm dark:shadow-none">
            {shop.logo_url ? <img src={shop.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border border-slate-300 dark:border-slate-700" /> : <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 flex items-center justify-center flex-shrink-0 border border-orange-500/20"><Store className="w-6 h-6 text-orange-400" /></div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-slate-900 dark:text-white truncate">{shop.name}</p>
                <Badge className={shop.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}>{shop.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              {shop.address && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{shop.address}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => toggleActiveMutation.mutate({ id: shop.id, is_active: !shop.is_active })}
                title={shop.is_active ? 'Désactiver' : 'Activer'}
                className={`p-2 rounded-xl transition-colors ${shop.is_active ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/30' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30'}`}
              >
                {shop.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
              </button>
              <button onClick={() => openEdit(shop)} className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
              {isSuperAdmin && (
                <button onClick={() => { if (confirm('Supprimer cette boutique ?')) deleteMutation.mutate(shop.id); }} className="p-2 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 pt-20 pb-20">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up shadow-xl dark:shadow-none my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editShop ? 'Modifier' : 'Nouvelle'} boutique</h2>
              <button onClick={() => { setShowForm(false); setEditShop(null); setSaveError(''); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-300 dark:border-slate-600">
                  {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /> : <Store className="w-6 h-6 text-slate-500" />}
                </div>
                <div>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600">
                    <Upload className="w-4 h-4" />{uploading ? 'Envoi...' : 'Choisir un logo'}
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleLogo} className="hidden" />
                  </label>
                  {uploadError && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{uploadError}</p>}
                </div>
              </div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Nom de la boutique *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" placeholder="ex: FasoStock Ouagadougou" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Gérant</Label><Input value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
                <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Téléphone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
              </div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Adresse</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
              <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Pied de ticket</Label><Textarea value={form.receipt_footer} onChange={e => setForm(f => ({ ...f, receipt_footer: e.target.value }))} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" /></div>
              {saveError && <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">{saveError}</div>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditShop(null); setSaveError(''); }} className="flex-1 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">Annuler</Button>
                <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">{saved ? <><Check className="w-4 h-4 mr-2" />Sauvegardé</> : saveMutation.isPending ? 'Enregistrement...' : 'Sauvegarder'}</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
