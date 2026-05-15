const STATE_KEY = "deskify_google_oauth_state";
const VERIFIER_KEY = "deskify_google_oauth_verifier";
const REDIRECT_URI_KEY = "deskify_google_oauth_redirect_uri";

export interface DesktopAuthProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  isPaid?: boolean;
  plan?: string;
  source?: "google" | "website";
}

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

function parseBoolean(value: string | null): boolean | undefined {
  if (!value) return undefined;
  if (value.toLowerCase() === "true" || value === "1") return true;
  if (value.toLowerCase() === "false" || value === "0") return false;
  return undefined;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;
  try {
    const payloadRaw = decodeBase64Url(segments[1]);
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}

export function parseDesktopAuthProfile(): DesktopAuthProfile | null {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.slice(1)
  );

  const packed =
    params.get("desktop_auth") ||
    params.get("auth_profile") ||
    params.get("session");

  if (packed) {
    try {
      const decoded = decodeBase64Url(decodeURIComponent(packed));
      const parsed = JSON.parse(decoded) as Partial<DesktopAuthProfile>;
      if (!parsed.email) return null;
      return {
        sub: String(parsed.sub ?? parsed.email),
        email: String(parsed.email),
        name: parsed.name ? String(parsed.name) : undefined,
        picture: parsed.picture ? String(parsed.picture) : undefined,
        plan: parsed.plan ? String(parsed.plan) : undefined,
        isPaid: parsed.isPaid === true,
        source: parsed.source === "google" ? "google" : "website",
      };
    } catch {
      return null;
    }
  }

  const email = params.get("email");
  if (email) {
    return {
      sub: params.get("sub") || email,
      email,
      name: params.get("name") || undefined,
      picture: params.get("picture") || undefined,
      plan: params.get("plan") || undefined,
      isPaid: parseBoolean(params.get("is_paid")),
      source: "website",
    };
  }

  const accessToken = params.get("access_token");
  if (accessToken) {
    const jwt = parseJwtPayload(accessToken);
    const jwtEmail = typeof jwt?.email === "string" ? jwt.email : "";
    if (!jwtEmail) return null;

    const paidFromClaim =
      parseBoolean(
        typeof jwt?.is_paid === "string" ? jwt.is_paid : null
      ) ??
      (typeof jwt?.is_paid === "boolean" ? jwt.is_paid : undefined) ??
      parseBoolean(typeof jwt?.paid === "string" ? jwt.paid : null) ??
      (typeof jwt?.paid === "boolean" ? jwt.paid : undefined);

    return {
      sub:
        (typeof jwt?.sub === "string" ? jwt.sub : "") ||
        params.get("sub") ||
        jwtEmail,
      email: jwtEmail,
      name:
        (typeof jwt?.name === "string" ? jwt.name : "") ||
        (typeof jwt?.user_name === "string" ? jwt.user_name : "") ||
        undefined,
      picture: typeof jwt?.picture === "string" ? jwt.picture : undefined,
      plan:
        (typeof jwt?.plan === "string" ? jwt.plan : "") ||
        (typeof jwt?.subscription_tier === "string"
          ? jwt.subscription_tier
          : "") ||
        undefined,
      isPaid: paidFromClaim,
      source: "website",
    };
  }

  return null;
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
