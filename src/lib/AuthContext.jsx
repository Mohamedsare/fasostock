import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/api/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadProfile = async (authUser) => {
    if (!authUser) return null;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (error) {
        console.warn('loadProfile error:', error);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('loadProfile failed:', err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted) setIsLoadingAuth(false);
    }, 8000);

    const init = async () => {
      try {
        setAuthError(null);
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (session?.user) {
          const p = await loadProfile(session.user);
          if (!mounted) return;
          setProfile(p);
          setUser({
            id: session.user.id,
            email: session.user.email,
            full_name: p?.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
            role: p?.role || 'cashier',
          });
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        if (mounted) {
          setAuthError({ type: 'unknown', message: err.message });
          setUser(null);
          setProfile(null);
        }
      } finally {
        clearTimeout(timeout);
        if (mounted) setIsLoadingAuth(false);
      }
    };

    init();

    // IMPORTANT: Ne JAMAIS réagir à session=null dans onAuthStateChange.
    // Supabase émet des faux SIGNED_OUT lors du rechargement, du resize, du token refresh.
    // Seul init() et logout() explicite peuvent déconnecter.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (session?.user) {
        try {
          const p = await loadProfile(session.user);
          if (!mounted) return;
          setProfile(p);
          setUser({
            id: session.user.id,
            email: session.user.email,
            full_name: p?.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
            role: p?.role || 'cashier',
          });
          setAuthError(null);
        } catch (err) {
          console.warn('loadProfile in onAuthStateChange:', err);
        }
      }
      // session === null : on ne fait RIEN (évite les faux sign-out)
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data?.session?.user) {
      const p = await loadProfile(data.session.user);
      setProfile(p);
      setUser({
        id: data.session.user.id,
        email: data.session.user.email,
        full_name: p?.full_name || data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0],
        role: p?.role || 'cashier',
      });
    }
    return data;
  };

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    if (error) throw error;
    return data;
  };

  const logout = async (redirectUrl) => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    if (redirectUrl) window.location.href = redirectUrl;
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  const updateProfile = async (updates) => {
    if (!user?.id) return;
    const p = await api.profiles.update(user.id, updates);
    setProfile(p);
    setUser(prev => ({ ...prev, full_name: p?.full_name || prev.full_name, role: p?.role || prev.role }));
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isAuthenticated: !!user,
      isLoadingAuth,
      authError,
      login,
      signUp,
      logout,
      navigateToLogin,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
