import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Package, Edit2, Trash2, AlertTriangle, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import ProductForm from '../components/stock/ProductForm';
import { exportProductsToCsv, downloadCsv, parseCsvFile, csvRowToProduct, PRODUCT_CSV_HEADERS } from '@/utils/csv';

export default function Stock() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deletedMessage, setDeletedMessage] = useState(null);
  const fileInputRef = useRef(null);
  const deletedMessageRef = useRef(null);

  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', shopId],
    queryFn: () => api.products.list(shopId),
    enabled: !!shopId,
  });

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

  const { data: brands = [] } = useQuery({
    queryKey: ['brands', shopId],
    queryFn: () => api.brands.list(shopId),
    enabled: !!shopId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.products.create({ ...data, shop_id: shopId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); toast({ title: 'Produit créé' }); },
    onError: (err) => toast({ title: 'Erreur', description: err?.message || 'Impossible de créer le produit.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.products.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductToDelete(null);
      setDeletedMessage('Produit supprimé');
      if (deletedMessageRef.current) clearTimeout(deletedMessageRef.current);
      deletedMessageRef.current = window.setTimeout(() => { setDeletedMessage(null); deletedMessageRef.current = null; }, 1800);
    },
    onError: (err) => { setProductToDelete(null); toast({ title: 'Erreur', description: err?.message || 'Impossible de supprimer le produit.', variant: 'destructive' }); },
  });

  const buildProductPayload = (formData) => {
    const num = (v) => (v === '' || v == null ? 0 : Number(v));
    const int = (v) => (v === '' || v == null ? 0 : Math.floor(Number(v)));
    const str = (v) => (v == null ? '' : String(v).trim() || null);
    return {
      name: str(formData.name) || '',
      category: str(formData.category) || null,
      subcategory: str(formData.subcategory) || null,
      brand: str(formData.brand) || null,
      compatible_model: str(formData.compatible_model) || null,
      compatible_year: str(formData.compatible_year) || null,
      internal_ref: str(formData.internal_ref) || null,
      barcode: str(formData.barcode) || null,
      photo_url: str(formData.photo_url) || null,
      purchase_price: num(formData.purchase_price),
      sale_price: num(formData.sale_price),
      quantity: int(formData.quantity),
      min_stock_alert: int(formData.min_stock_alert),
      supplier_id: (formData.supplier_id && String(formData.supplier_id).trim()) || null,
      location: str(formData.location) || null,
      status: (formData.status === 'inactive' ? 'inactive' : 'active'),
    };
  };

  const handleSave = (formData) => {
    if (editProduct) {
      const data = buildProductPayload(formData);
      updateMutation.mutate({ id: editProduct.id, data });
    } else {
      const data = buildProductPayload(formData);
      createMutation.mutate({ ...data, shop_id: shopId });
    }
  };

  const handleExportCsv = () => {
    const csv = exportProductsToCsv(filtered.length ? filtered : products);
    downloadCsv(csv, `produits-${currentShop?.name || 'stock'}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleImportCsv = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!shopId) {
      setImportResult({ created: 0, total: 0, errors: [{ line: 0, message: 'Sélectionnez d\'abord une boutique.' }] });
      e.target.value = '';
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const { rows, headers } = parseCsvFile(text);
      if (rows.length === 0) {
        setImportResult({
          created: 0,
          total: 0,
          errors: [{ line: 0, message: 'Aucune ligne de données. Le fichier doit contenir une ligne d\'en-têtes puis au moins une ligne de produits (séparateur ; ou ,).' }]
        });
        setImporting(false);
        e.target.value = '';
        return;
      }
      let created = 0;
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        try {
          const product = csvRowToProduct(rows[i], shopId);
          await api.products.create(product);
          created++;
        } catch (err) {
          errors.push({ line: i + 2, message: err?.message || 'Erreur' });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setImportResult({ created, total: rows.length, errors, headers });
    } catch (err) {
      console.error('Import CSV:', err);
      setImportResult({ created: 0, total: 0, errors: [{ line: 0, message: err?.message || 'Fichier CSV invalide ou illisible.' }] });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) ||
      p.internal_ref?.toLowerCase().includes(search.toLowerCase());
    const matchBrand = brandFilter === 'all' || p.brand === brandFilter;
    return matchSearch && matchBrand;
  });

  if (!shopId) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Package} title="Aucune boutique sélectionnée" description="Sélectionnez une boutique pour gérer les produits" />
      </div>
    );
  }

  useEffect(() => () => { if (deletedMessageRef.current) clearTimeout(deletedMessageRef.current); }, []);

  return (
    <div className="animate-fade-in relative">
      {deletedMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-xl bg-slate-800/95 dark:bg-slate-700/95 text-white text-sm font-medium shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none" role="status">
          {deletedMessage}
        </div>
      )}
      <PageHeader
        title="Gestion du Stock"
        subtitle={`${products.length} produits · ${products.filter(p => p.quantity <= (p.min_stock_alert || 5)).length} alertes`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <Download className="w-4 h-4 mr-1.5" />Exporter CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(PRODUCT_CSV_HEADERS.join(';'), 'modele-import-produits.csv')} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />Modèle
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              <Upload className="w-4 h-4 mr-1.5" />{importing ? 'Import...' : 'Importer CSV'}
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={handleImportCsv} />
            <Button onClick={() => setShowForm(true)} className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-2" />Nouveau Produit
            </Button>
          </div>
        }
      />

      {importResult && (
        <div
          role="alert"
          className={`mb-4 rounded-xl border p-4 shadow-sm ${importResult.errors?.length && importResult.created === 0 ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30' : importResult.created > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600'}`}
        >
          <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            {importResult.total === 0
              ? 'Aucun produit à importer.'
              : `Import terminé : ${importResult.created} produit(s) créé(s) sur ${importResult.total} ligne(s).`}
          </p>
          {importResult.errors?.length > 0 && (
            <div className="mt-2 text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
              {importResult.errors.slice(0, 5).map((e, i) => (
                <p key={i}>{e.line > 0 ? `Ligne ${e.line} : ` : ''}{e.message}</p>
              ))}
              {importResult.errors.length > 5 && <p>… et {importResult.errors.length - 5} autre(s) erreur(s)</p>}
            </div>
          )}
          <button type="button" onClick={() => setImportResult(null)} className="text-xs text-slate-600 dark:text-slate-400 hover:underline mt-2 font-medium">Fermer</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <Input placeholder="Rechercher par nom, code-barres, référence..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-48 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"><SelectValue placeholder="Toutes marques" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes marques</SelectItem>
            {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && !isLoading ? (
        <EmptyState icon={Package} title="Aucun produit" description="Ajoutez votre premier produit pour commencer" />
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((p) => {
              const isLow = p.quantity <= (p.min_stock_alert || 5);
              const isOut = p.quantity === 0;
              return (
                <div key={p.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 flex items-center gap-3 shadow-sm dark:shadow-none">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" /> : <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-slate-400 dark:text-slate-500" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                      <Badge className={`flex-shrink-0 flex items-center gap-1 text-xs ${isOut ? 'bg-red-500/20 text-red-400' : isLow ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{isLow && <AlertTriangle className="w-3 h-3" />}{p.quantity}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.brand || ''} {p.internal_ref ? `· ${p.internal_ref}` : ''}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Achat: <span className="text-slate-600 dark:text-slate-300">{p.purchase_price?.toLocaleString() || 0} F</span></span>
                        <span className="text-xs text-orange-400 font-semibold">{p.sale_price?.toLocaleString()} F</span>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => navigate('/Stock/Edit/' + p.id)} className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setProductToDelete(p)} className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700/50">
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">Produit</th>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">Marque</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">P. Achat</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">P. Vente</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">Stock</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const isLow = p.quantity <= (p.min_stock_alert || 5);
                    const isOut = p.quantity === 0;
                    return (
                      <tr key={p.id} className="border-b border-slate-200 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {p.photo_url ? <img src={p.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Package className="w-5 h-5 text-slate-400 dark:text-slate-500" /></div>}
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{p.internal_ref || p.barcode || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4"><span className="text-sm text-slate-600 dark:text-slate-300">{p.brand || '-'}</span></td>
                        <td className="p-4 text-right"><span className="text-sm text-slate-600 dark:text-slate-300">{p.purchase_price?.toLocaleString() || 0} F</span></td>
                        <td className="p-4 text-right"><span className="text-sm font-medium text-slate-900 dark:text-white">{p.sale_price?.toLocaleString()} F</span></td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
                            <Badge className={`${isOut ? 'bg-red-500/20 text-red-400' : isLow ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'} text-xs`}>{p.quantity}</Badge>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => navigate('/Stock/Edit/' + p.id)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setProductToDelete(p)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-start justify-center pt-20 pb-8 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Nouveau produit">
          <ProductForm product={null} categories={categories} brands={brands} suppliers={suppliers} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              {productToDelete ? <>« {productToDelete.name} » sera définitivement supprimé. Cette action est irréversible.</> : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => productToDelete && deleteMutation.mutate(productToDelete.id)} className="bg-red-500 hover:bg-red-600 text-white">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
