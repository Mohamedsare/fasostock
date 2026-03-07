import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Printer, Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '@/api/supabase';

const TICKET_WIDTH_PX = { '58': '220px', '80': '280px' };

export default function ReceiptModal({ sale, onClose, shop: shopProp, title }) {
  const receiptRef = useRef();
  const [shop, setShop] = useState(shopProp || null);

  useEffect(() => {
    const shopId = sale?.shop_id || shopProp?.id || localStorage.getItem('fasostock_shop_id');
    const loadShop = async () => {
      try {
        if (shopProp) {
          const settings = await api.settings.list(shopProp.id);
          const width = settings?.[0]?.receipt_printer_width || '80';
          setShop({ ...shopProp, receipt_printer_width: width });
          return;
        }
        const shops = await api.shops.list();
        const found = shopId ? shops.find(s => s.id === shopId) : shops[0];
        if (found) {
          const settings = await api.settings.list(found.id);
          const width = settings?.[0]?.receipt_printer_width || '80';
          setShop({ ...found, receipt_printer_width: width });
          return;
        }
        if (shops[0]) {
          const settings = await api.settings.list(shops[0].id);
          const width = settings?.[0]?.receipt_printer_width || '80';
          setShop({ ...shops[0], receipt_printer_width: width });
          return;
        }
        const settings = await api.settings.list(shopId);
        if (settings?.[0]) {
          setShop({
            name: settings[0].shop_name,
            phone: settings[0].shop_phone,
            address: settings[0].shop_address,
            receipt_footer: settings[0].receipt_footer,
            currency: settings[0].currency,
            receipt_printer_width: settings[0].receipt_printer_width || '80',
          });
        }
      } catch (err) { console.error(err); }
    };
    loadShop();
  }, [sale?.shop_id, shopProp]);

  const shopName = shop?.name || 'FASOSTOCK';
  const shopPhone = shop?.phone || '';
  const shopAddress = shop?.address || '';
  const currency = shop?.currency || 'F';
  const footer = shop?.receipt_footer || 'Merci de votre achat !';
  const printerWidth = shop?.receipt_printer_width === '58' ? '58' : '80';
  const ticketWidthPx = TICKET_WIDTH_PX[printerWidth] || TICKET_WIDTH_PX['80'];

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const widthMm = printerWidth;
    const win = window.open('', '_blank', 'width=320,height=700');
    win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket - ${sale.sale_number || 'Vente'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${widthMm}mm auto; margin: 3mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${printerWidth === '58' ? '10px' : '11px'};
      line-height: 1.35;
      color: #1a1a1a;
      background: #fff;
      width: ${widthMm}mm;
      min-height: 100vh;
      margin: 0 auto;
      padding: 6mm 4mm;
    }
    .ticket { width: 100%; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .sep { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .row span:last-child { text-align: right; white-space: nowrap; }
    .item-name { margin-bottom: 1px; word-break: break-word; }
    .item-detail { font-size: 10px; color: #444; }
    .total-line { font-weight: bold; margin-top: 4px; font-size: 12px; }
    .footer { text-align: center; font-size: 10px; color: #555; margin-top: 8px; }
    .cut { border: none; border-top: 2px dashed #999; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="ticket">${content.innerHTML}</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 250);
  };

  const paymentLabels = { cash: 'Espèces', mobile_money: 'Mobile Money', mixed: 'Mixte', credit: 'Crédit' };
  const dateStr = sale.created_at
    ? format(new Date(sale.created_at), "dd/MM/yyyy HH:mm", { locale: fr })
    : format(new Date(), "dd/MM/yyyy HH:mm", { locale: fr });

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl w-full max-w-[340px] animate-slide-up flex flex-col max-h-[90vh] shadow-2xl">
        <div className="flex justify-center pt-5 flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-center text-emerald-700 dark:text-emerald-400 font-semibold mt-2 text-sm flex-shrink-0">{title || 'Vente enregistrée'}</p>

        <div className="overflow-y-auto flex-1 px-4 py-3 min-h-0">
          {/* Ticket physique */}
          <div
            ref={receiptRef}
            className="receipt-ticket bg-white dark:bg-stone-50 text-stone-900 dark:text-stone-800 mx-auto shadow-lg"
            style={{
              width: ticketWidthPx,
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '11px',
              lineHeight: 1.4,
              padding: '14px 12px',
              border: '1px solid #e5e5e5',
            }}
          >
            {/* Ligne décorative haut */}
            <div className="text-center text-stone-400 text-[10px] tracking-widest mb-1">* * * * * * * * * *</div>

            {/* En-tête boutique */}
            <div className="text-center mb-2">
              <div className="font-bold uppercase tracking-wide text-[13px] leading-tight">{shopName}</div>
              {shopAddress ? <div className="text-[10px] text-stone-600 mt-0.5">{shopAddress}</div> : null}
              {shopPhone ? <div className="text-[10px] text-stone-600">Tél: {shopPhone}</div> : null}
            </div>

            <div className="border-t border-dashed border-stone-300 my-2" />

            {/* N° ticket + date */}
            <div className="flex justify-between text-[10px]">
              <span>N° {sale.sale_number || sale.id?.slice(0, 8)}</span>
              <span>{dateStr}</span>
            </div>
            {sale.seller_name ? <div className="text-[10px] mt-0.5">Vendeur: {sale.seller_name}</div> : null}
            {sale.customer_name ? <div className="text-[10px]">Client: {sale.customer_name}</div> : null}
            {sale.customer_phone ? <div className="text-[10px]">Tél: {sale.customer_phone}</div> : null}

            <div className="border-t border-dashed border-stone-300 my-2" />

            {/* Articles */}
            <div className="space-y-2">
              {sale.items?.map((item, i) => (
                <div key={i}>
                  <div className="font-medium text-[11px] leading-tight">{item.product_name}</div>
                  <div className="flex justify-between text-[10px] text-stone-600 mt-0.5">
                    <span>{item.quantity} × {Number(item.unit_price || 0).toLocaleString('fr-FR')} {currency}</span>
                    <span className="font-medium text-stone-800">{(item.total ?? item.quantity * (item.unit_price || 0)).toLocaleString('fr-FR')} {currency}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-stone-300 my-2" />

            {/* Totaux */}
            {Number(sale.discount_amount || 0) > 0 && (
              <>
                <div className="flex justify-between text-[10px]">
                  <span>Sous-total</span>
                  <span>{Number(sale.subtotal || 0).toLocaleString('fr-FR')} {currency}</span>
                </div>
                <div className="flex justify-between text-[10px] text-red-700">
                  <span>Remise</span>
                  <span>-{Number(sale.discount_amount || 0).toLocaleString('fr-FR')} {currency}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-[12px] mt-1 pt-1">
              <span>TOTAL</span>
              <span>{Number(sale.total || 0).toLocaleString('fr-FR')} {currency}</span>
            </div>

            <div className="border-t border-dashed border-stone-300 my-2" />

            <div className="text-[10px]">
              <div>Paiement: {paymentLabels[sale.payment_method] || sale.payment_method}</div>
              {Number(sale.change_given || 0) > 0 && (
                <div>Monnaie: {Number(sale.change_given).toLocaleString('fr-FR')} {currency}</div>
              )}
            </div>

            <div className="border-t border-dashed border-stone-300 my-2" />
            <div className="text-center text-[10px] text-stone-500 leading-tight">{footer}</div>
            <div className="text-center text-stone-300 text-[10px] tracking-widest mt-2">* * * * * * * * * *</div>
          </div>
        </div>

        <div className="flex gap-3 p-4 flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
          <Button variant="outline" onClick={onClose} className="flex-1 h-10 text-sm">Fermer</Button>
          <Button onClick={handlePrint} className="flex-1 h-10 text-sm bg-orange-500 hover:bg-orange-600">
            <Printer className="w-4 h-4 mr-2" /> Imprimer
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
