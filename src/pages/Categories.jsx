import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { api } from '@/api/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderTree, Tag, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Categories() {
  const { currentShop } = useShop();
  const shopId = currentShop?.id;
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [toDelete, setToDelete] = useState({ type: null, id: null, name: '' });

  const { data: categories = [], isLoading: loadingCat } = useQuery({
    queryKey: ['categories', shopId],
    queryFn: () => api.categories.list(shopId),
    enabled: !!shopId,
  });

  const { data: brands = [], isLoading: loadingBrand } = useQuery({
    queryKey: ['brands', shopId],
    queryFn: () => api.brands.list(shopId),
    enabled: !!shopId,
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name) => api.categories.create({ shop_id: shopId, name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCategory('');
      toast({ title: 'Catégorie créée' });
    },
    onError: (err) => toast({ title: 'Erreur', description: err?.message || 'Impossible de créer la catégorie.', variant: 'destructive' }),
  });

  const createBrandMutation = useMutation({
    mutationFn: (name) => api.brands.create({ shop_id: shopId, name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setNewBrand('');
      toast({ title: 'Marque créée' });
    },
    onError: (err) => toast({ title: 'Erreur', description: err?.message || 'Impossible de créer la marque.', variant: 'destructive' }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => api.categories.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setToDelete({ type: null, id: null, name: '' });
      toast({ title: 'Catégorie supprimée' });
    },
    onError: (err) => {
      setToDelete({ type: null, id: null, name: '' });
      toast({ title: 'Erreur', description: err?.message || 'Impossible de supprimer.', variant: 'destructive' });
    },
  });

  const deleteBrandMutation = useMutation({
    mutationFn: (id) => api.brands.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setToDelete({ type: null, id: null, name: '' });
      toast({ title: 'Marque supprimée' });
    },
    onError: (err) => {
      setToDelete({ type: null, id: null, name: '' });
      toast({ title: 'Erreur', description: err?.message || 'Impossible de supprimer.', variant: 'destructive' });
    },
  });

  const handleAddCategory = (e) => {
    e.preventDefault();
    const name = newCategory?.trim();
    if (!name) return;
    createCategoryMutation.mutate(name);
  };

  const handleAddBrand = (e) => {
    e.preventDefault();
    const name = newBrand?.trim();
    if (!name) return;
    createBrandMutation.mutate(name);
  };

  const handleDelete = () => {
    if (toDelete.type === 'category' && toDelete.id) deleteCategoryMutation.mutate(toDelete.id);
    if (toDelete.type === 'brand' && toDelete.id) deleteBrandMutation.mutate(toDelete.id);
  };

  if (!shopId) {
    return (
      <div className="animate-fade-in p-4">
        <EmptyState icon={FolderTree} title="Aucune boutique sélectionnée" description="Sélectionnez une boutique pour gérer les catégories et marques" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Catégories & Marques"
        subtitle="Gérez les catégories et marques utilisées par vos produits"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Catégories */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700/50 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Catégories</h2>
          </div>
          <div className="p-4">
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
              <Input
                placeholder="Nouvelle catégorie"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
              />
              <Button type="submit" size="sm" disabled={!newCategory?.trim() || createCategoryMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
            {loadingCat ? (
              <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" /></div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Aucune catégorie. Ajoutez-en pour les utiliser dans vos produits.</p>
            ) : (
              <ul className="space-y-1">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setToDelete({ type: 'category', id: c.id, name: c.name })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Marques */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700/50 flex items-center gap-2">
            <Tag className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Marques</h2>
          </div>
          <div className="p-4">
            <form onSubmit={handleAddBrand} className="flex gap-2 mb-4">
              <Input
                placeholder="Nouvelle marque"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
              />
              <Button type="submit" size="sm" disabled={!newBrand?.trim() || createBrandMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
            {loadingBrand ? (
              <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" /></div>
            ) : brands.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Aucune marque. Ajoutez-en pour les utiliser dans vos produits.</p>
            ) : (
              <ul className="space-y-1">
                {brands.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{b.name}</span>
                    <button
                      type="button"
                      onClick={() => setToDelete({ type: 'brand', id: b.id, name: b.name })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Les catégories et marques sont utilisées de manière optionnelle lors de la création ou modification de produits.
      </p>

      <AlertDialog open={!!toDelete.id} onOpenChange={(open) => !open && setToDelete({ type: null, id: null, name: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {toDelete.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les produits utilisant cette {toDelete.type === 'category' ? 'catégorie' : 'marque'} conserveront toutefois la valeur enregistrée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
