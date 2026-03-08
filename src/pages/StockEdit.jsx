import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { toast } from '@/components/ui/use-toast';
import ProductForm from '@/components/stock/ProductForm';
import { ArrowLeft } from 'lucide-react';

export default function StockEdit() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const queryClient = useQueryClient();

  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.products.get(productId),
    enabled: !!productId,
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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.products.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produit mis à jour' });
      navigate('/Stock');
    },
    onError: (err) => toast({ title: 'Erreur', description: err?.message || 'Impossible de modifier le produit.', variant: 'destructive' }),
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
    const data = buildProductPayload(formData);
    updateMutation.mutate({ id: productId, data });
  };

  const handleCancel = () => navigate('/Stock');

  if (!productId || !shopId) {
    return (
      <div className="p-4">
        <button type="button" onClick={() => navigate('/Stock')} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" />Retour au stock
        </button>
        <p className="mt-4 text-slate-500">Boutique non sélectionnée.</p>
      </div>
    );
  }

  if (loadingProduct || !product) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 dark:border-slate-700 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in p-4">
      <button type="button" onClick={handleCancel} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" />Retour au stock
      </button>
      <ProductForm product={product} categories={categories} brands={brands} suppliers={suppliers} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
