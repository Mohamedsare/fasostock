import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { uploadFile } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Save, Upload } from 'lucide-react';

const BRANDS = ['Yamaha', 'Honda', 'Suzuki', 'Kawasaki', 'BMW', 'KTM', 'Ducati', 'Bajaj', 'TVS', 'Lifan', 'Haojue', 'Autre'];

export default function ProductForm({ product, onSave, onCancel }) {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const [form, setForm] = useState({
    name: '', category: '', subcategory: '', brand: '', compatible_model: '',
    compatible_year: '', internal_ref: '', barcode: '', photo_url: '',
    purchase_price: 0, sale_price: 0, quantity: 0, min_stock_alert: 5,
    supplier_id: '', location: '', status: 'active',
    ...product
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!product) {
      setForm({
        name: '', category: '', subcategory: '', brand: '', compatible_model: '',
        compatible_year: '', internal_ref: '', barcode: '', photo_url: '',
        purchase_price: 0, sale_price: 0, quantity: 0, min_stock_alert: 5,
        supplier_id: '', location: '', status: 'active',
      });
      return;
    }
    try {
      const num = (v) => (v != null && v !== '' ? Number(v) : 0);
      const int = (v) => (v != null && v !== '' ? Math.floor(Number(v)) : 0);
      const str = (v) => (v != null && v !== undefined ? String(v) : '');
      setForm({
        name: str(product.name),
        category: str(product.category),
        subcategory: str(product.subcategory),
        brand: str(product.brand),
        compatible_model: str(product.compatible_model),
        compatible_year: str(product.compatible_year),
        internal_ref: str(product.internal_ref),
        barcode: str(product.barcode),
        photo_url: str(product.photo_url),
        purchase_price: num(product.purchase_price),
        sale_price: num(product.sale_price),
        quantity: int(product.quantity),
        min_stock_alert: int(product.min_stock_alert ?? 5),
        supplier_id: product.supplier_id ? String(product.supplier_id) : '',
        location: str(product.location),
        status: product.status === 'inactive' ? 'inactive' : 'active',
      });
    } catch (err) {
      console.error('ProductForm init error:', err);
    }
  }, [product]);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', shopId],
    queryFn: () => api.categories.list(shopId),
    enabled: !!shopId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', shopId],
    queryFn: () => api.suppliers.list(shopId),
    enabled: !!shopId,
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await uploadFile(file);
      setForm(prev => ({ ...prev, photo_url: file_url }));
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const margin = form.sale_price && form.purchase_price ? (((form.sale_price - form.purchase_price) / form.sale_price) * 100).toFixed(1) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl mx-4 my-4 animate-slide-up shadow-xl dark:shadow-none">
      <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{product ? 'Modifier Produit' : 'Nouveau Produit'}</h2>
        <button type="button" onClick={onCancel} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Nom du produit *</Label>
              <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" required />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Catégorie</Label>
              <Select value={form.category ?? ''} onValueChange={(v) => handleChange('category', v)}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent><SelectItem value="">Aucune</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Marque</Label>
              <Select value={form.brand ?? ''} onValueChange={(v) => handleChange('brand', v)}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent><SelectItem value="">Aucune</SelectItem>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Modèle compatible</Label>
              <Input value={form.compatible_model} onChange={(e) => handleChange('compatible_model', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Année compatible</Label>
              <Input value={form.compatible_year} onChange={(e) => handleChange('compatible_year', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="ex: 2020-2024" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Référence interne</Label>
              <Input value={form.internal_ref} onChange={(e) => handleChange('internal_ref', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Code-barres</Label>
              <Input value={form.barcode} onChange={(e) => handleChange('barcode', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Prix d'achat (FCFA)</Label>
              <Input type="number" value={form.purchase_price} onChange={(e) => handleChange('purchase_price', parseFloat(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Prix de vente (FCFA) *</Label>
              <Input type="number" value={form.sale_price} onChange={(e) => handleChange('sale_price', parseFloat(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" required />
            </div>
            <div className="md:col-span-2 bg-slate-100 dark:bg-slate-900/50 rounded-lg p-3 flex items-center justify-between border border-slate-200 dark:border-transparent">
              <span className="text-sm text-slate-600 dark:text-slate-400">Marge calculée:</span>
              <span className={`text-lg font-bold ${parseFloat(margin) > 20 ? 'text-emerald-400' : parseFloat(margin) > 10 ? 'text-yellow-400' : 'text-red-400'}`}>{margin}%</span>
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Quantité en stock</Label>
              <Input type="number" value={form.quantity} onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Seuil d'alerte</Label>
              <Input type="number" value={form.min_stock_alert} onChange={(e) => handleChange('min_stock_alert', parseInt(e.target.value) || 0)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Fournisseur</Label>
              <Select value={form.supplier_id ?? ''} onValueChange={(v) => handleChange('supplier_id', v)}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent><SelectItem value="">Aucun</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Localisation</Label>
              <Input value={form.location} onChange={(e) => handleChange('location', e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="ex: Étagère A2" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Photo</Label>
              <div className="mt-1 flex items-center gap-3">
                {form.photo_url && <img src={form.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-300 dark:border-slate-600" />}
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <Upload className="w-4 h-4" />{uploading ? 'Envoi...' : 'Charger photo'}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button type="button" variant="outline" onClick={onCancel} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Annuler</Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white"><Save className="w-4 h-4 mr-2" />{product ? 'Mettre à jour' : 'Créer'}</Button>
          </div>
        </form>
    </div>
  );
}
