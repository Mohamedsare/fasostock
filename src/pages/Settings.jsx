import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { uploadFile } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, Store, Settings2, Upload, CheckCircle2, Printer } from 'lucide-react';

export default function Settings() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: () => api.settings.list(shopId),
  });

  const existing = settingsList[0];

  const [form, setForm] = useState({
    shop_name: '', shop_phone: '', shop_address: '', shop_logo_url: '',
    currency: 'FCFA', default_stock_alert: 5, receipt_footer: 'Merci de votre achat !',
    tax_rate: 0, owner_name: '', receipt_printer_width: '80',
  });

  useEffect(() => {
    if (existing) setForm(prev => ({ ...prev, ...existing }));
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, shop_id: shopId };
      if (existing) return api.settings.update(existing.id, payload);
      return api.settings.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await uploadFile(file);
      set('shop_logo_url', file_url);
    } catch (err) {
      console.error('Upload error:', err);
    }
    setUploading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Paramètres</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configurer votre boutique et préférences</p>
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-2">
          <Store className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Informations Boutique</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-300 dark:border-slate-600">
            {form.shop_logo_url ? <img src={form.shop_logo_url} alt="logo" className="w-full h-full object-cover" /> : <Store className="w-7 h-7 text-slate-400 dark:text-slate-500" />}
          </div>
          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            <Upload className="w-4 h-4" />{uploading ? 'Envoi...' : 'Logo'}
            <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
          </label>
        </div>
        <div>
          <Label className="text-slate-600 dark:text-slate-300 text-xs">Nom de la boutique</Label>
          <Input value={form.shop_name} onChange={e => set('shop_name', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12 text-base" placeholder="ex: FasoStock Ouagadougou" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Nom du gérant</Label><Input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
          <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Téléphone</Label><Input value={form.shop_phone} onChange={e => set('shop_phone', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
        </div>
        <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Adresse</Label><Input value={form.shop_address} onChange={e => set('shop_address', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
        <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Message pied de ticket de caisse</Label><Textarea value={form.receipt_footer} onChange={e => set('receipt_footer', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-16" /></div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-2"><Settings2 className="w-5 h-5 text-orange-500" /><h2 className="text-base font-semibold text-slate-900 dark:text-white">Préférences</h2></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Devise</Label><Input value={form.currency} onChange={e => set('currency', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" placeholder="FCFA" /></div>
          <div><Label className="text-slate-600 dark:text-slate-300 text-xs">Seuil stock alerte (défaut)</Label><Input type="number" value={form.default_stock_alert} onChange={e => set('default_stock_alert', parseInt(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
          <div><Label className="text-slate-600 dark:text-slate-300 text-xs">TVA %</Label><Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-12" /></div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-2">
          <Printer className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Configuration de l&apos;imprimante de tickets</h2>
        </div>
        <div>
          <Label className="text-slate-600 dark:text-slate-300 text-xs block mb-2">Type d&apos;imprimante thermique</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="receipt_printer_width"
                value="58"
                checked={form.receipt_printer_width === '58'}
                onChange={() => set('receipt_printer_width', '58')}
                className="w-4 h-4 text-orange-500 border-slate-300 dark:border-slate-600 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">58 mm</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="receipt_printer_width"
                value="80"
                checked={form.receipt_printer_width === '80'}
                onChange={() => set('receipt_printer_width', '80')}
                className="w-4 h-4 text-orange-500 border-slate-300 dark:border-slate-600 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">80 mm</span>
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choisissez la largeur du rouleau de votre imprimante thermique.</p>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700/50">
          <div>
            <Label htmlFor="receipt_auto_print" className="text-slate-700 dark:text-slate-300 text-sm font-medium cursor-pointer">Impression automatique du ticket</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Lancer l&apos;impression dès l&apos;affichage du reçu (sans cliquer sur Imprimer)</p>
          </div>
          <Switch
            id="receipt_auto_print"
            checked={!!form.receipt_auto_print}
            onCheckedChange={(checked) => set('receipt_auto_print', checked)}
          />
        </div>
      </div>

      <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white text-base font-bold rounded-2xl">
        {saved ? <><CheckCircle2 className="w-5 h-5 mr-2" />Sauvegardé !</> : <><Save className="w-5 h-5 mr-2" />Sauvegarder</>}
      </Button>
    </div>
  );
}
