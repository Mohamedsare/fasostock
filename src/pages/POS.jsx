import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShop } from '@/components/context/ShopContext';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Package, ArrowLeft, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import POSCart from '../components/pos/POSCart';
import PaymentModal from '../components/pos/PaymentModal';
import ReceiptModal from '../components/pos/ReceiptModal';

export default function POS() {
  const { currentShop } = useShop();
  const { user } = useAuth();
  const shopId = currentShop?.id;
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const searchRef = useRef();

  const queryClient = useQueryClient();

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ['products', shopId],
    queryFn: () => api.products.filter({ status: 'active' }, shopId),
    enabled: !!shopId,
  });

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search) || p.internal_ref?.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (product) => {
    const available = product.quantity ?? 0;
    if (available <= 0) return;
    setCart(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        const newQty = Math.min(updated[existing].quantity + 1, available);
        updated[existing] = { ...updated[existing], quantity: newQty, total: updated[existing].unit_price * newQty };
        return updated;
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.sale_price,
        purchase_price: product.purchase_price || 0,
        total: product.sale_price,
      }];
    });
  };

  const updateQty = (index, qty) => {
    const product = products.find(p => p.id === cart[index]?.product_id);
    const maxQty = product?.quantity ?? 0;
    const clamped = Math.min(Math.max(1, qty), maxQty);
    setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: clamped, total: item.unit_price * clamped } : item));
  };

  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discountAmount = subtotal * (discount / 100);
  const total = subtotal - discountAmount;
  const totalCost = cart.reduce((sum, item) => sum + item.purchase_price * item.quantity, 0);

  const saleMutation = useMutation({
    mutationFn: async (paymentData) => {
      const saleNumber = `V${Date.now().toString().slice(-8)}`;
      const items = cart.map(item => ({ ...item, total: item.unit_price * item.quantity }));

      const saleData = {
        shop_id: shopId,
        sale_number: saleNumber,
        items,
        subtotal,
        discount_percent: discount,
        discount_amount: discountAmount,
        total,
        total_cost: totalCost,
        profit: total - totalCost,
        seller_name: user?.full_name || '',
        ...paymentData,
      };

      const sale = await api.sales.create(saleData);

      for (const item of cart) {
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          await api.products.update(product.id, {
            quantity: Math.max(0, (product.quantity || 0) - item.quantity)
          });
        }
      }

      return { ...saleData, id: sale.id, created_at: sale.created_at };
    },
    onSuccess: (sale) => {
      setCompletedSale(sale);
      setShowPayment(false);
      setShowMobileCart(false);
      setCart([]);
      setDiscount(0);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err) => {
      toast({ title: 'Erreur lors de la vente', description: err?.message || 'Veuillez réessayer.', variant: 'destructive' });
    },
  });

  if (!shopId) {
    return (
      <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0F172A] items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto">
            <Store className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Aucune boutique sélectionnée</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sélectionnez une boutique pour utiliser le point de vente.</p>
          <Button asChild className="w-full bg-orange-500 hover:bg-orange-600">
            <Link to={createPageUrl('Dashboard')}>Retour au tableau de bord</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0F172A]">
      <div className="h-14 bg-white dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('Dashboard')} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">F</span>
          </div>
          <span className="text-slate-900 dark:text-white font-bold">Point de Vente</span>
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">{user?.full_name}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <Input ref={searchRef} placeholder="Rechercher ou scanner un produit..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white h-11" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.quantity === 0}
                  className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                    product.quantity === 0
                      ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-700/30 bg-slate-100 dark:bg-slate-800/30'
                      : 'border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 hover:border-orange-500/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-95 shadow-sm dark:shadow-none'
                  }`}
                >
                  {product.photo_url ? (
                    <img src={product.photo_url} alt="" className="w-full h-20 rounded-lg object-cover mb-2" />
                  ) : (
                    <div className="w-full h-20 rounded-lg bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-2">
                      <Package className="w-8 h-8 text-slate-400 dark:text-slate-600" />
                    </div>
                  )}
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate w-full">{product.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{product.brand || ''}</p>
                  <div className="flex items-center justify-between w-full mt-1.5">
                    <span className="text-sm font-bold text-orange-400">{product.sale_price?.toLocaleString()} F</span>
                    <span className={`text-xs ${product.quantity <= (product.min_stock_alert || 5) ? 'text-yellow-500 dark:text-yellow-400' : 'text-slate-500 dark:text-slate-500'}`}>x{product.quantity}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="w-[380px] min-h-0 overflow-hidden bg-white dark:bg-slate-800/30 border-l border-slate-200 dark:border-slate-700/50 hidden lg:flex flex-col shadow-sm dark:shadow-none">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <POSCart cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart} discount={discount} onDiscountChange={setDiscount} />
          </div>
          <div className="flex-shrink-0 p-4 pt-3 border-t border-slate-200 dark:border-slate-700/30 bg-white dark:bg-slate-800/30">
            <Button onClick={() => setShowPayment(true)} disabled={cart.length === 0} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white text-base font-bold disabled:opacity-50">
              Encaisser · {total.toLocaleString()} F
            </Button>
          </div>
        </div>
      </div>

      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4">
          <Button onClick={() => setShowMobileCart(true)} className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold rounded-2xl shadow-xl shadow-orange-500/20">
            Panier · {cart.length} article{cart.length > 1 ? 's' : ''} · {total.toLocaleString()} F
          </Button>
        </div>
      )}

      <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
        <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] rounded-t-2xl flex flex-col p-0 border-slate-200 dark:border-slate-700">
          <SheetHeader className="p-4 pr-12 border-b border-slate-200 dark:border-slate-700/50 text-left">
            <SheetTitle className="text-lg">Panier</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <POSCart cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart} discount={discount} onDiscountChange={setDiscount} />
            </div>
            <div className="flex-shrink-0 p-4 pt-0 border-t border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30">
              <Button
                onClick={() => { setShowMobileCart(false); setShowPayment(true); }}
                disabled={cart.length === 0}
                className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white text-base font-bold disabled:opacity-50"
              >
                Payer · {total.toLocaleString()} F
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showPayment && (
        <PaymentModal total={total} onConfirm={(paymentData) => saleMutation.mutate(paymentData)} onCancel={() => setShowPayment(false)} />
      )}

      {completedSale && (
        <ReceiptModal sale={completedSale} onClose={() => setCompletedSale(null)} shop={currentShop} />
      )}
    </div>
  );
}
