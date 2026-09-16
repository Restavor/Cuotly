import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { clearUserCache } from "./cache";
import { clearDrafts } from "./drafts";
import { unregisterThisDevice } from "./push";
import { supabase } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  /**
   * Cerrar sesión con orden (RN-MOV-05 y RN-MOV-09): primero se da de
   * baja el teléfono en el servidor —con la sesión todavía viva—, después
   * se borran la caché y los borradores de esta persona, y por último se
   * cierra la sesión de Supabase.
   */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user.id ?? null;
    await unregisterThisDevice();
    if (userId) {
      await clearUserCache(userId);
      await clearDrafts(userId);
    }
    await supabase.auth.signOut();
  }, [session]);

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
