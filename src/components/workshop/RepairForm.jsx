import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Save } from 'lucide-react';

export default function RepairForm({ repair, onSave, onCancel }) {
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', motorcycle_brand: '', motorcycle_model: '',
    motorcycle_year: '', plate_number: '', description: '', mechanic: '',
    labor_cost: 0, status: 'pending', payment_status: 'unpaid',
    estimated_completion: '', notes: '',
    ...repair,
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-20 pb-8 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl mx-4 my-4 animate-slide-up shadow-xl dark:shadow-none">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{repair ? 'Modifier Réparation' : 'Nouvel Ordre de Réparation'}</h2>
          <button onClick={onCancel} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Nom du client *</Label>
              <Input value={form.customer_name} onChange={(e) => handleChange('customer_name', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" required />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Téléphone client</Label>
              <Input value={form.customer_phone} onChange={(e) => handleChange('customer_phone', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Marque moto</Label>
              <Input value={form.motorcycle_brand} onChange={(e) => handleChange('motorcycle_brand', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Modèle moto</Label>
              <Input value={form.motorcycle_model} onChange={(e) => handleChange('motorcycle_model', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">N° Plaque</Label>
              <Input value={form.plate_number} onChange={(e) => handleChange('plate_number', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Mécanicien</Label>
              <Input value={form.mechanic} onChange={(e) => handleChange('mechanic', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Description du problème *</Label>
              <Textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-20" required />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Coût main d'œuvre (FCFA)</Label>
              <Input type="number" value={form.labor_cost} onChange={(e) => handleChange('labor_cost', parseFloat(e.target.value) || 0)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Date estimée fin</Label>
              <Input type="date" value={form.estimated_completion} onChange={(e) => handleChange('estimated_completion', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" />
            </div>
            {repair && (
              <>
                <div>
                  <Label className="text-slate-600 dark:text-slate-300 text-xs">Statut</Label>
                  <Select value={form.status} onValueChange={(v) => handleChange('status', v)}>
                    <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem value="completed">Terminé</SelectItem>
                      <SelectItem value="delivered">Livré</SelectItem>
                      <SelectItem value="cancelled">Annulé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-600 dark:text-slate-300 text-xs">Statut paiement</Label>
                  <Select value={form.payment_status} onValueChange={(v) => handleChange('payment_status', v)}>
                    <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Non payé</SelectItem>
                      <SelectItem value="partial">Partiel</SelectItem>
                      <SelectItem value="paid">Payé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1 h-16" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button type="button" variant="outline" onClick={onCancel} className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Annuler</Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
              <Save className="w-4 h-4 mr-2" />{repair ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}