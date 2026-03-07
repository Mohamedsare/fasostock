import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/api/supabase';
import { useShop } from '@/components/context/ShopContext';
import { useQueryClient } from '@tanstack/react-query';

export default function CustomerForm({ customer, onClose }) {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    segment: customer?.segment || 'new',
    motorcycle_brand: customer?.motorcycle_brand || '',
    motorcycle_model: customer?.motorcycle_model || '',
    notes: customer?.notes || '',
    tags: customer?.tags?.join(', ') || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, shop_id: shopId, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
    if (customer?.id) {
      await api.customers.update(customer.id, data);
    } else {
      await api.customers.create(data);
    }
    qc.invalidateQueries({ queryKey: ['customers'] });
    setSaving(false);
    onClose();
  };

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20 pb-20">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{customer ? 'Modifier Client' : 'Nouveau Client'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Nom *</label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nom complet" className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Téléphone</label><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+226..." className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Email</label><Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@..." className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Adresse</label><Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Adresse" className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Segment</label><Select value={form.segment} onValueChange={v => set('segment', v)}><SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Nouveau</SelectItem><SelectItem value="regular">Régulier</SelectItem><SelectItem value="vip">VIP</SelectItem><SelectItem value="occasional">Occasionnel</SelectItem><SelectItem value="inactive">Inactif</SelectItem></SelectContent></Select></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Tags (virgule)</label><Input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="vip, fidèle..." className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Marque moto</label><Input value={form.motorcycle_brand} onChange={e => set('motorcycle_brand', e.target.value)} placeholder="Yamaha, Honda..." className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Modèle moto</label><Input value={form.motorcycle_model} onChange={e => set('motorcycle_model', e.target.value)} placeholder="YBR 125..." className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes..." rows={3} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-orange-500/50" /></div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!form.name || saving} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
