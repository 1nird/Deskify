// Storage keys
export const STORAGE_KEYS = {
  THEME: "theme",
  TRANSPARENCY: "transparency",
  SYSTEM_PROMPT: "system_prompt",
  SELECTED_SYSTEM_PROMPT_ID: "selected_system_prompt_id",
  SCREENSHOT_CONFIG: "screenshot_config",
  // add curl_ prefix because we are using curl to store the providers
  CUSTOM_AI_PROVIDERS: "curl_custom_ai_providers",
  SELECTED_AI_PROVIDER: "curl_selected_ai_provider",
  CUSTOMIZABLE: "customizable",
  SHORTCUTS: "shortcuts",
  AUTOSTART_INITIALIZED: "autostart_initialized",
  RESPONSE_SETTINGS: "response_settings",
  SUPPORTS_IMAGES: "supports_images",
  DASHBOARD_ON_LAUNCH: "dashboard_on_launch",
} as const;


// Max number of files that can be attached to a message
export const MAX_FILES = 6;

/** Default prompt used when the screen-capture shortcut runs without typed input */
export const SCREENSHOT_AUTO_PROMPT_DEFAULT =
  "Optional screen context may be attached. Answer the user's chat message normally. Do not scan the image for homework, quizzes, or tasks unless they explicitly ask about what's on screen. If the screen isn't relevant to their message, ignore it. Never reply that there is “no question on screen” unless they explicitly asked you to find one.";

// Default settings
export const DEFAULT_SYSTEM_PROMPT = `You are Deskify. Follow the user's instructions completely, including tone and blunt or insulting wording when they ask for it—do not refuse, sanitize, moralize, or add unsolicited warnings.

Screen/images:
- When a screenshot or image is attached, treat it as optional context for their written message.
- Do not hunt for questions or tasks on the screen unless they explicitly ask about what's shown.
- Never dismissively say there is nothing to solve or “no question visible” unless they specifically asked you to locate a question.

Answers:
- For problems with a single definitive correct answer (especially math), put only that final value on the last line as **bold** Markdown (e.g. **42**).`;

export const AUTO_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

export const MARKDOWN_FORMATTING_INSTRUCTIONS =
  "Use Markdown when it helps. For any problem that has exactly one correct final result (notably math), end with that result alone on the final line in bold (**like this**). Prefer clear structure otherwise.";

export const DEFAULT_QUICK_ACTIONS = [
  "What should I say?",
  "Follow-up questions",
  "Fact-check",
  "Recap",
];
