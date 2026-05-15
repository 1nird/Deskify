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
      });
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
