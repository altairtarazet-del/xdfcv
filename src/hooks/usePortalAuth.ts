import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface PortalUser {
  email: string;
  smtp_account_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface UsePortalAuth {
  portalUser: PortalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;
}

const TOKEN_KEY = 'portalToken';

export function usePortalAuth(): UsePortalAuth {
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const verify = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'portalVerify', portalToken: token },
      });

      if (error || data?.error) {
        localStorage.removeItem(TOKEN_KEY);
        setPortalUser(null);
      } else {
        setPortalUser(data.user);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setPortalUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    verify();
  }, [verify]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'portalLogin', email, password },
      });

      if (error) {
        return { error: 'Baglanti hatasi' };
      }

      if (data?.error) {
        return { error: data.error };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setPortalUser(data.user);
      return { error: null };
    } catch {
      return { error: 'Beklenmeyen bir hata olustu' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setPortalUser(null);
    navigate('/portal/login');
  }, [navigate]);

  return {
    portalUser,
    isLoading,
    isAuthenticated: !!portalUser,
    login,
    logout,
  };
}
