import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  STORAGE_KEYS,
} from "@/config";
import { safeLocalStorage } from "@/lib";
import { useApp } from "./app.context";

export type AuthMode = "none" | "google";

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  isPaid?: boolean;
  plan?: string;
  source?: "google" | "website";
}

interface PersistedAuth {
  mode: "google";
  googleProfile: GoogleProfile | null;
}

interface AuthContextValue {
  mode: AuthMode;
  googleProfile: GoogleProfile | null;
  isAuthenticated: boolean;
  signInWithGoogleProfile: (profile: GoogleProfile) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readPersistedAuth(): PersistedAuth | null {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuth;
    if (parsed.mode !== "google") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedAuth(data: PersistedAuth) {
  safeLocalStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(data));
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { setCredits, setLastRefresh, setUser } = useApp();
  const [mode, setMode] = useState<AuthMode>("none");
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(
    null
  );

  useEffect(() => {
    const hydrate = () => {
      const persisted = readPersistedAuth();
      if (!persisted) {
        setMode("none");
        setGoogleProfile(null);
        setUser(null);
        return;
      }

      setMode(persisted.mode);
      const gp = persisted.googleProfile ?? null;
      setGoogleProfile(gp);

      if (persisted.mode === "google" && gp?.email) {
        setUser({
          email: gp.email,
          name: gp.name || gp.email,
          picture: gp.picture,
          isPaid: gp.isPaid,
          plan: gp.plan,
          source: gp.source,
        });
      } else {
        setUser(null);
      }
    };

    // Initial hydration
    hydrate();

    // Sync across windows
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.AUTH_SESSION) {
        hydrate();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time automatic background subscription checking
  useEffect(() => {
    const syncSubscription = async () => {
      // Always re-read from localStorage so we get the latest persisted state
      const persisted = readPersistedAuth();
      if (!persisted || persisted.mode !== "google" || !persisted.googleProfile?.email) return;

      const email = persisted.googleProfile.email;
      try {
        console.log(`Checking subscription status for: ${email}`);
        const response = await fetch(
          `https://arqpulsablelhhbtyhyj.supabase.co/functions/v1/deskify?email=${encodeURIComponent(email)}`,
          { cache: "no-store" }
        );
        if (response.ok) {
          const data = await response.json();
          const currentGp = persisted.googleProfile;

          // Always overwrite — the Supabase endpoint is the source of truth.
          // This ensures a stale `isPaid:true` baked into the sign-in token is
          // corrected even if the cached localStorage value hasn't changed yet.
          const updatedProfile = {
            ...currentGp,
            isPaid: data.isPaid,
            plan: data.plan,
          };

          // Persist the authoritative values
          writePersistedAuth({ mode: "google", googleProfile: updatedProfile });

          // Only trigger a React re-render if something actually changed
          if (currentGp.isPaid !== data.isPaid || currentGp.plan !== data.plan) {
            console.log(`Subscription change detected: isPaid=${data.isPaid}, plan=${data.plan}`);
            setGoogleProfile(updatedProfile);
            setUser({
              email: updatedProfile.email,
              name: updatedProfile.name || updatedProfile.email,
              picture: updatedProfile.picture,
              isPaid: updatedProfile.isPaid,
              plan: updatedProfile.plan,
              source: updatedProfile.source,
            });
          }
        }
      } catch (e) {
        console.warn("Failed to check subscription status:", e);
      }
    };

    // Run shortly after mount
    const initialTimer = setTimeout(syncSubscription, 1500);
    // Then re-check every 5 minutes while the app is open
    const interval = setInterval(syncSubscription, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [setUser]);

  const signInWithGoogleProfile = useCallback(
    (profile: GoogleProfile) => {
      writePersistedAuth({ mode: "google", googleProfile: profile });
      setMode("google");
      setGoogleProfile(profile);
      setCredits(0);
      setLastRefresh(Date.now());
      setUser({
        email: profile.email,
        name: profile.name || profile.email || "Google user",
        picture: profile.picture,
        isPaid: profile.isPaid,
        plan: profile.plan,
        source: profile.source,
      });

      // Immediately verify subscription status from backend to avoid stale
      // isPaid values baked into the auth token at time of login.
      (async () => {
        try {
          const res = await fetch(
            `https://arqpulsablelhhbtyhyj.supabase.co/functions/v1/deskify?email=${encodeURIComponent(profile.email)}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const data = await res.json();
            const verified: GoogleProfile = { ...profile, isPaid: data.isPaid, plan: data.plan };
            writePersistedAuth({ mode: "google", googleProfile: verified });
            setGoogleProfile(verified);
            setUser({
              email: verified.email,
              name: verified.name || verified.email,
              picture: verified.picture,
              isPaid: verified.isPaid,
              plan: verified.plan,
              source: verified.source,
            });
          }
        } catch {
          // Non-fatal — the periodic sync will correct it later
        }
      })();
    },
    [setCredits, setLastRefresh, setUser]
  );

  const signOut = useCallback(() => {
    safeLocalStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    setMode("none");
    setGoogleProfile(null);
    setUser(null);
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      googleProfile,
      isAuthenticated: mode === "google",
      signInWithGoogleProfile,
      signOut,
    }),
    [
      mode,
      googleProfile,
      signInWithGoogleProfile,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
