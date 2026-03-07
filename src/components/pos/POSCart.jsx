import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';

export default function POSCart({ cart, onUpdateQty, onRemove, discount, onDiscountChange }) {
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discountAmount = subtotal * (discount / 100);
  const total = subtotal - discountAmount;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Cart Header */}
      <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Panier</h2>
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{cart.length} article(s)</span>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Panier vide</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={idx} className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200 dark:border-slate-700/30">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.product_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.unit_price.toLocaleString()} F/unité</p>
                </div>
                <button onClick={() => onRemove(idx)} className="text-slate-500 hover:text-red-400 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQty(idx, Math.max(1, item.quantity - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-slate-900 dark:text-white">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(idx, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-sm font-bold text-orange-400">{(item.unit_price * item.quantity).toLocaleString()} F</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-700/50 space-y-3">
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>Sous-total</span>
          <span>{subtotal.toLocaleString()} F</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Remise %</span>
          <Input
            type="number" min="0" max="100"
            value={discount}
            onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
            className="w-20 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm h-8"
          />
          {discountAmount > 0 && (
            <span className="text-sm text-red-400 ml-auto">-{discountAmount.toLocaleString()} F</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/30">
          <span className="text-lg font-bold text-slate-900 dark:text-white">TOTAL</span>
          <span className="text-xl font-bold text-orange-500">{total.toLocaleString()} F</span>
        </div>
      </div>
    </div>
  );
}