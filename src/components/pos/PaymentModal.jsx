import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Banknote, Smartphone, CreditCard } from 'lucide-react';

export default function PaymentModal({ total, onConfirm, onCancel }) {
  const [method, setMethod] = useState('cash');
  const [cashAmount, setCashAmount] = useState(total);
  const [mobileAmount, setMobileAmount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(() => {
    setCashAmount(total);
  }, [total]);

  const change = method === 'cash' ? Math.max(0, cashAmount - total)
    : method === 'mixed' ? Math.max(0, (cashAmount + mobileAmount) - total) : 0;

  const isValid = method === 'cash' ? cashAmount >= total
    : method === 'mobile_money' ? true
    : method === 'mixed' ? (cashAmount + mobileAmount) >= total
    : true;

  const handleConfirm = () => {
    onConfirm({
      payment_method: method,
      cash_amount: method === 'cash' || method === 'mixed' ? cashAmount : 0,
      mobile_money_amount: method === 'mobile_money' || method === 'mixed' ? (method === 'mobile_money' ? total : mobileAmount) : 0,
      amount_received: method === 'cash' ? cashAmount : method === 'mixed' ? cashAmount + mobileAmount : total,
      change_given: change,
      customer_name: customerName,
      customer_phone: customerPhone,
    });
  };

  const methods = [
    { id: 'cash', label: 'Cash', icon: Banknote },
    { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { id: 'mixed', label: 'Mixte', icon: CreditCard },
  ];

  const modal = (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 pt-12 pb-12">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md animate-slide-up shadow-xl dark:shadow-none flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Paiement</h2>
          <button onClick={onCancel} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* Total */}
          <div className="text-center py-4 bg-slate-100 dark:bg-slate-900 rounded-xl">
            <p className="text-sm text-slate-500 dark:text-slate-400">Total à payer</p>
            <p className="text-3xl font-bold text-orange-500">{total.toLocaleString()} F</p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {methods.map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                  method === m.id ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-500' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                <m.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Cash input */}
          {(method === 'cash' || method === 'mixed') && (
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Montant cash (FCFA)</Label>
              <Input type="number" value={cashAmount} onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-lg mt-1" />
            </div>
          )}

          {/* Mobile money input */}
          {method === 'mixed' && (
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Montant Mobile Money (FCFA)</Label>
              <Input type="number" value={mobileAmount} onChange={(e) => setMobileAmount(parseFloat(e.target.value) || 0)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-lg mt-1" />
            </div>
          )}

          {/* Change */}
          {change > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Rendu monnaie</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{change.toLocaleString()} F</p>
            </div>
          )}

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Client (optionnel)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="Nom" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-xs">Téléphone</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white mt-1" placeholder="Numéro" />
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-5 pt-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
          <Button
            onClick={handleConfirm}
            disabled={!isValid}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold disabled:opacity-50"
          >
            Valider la vente
          </Button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}