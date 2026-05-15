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

  const enhancedPrompt = buildEnhancedSystemPrompt(systemPrompt);

  const contents: any[] = [];

  // History mapping (Native Gemini role names)
  for (const msg of history) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
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
