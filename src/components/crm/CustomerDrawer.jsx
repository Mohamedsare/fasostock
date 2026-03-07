import React, { useMemo } from 'react';
import { X, Phone, Mail, MapPin, Bike, ShoppingBag, Calendar, Tag, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import CustomerStockPanel from './CustomerStockPanel';

const SEGMENT_STYLES = {
  vip:        { label: 'VIP',         cls: 'bg-yellow-500/20 text-yellow-400' },
  regular:    { label: 'Régulier',    cls: 'bg-blue-500/20 text-blue-400' },
  occasional: { label: 'Occasionnel', cls: 'bg-purple-500/20 text-purple-400' },
  inactive:   { label: 'Inactif',     cls: 'bg-slate-500/20 text-slate-400' },
  new:        { label: 'Nouveau',     cls: 'bg-emerald-500/20 text-emerald-400' },
};

export default function CustomerDrawer({ customer, sales = [], products = [], onClose, onEdit }) {
  const customerSales = useMemo(() =>
    sales.filter(s =>
      s.customer_phone === customer.phone ||
      s.customer_name?.toLowerCase() === customer.name?.toLowerCase()
    ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [sales, customer]
  );

  const seg = SEGMENT_STYLES[customer.segment] || SEGMENT_STYLES.new;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] border-l border-slate-200 dark:border-slate-700/50 h-full overflow-y-auto flex flex-col shadow-xl dark:shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700/50 sticky top-0 bg-white dark:bg-[#1E293B] z-10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Fiche Client</h2>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="px-3 py-1.5 text-xs bg-orange-500/10 text-orange-500 dark:text-orange-400 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-colors">
              Modifier
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Identity */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl">{customer.name?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{customer.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${seg.cls}`}>{seg.label}</span>
              {customer.email && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</p>}
              {customer.phone && <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</p>}
              {customer.address && <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.address}</p>}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{customer.purchase_count || customerSales.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Visites</p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-orange-500 dark:text-orange-400">{(customer.total_purchases || customerSales.reduce((s,x)=>s+(x.total||0),0)).toLocaleString()}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">FCFA total</p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-emerald-500 dark:text-emerald-400">
                {customerSales.length > 0 ? Math.round((customer.total_purchases || customerSales.reduce((s,x)=>s+(x.total||0),0)) / customerSales.length).toLocaleString() : 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Panier moyen</p>
            </div>
          </div>

          {/* Moto + prefs */}
          {(customer.motorcycle_brand || customer.motorcycle_model) && (
            <div className="bg-slate-100 dark:bg-slate-800/40 rounded-xl p-4 flex items-center gap-3">
              <Bike className="w-5 h-5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Moto</p>
                <p className="text-sm text-slate-900 dark:text-white font-medium">{[customer.motorcycle_brand, customer.motorcycle_model].filter(Boolean).join(' ')}</p>
              </div>
            </div>
          )}

          {customer.preferred_categories?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Catégories préférées</p>
              <div className="flex flex-wrap gap-2">
                {customer.preferred_categories.map((c, i) => (
                  <span key={i} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}

          {customer.tags?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {customer.tags.map((t, i) => (
                  <span key={i} className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {customer.notes && (
            <div className="bg-slate-100 dark:bg-slate-800/40 rounded-xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{customer.notes}</p>
            </div>
          )}

          {/* Stock lié au client */}
          <CustomerStockPanel customer={customer} products={products} />

          {/* Bouton nouvelle vente */}
          <Link
            to={createPageUrl('POS')}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/20 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            Nouvelle vente pour ce client
          </Link>

          {/* Purchase history */}
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              Historique des achats ({customerSales.length})
            </p>
            {customerSales.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">Aucun achat trouvé</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {customerSales.map(sale => (
                  <div key={sale.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-900 dark:text-white">#{sale.sale_number || sale.id?.slice(0,8)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {sale.created_at ? format(new Date(sale.created_at), 'dd MMM yyyy', { locale: fr }) : ''} · {sale.items?.length || 0} art.
                      </p>
                    </div>
                    <p className="text-sm font-bold text-orange-500 dark:text-orange-400">{sale.total?.toLocaleString()} F</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}