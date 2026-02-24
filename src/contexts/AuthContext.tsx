import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import type { UserProfile, UserRole } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await (supabase as any)
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      setProfile(data as UserProfile);
    }
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            setTimeout(() => fetchProfile(session.user.id), 0);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }
      );
      subscription = data.subscription;
    } catch (err) {
      console.error('Auth state change listener failed:', err);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    }).catch((err) => {
      console.error('getSession failed:', err);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
