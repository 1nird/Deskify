/**
 * Managed AI — hardcoded Google Gemini 2.5 Flash Lite.
 *
 * No fallbacks, no OpenRouter.
 */

import {
  getStreamingContent,
} from "./common.function";
import { Message } from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";

// ─── Hardcoded Config ────────────────────────────────────────────────────────

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? "";
const TARGET_MODEL = "gemini-2.5-flash-lite";
const RESPONSE_CONTENT_PATH = "candidates[0].content.parts[0].text";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEnhancedSystemPrompt(base?: string): string {
  const settings = getResponseSettings();
  const parts: string[] = [];

  if (base) {
    parts.push(base);
  }

  const lengthOpt = RESPONSE_LENGTHS.find((l) => l.id === settings.responseLength);
  if (lengthOpt?.prompt?.trim()) parts.push(lengthOpt.prompt);

  const langOpt = LANGUAGES.find((l) => l.id === settings.language);
  if (langOpt?.prompt?.trim()) parts.push(langOpt.prompt);

  // Keep formatting guidance last so it acts as a soft constraint.
  parts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return parts.join("\n\n");
}

function parseDataUrl(
  url: string
): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function normalizeMessageParts(content: Message["content"]): any[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  const parts: any[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) {
      parts.push({ text: part.text });
      continue;
    }

    if (part.type === "image_url" && part.image_url?.url) {
      const parsed = parseDataUrl(part.image_url.url);
      if (parsed) {
        parts.push({
          inline_data: {
            mime_type: parsed.mimeType,
            data: parsed.data,
          },
        });
      }
      continue;
    }

    if (part.type === "inline_data" && part.inline_data) {
      parts.push({
        inline_data: part.inline_data,
      });
    }
  }

  return parts.length > 0 ? parts : [{ text: "" }];
}

interface ManagedRequestParams {
  systemPrompt?: string;
  userMessage: string;
  history?: Message[];
  imagesBase64?: string[];
  signal?: AbortSignal;
  selectedProvider?: any;
  allAiProviders?: any[];
}

function resolveApiKeysAndModel(params: ManagedRequestParams): {
  apiKeys: string[];
  model: string;
} {
  const selected = params.selectedProvider as
    | { variables?: Record<string, string>; provider?: string }
    | undefined;
  const isGeminiSelected = selected?.provider === "gemini";
  const selectedKey = (
    selected?.variables?.API_KEY || selected?.variables?.api_key || ""
  ).trim();
  const envKey = GOOGLE_API_KEY.trim();

  const FALLBACK_KEYS = [
    "AIzaSyCKDocS2OfdLDcp0wDQ74fmBJ0xDtPXd3E",
    "AIzaSyBMr0XF80AsC-Flzvny03SqdQijNBUv6KQ"
  ];

  const apiKeys = (
    isGeminiSelected
      ? [selectedKey, envKey, ...FALLBACK_KEYS]
      : [envKey, ...FALLBACK_KEYS]
  ).filter((key, index, arr) => key.length > 0 && arr.indexOf(key) === index);

  const modelRaw = isGeminiSelected
    ? selected?.variables?.MODEL || selected?.variables?.model || TARGET_MODEL
    : TARGET_MODEL;
  const model = String(modelRaw || TARGET_MODEL).trim() || TARGET_MODEL;

  return { apiKeys, model };
}

async function tryRequest(
  model: string,
  apiKey: string,
  body: object,
  signal?: AbortSignal
): Promise<Response> {
  const fetchFn = tauriFetch as unknown as typeof fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`);
  }

  return response;
}

export async function* fetchManagedAIResponse(
  params: ManagedRequestParams
): AsyncIterable<string> {
  const {
    systemPrompt,
    userMessage,
    history = [],
    imagesBase64 = [],
    signal,
  } = params;

  if (signal?.aborted) return;

  const { apiKeys, model } = resolveApiKeysAndModel(params);
  if (apiKeys.length === 0) {
    yield "AI Error: Missing Gemini API key. Set a Gemini key in Settings > AI Provider (Gemini) or VITE_GOOGLE_API_KEY.";
    return;
  }

  const enhancedPrompt = buildEnhancedSystemPrompt(systemPrompt);

  const contents: any[] = [];

  // History mapping (Native Gemini role names)
  for (const msg of history) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: normalizeMessageParts(msg.content),
    });
  }

  // Current user content
  const userParts: any[] = [{ text: userMessage }];
  for (const img of imagesBase64) {
    userParts.push({
      inline_data: {
        mime_type: "image/png",
        data: img
      }
    });
  }
  contents.push({
    role: "user",
    parts: userParts
  });

  const baseBody = {
    contents,
    system_instruction: {
      parts: [{ text: enhancedPrompt }]
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
    ],
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  };
  let lastError: Error | null = null;

  if (signal?.aborted) return;

  let response: Response | null = null;
  for (const key of apiKeys) {
    try {
      response = await tryRequest(model, key, baseBody, signal);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  if (!response) {
    if (
      lastError &&
      (lastError.message.includes("API_KEY_INVALID") ||
        /api key expired/i.test(lastError.message))
    ) {
      yield "Please check your AI API key in Settings. It appears to be invalid or expired.";
      return;
    }
    
    if (lastError && (lastError.message.includes("429") || /quota/i.test(lastError.message))) {
      yield "We are currently experiencing high traffic or rate limits. Please try again in a moment.";
      return;
    }

    yield "I'm having trouble connecting to the AI service right now. Please check your network or try again later.";
    return;
  }

  if (!response.body) {
    yield "AI Error: Response body missing";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotContent = false;

  try {
    while (true) {
      if (signal?.aborted) { reader.cancel(); return; }

      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (readErr) {
        if (signal?.aborted) return;
        throw readErr;
      }

      const { done, value } = readResult;
      if (done) break;
      if (signal?.aborted) { reader.cancel(); return; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const trimmed = line.substring(5).trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        try {
          const parsed = JSON.parse(trimmed);
          const delta = getStreamingContent(parsed, RESPONSE_CONTENT_PATH);
          if (delta !== null) {
            gotContent = true;
            yield delta;
          }
        } catch {
          // Ignore partial JSON
        }
      }
    }
  } catch (streamErr) {
    if (signal?.aborted) return;
    yield "The connection was interrupted while generating a response. Please try again.";
    return;
  }

  if (!gotContent) {
    yield "The AI did not provide a response. Please try again.";
  }
}
