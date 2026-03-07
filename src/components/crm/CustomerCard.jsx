import React from 'react';
import { Phone, Mail, Bike, Tag, ShoppingBag, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const SEGMENT_STYLES = {
  vip:        { label: 'VIP',        cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  regular:    { label: 'Régulier',   cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  occasional: { label: 'Occasionnel',cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  inactive:   { label: 'Inactif',    cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  new:        { label: 'Nouveau',    cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

export default function CustomerCard({ customer, onClick }) {
  const seg = SEGMENT_STYLES[customer.segment] || SEGMENT_STYLES.new;
  return (
    <div
      onClick={() => onClick(customer)}
      className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 cursor-pointer hover:border-orange-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shadow-sm dark:shadow-none"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{customer.name?.[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{customer.name}</p>
            {customer.phone && <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</p>}
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${seg.cls}`}>{seg.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-100 dark:bg-slate-900/40 rounded-lg p-2 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-0.5">Achats</p>
          <p className="font-bold text-slate-900 dark:text-white">{customer.purchase_count || 0}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-900/40 rounded-lg p-2 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-0.5">Total</p>
          <p className="font-bold text-orange-500 dark:text-orange-400">{(customer.total_purchases || 0).toLocaleString()} F</p>
        </div>
      </div>

      {(customer.motorcycle_brand || customer.motorcycle_model) && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
          <Bike className="w-3 h-3 flex-shrink-0" />
          {[customer.motorcycle_brand, customer.motorcycle_model].filter(Boolean).join(' ')}
        </p>
      )}
      {customer.last_purchase_date && (
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Dernier achat: {format(new Date(customer.last_purchase_date), 'dd MMM yyyy', { locale: fr })}
        </p>
      )}
    </div>
  );
}