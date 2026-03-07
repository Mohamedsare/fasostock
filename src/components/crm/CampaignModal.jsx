import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Loader2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/api/supabase';
import { invokeAI } from '@/lib/aiClient';
import { useShop } from '@/components/context/ShopContext';
import { useQueryClient } from '@tanstack/react-query';

const SEGMENTS = [
  { value: 'all', label: 'Tous les clients' },
  { value: 'vip', label: 'VIP' },
  { value: 'regular', label: 'Réguliers' },
  { value: 'occasional', label: 'Occasionnels' },
  { value: 'inactive', label: 'Inactifs' },
  { value: 'new', label: 'Nouveaux' },
];

export default function CampaignModal({ customers = [], onClose }) {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', type: 'sms', message: '', target_segment: 'all' });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const targetCount = useMemo(() => {
    if (form.target_segment === 'all') return customers.length;
    return customers.filter(c => c.segment === form.target_segment).length;
  }, [customers, form.target_segment]);

  const generateMessage = async () => {
    setGenerating(true);
    const segLabel = SEGMENTS.find(s => s.value === form.target_segment)?.label || 'tous';
    try {
      const res = await invokeAI({
        prompt: `Génère un message marketing court et accrocheur pour une boutique de pièces moto. Segment cible: ${segLabel}. Type: ${form.type}. Nom: ${form.name || 'Promotion'}. Le message doit être en français, personnalisé. Max 160 caractères pour SMS. Retourne uniquement le message, sans guillemets.`,
      });
      set('message', typeof res === 'string' ? res : res?.raw || '');
    } catch (err) { console.error(err); }
    setGenerating(false);
  };

  const handleSend = async () => {
    setSaving(true);
    await api.campaigns.create({
      ...form,
      shop_id: shopId,
      status: 'sent',
      recipients_count: targetCount,
      sent_date: new Date().toISOString().split('T')[0],
    });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    setSaving(false);
    onClose();
  };

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20 pb-20">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Nouvelle Campagne</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Nom de la campagne</label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Promo Ramadan" className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Canal</label><Select value={form.type} onValueChange={v => set('type', v)}><SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></div>
            <div><label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Segment cible</label><Select value={form.target_segment} onValueChange={v => set('target_segment', v)}><SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"><SelectValue /></SelectTrigger><SelectContent>{SEGMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-2 text-xs text-orange-600 dark:text-orange-300">{targetCount} client(s) ciblé(s)</div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Message</label>
              <button onClick={generateMessage} disabled={generating} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-50">
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}Générer avec IA
              </button>
            </div>
            <textarea value={form.message} onChange={e => set('message', e.target.value)} placeholder="Votre message marketing..." rows={4} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-orange-500/50" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Annuler</button>
          <button onClick={handleSend} disabled={!form.name || !form.message || saving} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Envoyer
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
