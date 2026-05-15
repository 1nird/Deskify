import { useState } from "react";
import { Button } from "@/components";
import { buildGoogleAuthUrl } from "@/lib/google-oauth-redirect";
import { start, onUrl } from "@fabianlars/tauri-plugin-oauth";
import { openUrl } from "@tauri-apps/plugin-opener";

type Props = {
  clientId: string;
  disabled?: boolean;
};

export const GoogleSignInButton = ({ clientId, disabled }: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const startSignIn = async () => {
    setError(null);
    if (!clientId.trim()) {
      setError("Missing client ID");
      return;
    }

    setIsBusy(true);
    try {
      // 1. Listen for the redirect URL from the browser
      await onUrl((url: string) => {
        const parsedUrl = new URL(url);
        // Authorization Code flow sends params in the search (?code=...)
        // but we apply it to the app's window location so AuthGate can see it
        const params = parsedUrl.search || parsedUrl.hash;
        if (params) {
          window.location.hash = params.startsWith("#") ? params : `#${params.slice(1)}`;
          // This hash change will trigger the useEffect in AuthGate
        }
      });

      // 2. Start the local server to catch the redirect
      const port = await start();

      // 3. Build the Auth URL with the dynamic localhost redirect
      // Google Desktop Apps work best with 127.0.0.1 and NO trailing slash
      const redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = await buildGoogleAuthUrl(clientId.trim(), redirectUri);

      // 4. Open the URL in the user's default system browser
      await openUrl(authUrl);
      
      // Reset busy state so the user can try again if the browser interaction fails or is closed
      setIsBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start sign-in");
      setIsBusy(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || isBusy}
        className="relative h-14 w-full justify-center gap-3 overflow-hidden rounded-2xl border-white/10 bg-white/20 px-6 text-base font-semibold text-gray-800 transition-all hover:border-emerald-500/50 hover:bg-white/30 active:scale-[0.98] font-sans"
        onClick={startSignIn}
      >
        <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="white"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="white"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="white"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="white"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </Button>
      {error ? (
        <p className="text-center text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
};
