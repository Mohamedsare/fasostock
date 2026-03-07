import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/api/supabase';
import { useAuth } from '@/lib/AuthContext';

const ShopContext = createContext({ currentShop: null, shops: [], setCurrentShop: () => {}, refetchShops: () => {} });

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [currentShop, setCurrentShopState] = useState(null);

  const fetchShops = async () => {
    try {
      const list = user?.id
        ? await api.shops.listForUser(user.id, user.role)
        : await api.shops.list();
      setShops(list);
      const savedId = localStorage.getItem('fasostock_shop_id');
      const found = list.find(s => s.id === savedId) || list[0] || null;
      setCurrentShopState(found);
    } catch (err) {
      console.warn('fetchShops failed:', err);
      setShops([]);
      setCurrentShopState(null);
    }
  };

  useEffect(() => { fetchShops(); }, [user?.id, user?.role]);

  const setCurrentShop = (shop) => {
    setCurrentShopState(shop);
    if (shop) localStorage.setItem('fasostock_shop_id', shop.id);
  };

  return (
    <ShopContext.Provider value={{ currentShop, shops, setCurrentShop, refetchShops: fetchShops }}>
      {children}
    </ShopContext.Provider>
  );
}

export const useShop = () => useContext(ShopContext);
