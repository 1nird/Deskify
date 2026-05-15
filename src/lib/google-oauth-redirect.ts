const STATE_KEY = "deskify_google_oauth_state";
const VERIFIER_KEY = "deskify_google_oauth_verifier";
const REDIRECT_URI_KEY = "deskify_google_oauth_redirect_uri";

/** Generates a random string for PKCE */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  return Array.from(array, (byte) => possible.charAt(byte % possible.length)).join("");
}

/** Hashes the verifier for the challenge (SHA-256) */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Full-page OAuth redirect (Code Flow with PKCE). */
export async function buildGoogleAuthUrl(
  clientId: string,
  customRedirectUri?: string
): Promise<string> {
  const origin = window.location.origin;
  let redirectUri = customRedirectUri || import.meta.env.VITE_GOOGLE_REDIRECT_URI;

  if (!redirectUri) {
    redirectUri = origin.includes("tauri.localhost")
      ? "http://localhost:1420/"
      : `${origin}/`;
  }

  const state = crypto.randomUUID();
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleAuthResult {
  code: string;
  verifier: string;
  redirectUri: string;
  error?: string;
  errorDescription?: string;
}

export function parseGoogleAuthParams(): GoogleAuthResult | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");

  if (oauthError) {
    return {
      code: "",
      verifier: "",
      redirectUri: "",
      error: oauthError,
      errorDescription: params.get("error_description") ?? undefined,
    };
  }

  if (!code) return null;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);
  
  // Clean up
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);

  if (expectedState && state && state !== expectedState) {
    console.warn("Google OAuth state mismatch.");
    return null;
  }

  return { 
    code, 
    verifier: verifier || "", 
    redirectUri: redirectUri || "" 
  };
}

export function clearOAuthFragmentFromUrl(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", pathname + (search || ""));
}
