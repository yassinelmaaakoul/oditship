import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "superviseur" | "administrateur" | "vendeur" | "agent"
  | "ramassoire" | "magasinier" | "support" | "suivi"
  | "comptable" | "livreur" | "commercial" | "gestion_retour";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).limit(1).maybeSingle(),
    ]);
    setProfile(p);
    setRole((r?.role as AppRole) || (p?.role as AppRole) || null);
  };

  useEffect(() => {
    // Track the currently loaded user id so we only refresh the profile when
    // the actual user changes (login/logout/switch). Token refreshes that fire
    // when the browser tab regains focus must NOT toggle `loading` — otherwise
    // ProtectedRoute unmounts the whole subtree (including any open dialog
    // or popup) and the user loses their place in the UI.
    let currentUserId: string | null = null;

    // Listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // While an impersonation is active in another tab, ignore auth events
      // so the admin tab's context (and therefore sidebar/URL) is not altered.
      try {
        if (localStorage.getItem("odit_impersonation_active") === "true") {
          return;
        }
      } catch {
        // ignore storage errors
      }

      setSession(sess);
      setUser(sess?.user ?? null);

      const nextUserId = sess?.user?.id ?? null;

      // Pure background refreshes — never touch loading or reload profile.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        return;
      }

      if (nextUserId && nextUserId !== currentUserId) {
        // Real user change (login or account switch) — reload profile.
        currentUserId = nextUserId;
        // Defer the supabase call to avoid auth deadlock.
        setTimeout(() => { loadProfile(nextUserId); }, 0);
      } else if (!nextUserId) {
        currentUserId = null;
        setProfile(null);
        setRole(null);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        currentUserId = data.session.user.id;
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <Ctx.Provider value={{ user, session, role, profile, loading, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
};
