import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, UserProfile, UserWithRole, RolePermission } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserWithRole | null;
  isAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      // Fetch user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*, custom_roles(*)')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError && roleError.code !== 'PGRST116') throw roleError;

      // Fetch permissions if user has a custom role
      let permissions: RolePermission | null = null;
      if (roleData?.custom_role_id) {
        const { data: permData, error: permError } = await supabase
          .from('role_permissions')
          .select('*')
          .eq('custom_role_id', roleData.custom_role_id)
          .maybeSingle();
        
        if (permError && permError.code !== 'PGRST116') throw permError;
        permissions = permData;
      }

      const userWithRole: UserWithRole = {
        ...profileData,
        role: roleData?.role as AppRole,
        custom_role: roleData?.custom_roles,
        permissions,
      };

      setProfile(userWithRole);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let initialSessionHandled = false;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';

        // If user signed out or session expired and rememberMe is false, clear session
        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session && !rememberMe)) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        // Skip if this is the INITIAL_SESSION event and we already handled it
        if (event === 'INITIAL_SESSION') {
          if (initialSessionHandled) return;
          initialSessionHandled = true;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid auth deadlock
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    // THEN check for existing session (only if listener hasn't fired yet)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (initialSessionHandled) return;
      initialSessionHandled = true;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error };
  };

  const signOut = async () => {
    // Clear remember me preference on manual logout
    localStorage.removeItem('rememberMe');
    await supabase.auth.signOut();
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
