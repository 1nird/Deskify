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

const GOOGLE_API_KEY = "AIzaSyDTQrsnOv8F3gi5DyrV0_mvr04PncMlM70";
const TARGET_MODEL = "gemini-2.5-flash-lite";
const GOOGLE_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const RESPONSE_CONTENT_PATH = "choices[0].delta.content";

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

interface ManagedRequestParams {
  systemPrompt?: string;
  userMessage: string;
  history?: Message[];
  imagesBase64?: string[];
  signal?: AbortSignal;
  selectedProvider?: any;
  allAiProviders?: any[];
}

async function tryRequest(
  model: string,
  apiKey: string,
  body: object,
  signal?: AbortSignal
): Promise<Response> {
  const fetchFn = tauriFetch as unknown as typeof fetch;
  const response = await fetchFn(GOOGLE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, model, stream: true }),
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

  const enhancedPrompt = buildEnhancedSystemPrompt(systemPrompt);

  const messages: any[] = [{ role: "system", content: enhancedPrompt }];

  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const userContentParts: any[] = [{ type: "text", text: userMessage }];
  for (const img of imagesBase64) {
    userContentParts.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${img}` },
    });
  }
  messages.push({
    role: "user",
    content: imagesBase64.length > 0 ? userContentParts : userMessage,
  });

  const baseBody = { messages, max_tokens: 1024, temperature: 0.1, top_p: 0.9 };
  let lastError: Error | null = null;

  if (signal?.aborted) return;

  let response: Response;
  try {
    response = await tryRequest(TARGET_MODEL, GOOGLE_API_KEY, baseBody, signal);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    yield `AI Error: Failed to connect to Google API. ${lastError.message}`;
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
    lastError = streamErr instanceof Error ? streamErr : new Error(String(streamErr));
    yield `AI Error: Stream error. ${lastError.message}`;
    return;
  }

  if (!gotContent) {
    yield "AI Error: Empty response from model";
  }
}
