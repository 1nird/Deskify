import { type ReactNode, useEffect, useState } from "react";
import { Logo } from "@/components";
import { useApp } from "@/hooks";
import { Button } from "@/components";
import { useAuth } from "@/contexts/auth.context";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import type { GoogleProfile } from "@/contexts/auth.context";
import {
  clearOAuthFragmentFromUrl,
  parseDesktopAuthProfile,
  parseGoogleAuthParams,
} from "@/lib/google-oauth-redirect";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const websiteAuthUrl = (import.meta.env.VITE_WEBSITE_AUTH_URL ?? "").trim();

type Props = {
  children: ReactNode;
};

export const AuthGate = ({ children }: Props) => {
  const { isAuthenticated, signInWithGoogleProfile } = useAuth();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<boolean>(false);

  useEffect(() => {
    // Version Lock: Check if this version is allowed to run
    // For a real production app, you would fetch this from your API
    const checkVersion = async () => {
      try {
        const currentVersion = "2.5.0"; // Hardcoded for this build
        const minAllowedVersion = "2.5.0"; // Only allow v2.5+
        
        if (currentVersion < minAllowedVersion) {
          setVersionError(true);
        }
      } catch (e) {
        console.error("Version check failed", e);
      }
    };
    checkVersion();
  }, []);
  const { updateAvailable, applyUpdate } = useApp();

  useEffect(() => {

    const checkAuth = async () => {
      const desktopProfile = parseDesktopAuthProfile();
      if (desktopProfile?.email) {
        clearOAuthFragmentFromUrl();
        const profile: GoogleProfile = {
          sub: String(desktopProfile.sub || desktopProfile.email),
          email: String(desktopProfile.email),
          name: desktopProfile.name,
          picture: desktopProfile.picture,
          isPaid: desktopProfile.isPaid,
          plan: desktopProfile.plan,
          source: desktopProfile.source ?? "website",
        };
        signInWithGoogleProfile(profile);
        return;
      }

      const parsed = parseGoogleAuthParams();
      if (!parsed) return;

      if (parsed.error) {
        clearOAuthFragmentFromUrl();
        setOauthMsg(
          parsed.errorDescription
            ? `${parsed.error}: ${parsed.errorDescription}`
            : `Sign-in failed (${parsed.error}). Check redirect URI.`
        );
        return;
      }

      const { code, verifier, redirectUri } = parsed;
      if (!code) return;

      setOauthBusy(true);
      setOauthMsg(null);
      clearOAuthFragmentFromUrl();

      try {
        if (!googleClientId.trim()) {
          throw new Error(
            "Google client ID missing. Set VITE_GOOGLE_CLIENT_ID or use VITE_WEBSITE_AUTH_URL with desktop auth payload."
          );
        }

        // 1. Exchange code for access token (PKCE)
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "",
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json();
          throw new Error(errData.error_description || "Token exchange failed");
        }

        const { access_token } = await tokenRes.json();

        // 2. Use token to get user info
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!res.ok) throw new Error("Failed to load Google profile");
        const data = await res.json();
        const profile: GoogleProfile = {
          sub: String(data.sub),
          email: String(data.email ?? ""),
          name: data.name ? String(data.name) : undefined,
          picture: data.picture ? String(data.picture) : undefined,
        };
        signInWithGoogleProfile(profile);
      } catch (e) {
        console.error(e);
        setOauthMsg(
          e instanceof Error ? e.message : "Could not complete Google sign-in"
        );
      } finally {
        setOauthBusy(false);
      }
    };

    // Check on mount (in case we're already redirected)
    checkAuth();

    // Listen for hash changes (for Tauri system browser redirects)
    window.addEventListener("hashchange", checkAuth);
    return () => window.removeEventListener("hashchange", checkAuth);
  }, [isAuthenticated, signInWithGoogleProfile]);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (updateAvailable) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm pointer-events-auto">
        <div className="w-full max-w-[420px] rounded-[32px] border border-emerald-500/20 bg-[#0A0A0A]/80 p-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] backdrop-blur-3xl">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <Logo size={64} className="relative" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Update Available</h1>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                A new version of Deskify is ready. Click below to download and install.
              </p>
            </div>
            <Button onClick={applyUpdate} className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white pointer-events-auto">
              Update Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (versionError) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-[420px] rounded-[32px] border border-red-500/20 bg-[#0A0A0A]/80 p-8 shadow-[0_0_50px_-12px_rgba(239,68,68,0.2)] backdrop-blur-3xl">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
              <Logo size={64} className="relative grayscale opacity-50" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Version Expired</h1>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                This version of Deskify is no longer supported. Please download the latest version (v2.5.0) from the official website to continue.
              </p>
            </div>
            <div className="w-full pt-4">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <p className="text-xs text-red-400 font-bold">ACCESS BLOCKED</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-transparent">
      <div
        className="w-full max-w-[420px] rounded-[32px] border-0 bg-[#0A0A0A]/80 p-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-500"
        data-tauri-drag-region
      >
        <div className="flex flex-col items-center text-center space-y-6" data-tauri-drag-region>
          <div className="relative" data-tauri-drag-region>
             <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
             <Logo size={64} className="relative" />
          </div>
          
          <div className="space-y-2" data-tauri-drag-region>
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-br from-white via-emerald-400 to-emerald-600 bg-clip-text text-transparent pb-1" data-tauri-drag-region>
              Deskify
            </h1>
            <p className="text-sm text-zinc-500 font-medium max-w-[280px] leading-relaxed" data-tauri-drag-region>
              Your intelligent AI workspace companion.
            </p>
          </div>

          <div className="w-full pt-4 space-y-4">
            {googleClientId || websiteAuthUrl ? (
              <GoogleSignInButton
                clientId={googleClientId}
                disabled={oauthBusy}
              />
            ) : (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                 <p className="text-xs text-amber-200/80 leading-relaxed">
                    Setup required: add <code className="bg-black/40 px-1 rounded text-amber-400">VITE_WEBSITE_AUTH_URL</code> (recommended) or <code className="bg-black/40 px-1 rounded text-amber-400">VITE_GOOGLE_CLIENT_ID</code>.
                  </p>
              </div>
            )}
          </div>

          {oauthMsg && (
            <div className="w-full rounded-xl border border-red-500/20 bg-red-500/5 p-3 animate-in fade-in slide-in-from-top-2">
              <p className="text-[11px] text-center text-red-400 font-medium">
                {oauthMsg}
              </p>
            </div>
          )}
          
          <p className="text-[10px] text-zinc-600 font-medium">
            By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};
