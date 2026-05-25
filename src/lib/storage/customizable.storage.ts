import { STORAGE_KEYS } from "@/config";

export type CursorType = "invisible" | "default" | "auto";

export interface CustomizableState {
  appIcon: {
    isVisible: boolean;
  };
  alwaysOnTop: {
    isEnabled: boolean;
  };
  autostart: {
    isEnabled: boolean;
  };
  cursor: {
    type: CursorType;
  };
}

export const DEFAULT_CUSTOMIZABLE_STATE: CustomizableState = {
  appIcon: { isVisible: true },
  alwaysOnTop: { isEnabled: true },
  autostart: { isEnabled: false },
  cursor: { type: "auto" },
};

/**
 * Get customizable state from localStorage
 */
export const getCustomizableState = (): CustomizableState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE);
    if (!stored) {
      return DEFAULT_CUSTOMIZABLE_STATE;
    }

    const parsedState = JSON.parse(stored);

    return {
      appIcon: parsedState.appIcon || DEFAULT_CUSTOMIZABLE_STATE.appIcon,
      alwaysOnTop:
        parsedState.alwaysOnTop || DEFAULT_CUSTOMIZABLE_STATE.alwaysOnTop,
      autostart: parsedState.autostart || DEFAULT_CUSTOMIZABLE_STATE.autostart,
      cursor: parsedState.cursor || DEFAULT_CUSTOMIZABLE_STATE.cursor,
    };
  } catch (error) {
    console.error("Failed to get customizable state:", error);
    return DEFAULT_CUSTOMIZABLE_STATE;
  }
};

/**
 * Save customizable state to localStorage
 */
export const setCustomizableState = (state: CustomizableState): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOMIZABLE, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save customizable state:", error);
  }
};

/**
 * Update app icon visibility
 */
export const updateAppIconVisibility = (
  isVisible: boolean
): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, appIcon: { isVisible } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Update always on top state
 */
export const updateAlwaysOnTop = (isEnabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, alwaysOnTop: { isEnabled } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Update cursor type
 */
export const updateCursorType = (type: CursorType): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, cursor: { type } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Get mic silence timeout from localStorage
 */
export const getMicSilenceTimeout = (): number => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MIC_SILENCE_TIMEOUT);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed) && parsed >= 500 && parsed <= 10000) {
        return parsed;
      }
    }
    return 1800; // default 1.8s
  } catch {
    return 1800;
  }
};

/**
 * Save mic silence timeout to localStorage
 */
export const setMicSilenceTimeout = (ms: number): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.MIC_SILENCE_TIMEOUT, String(ms));
  } catch {
    /* ignore */
  }
};

/**
 * Update autostart state
 */
export const updateAutostart = (isEnabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, autostart: { isEnabled } };
  setCustomizableState(newState);
  return newState;
};
