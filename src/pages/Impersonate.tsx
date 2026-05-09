import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { AppLoading } from "@/components/AppLoading";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Impersonate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");
    if (!access_token || !refresh_token) {
      navigate("/login", { replace: true });
      return;
    }

    // Mark this tab as an impersonation tab so the app routes the auth-token
    // storage key to sessionStorage on next load (keeping admin tab unaffected).
    sessionStorage.setItem("sb-impersonating", "1");

    // Tell any other open tab (the admin tab) to ignore auth-state change
    // events for a short window while the impersonated session initializes.
    // Auto-cleared after 3s so legitimate future events are not blocked.
    try {
      localStorage.setItem("odit_impersonation_active", "true");
      setTimeout(() => {
        localStorage.removeItem("odit_impersonation_active");
      }, 3000);
    } catch {
      // ignore storage errors
    }

    // Build a temporary client that writes the session into sessionStorage
    // under the SAME storage key the global supabase client expects.
    const tabStorage: Storage = {
      length: 0,
      clear: () => sessionStorage.clear(),
      key: (i: number) => sessionStorage.key(i),
      getItem: (k: string) => sessionStorage.getItem(k),
      setItem: (k: string, v: string) => sessionStorage.setItem(k, v),
      removeItem: (k: string) => sessionStorage.removeItem(k),
    };

    const tempClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: tabStorage,
        persistSession: true,
        autoRefreshToken: false,
      },
    });

    tempClient.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) throw error;
        // Strip tokens from URL and hard-reload into the dashboard so the
        // global client picks up the session (now redirected to sessionStorage
        // by the bootstrap logic in the app).
        window.location.replace("/dashboard");
      })
      .catch(() => {
        sessionStorage.removeItem("sb-impersonating");
        navigate("/login", { replace: true });
      });
  }, [searchParams, navigate]);

  return <AppLoading label="Chargement de la session…" />;
}
