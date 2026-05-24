import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "./storage/helper";

export const getActiveSystemPrompt = (): string => {
  const stored = safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT);
  if (stored && stored.trim()) {
    return stored;
  }
  return DEFAULT_SYSTEM_PROMPT;
};
