import { Message } from "@/types";
import { fetchManagedAIResponse } from "./managed-ai";



export async function* fetchAIResponse(params: {
  provider?: any;
  selectedProvider?: any;
  allAiProviders?: any[];
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  try {
    const {
      systemPrompt,
      history = [],
      userMessage,
      imagesBase64 = [],
      signal,
      selectedProvider,
      allAiProviders,
    } = params as any;

    if (signal?.aborted) return;

    // Pass everything to managed AI which will now handle custom providers too
    yield* fetchManagedAIResponse({
      systemPrompt, // Pass the raw system prompt, managed-ai will enhance it
      userMessage,
      imagesBase64,
      history,
      signal,
      selectedProvider,
      allAiProviders,
    });
  } catch (error) {
    throw new Error(
      `Error in fetchAIResponse: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
