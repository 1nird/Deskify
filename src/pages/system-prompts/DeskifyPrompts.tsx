import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Header,
  Empty,
} from "@/components";
import {
  CheckCircle2,
  Sparkles,
  BotIcon,
  ClockIcon,
  ZapIcon,
} from "lucide-react";
import { useApp } from "@/contexts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS, AUTO_SYSTEM_PROMPT } from "@/config";
import moment from "moment";

const AUTO_PROMPT: DeskifyPrompt = {
  title: "Auto",
  prompt: AUTO_SYSTEM_PROMPT,
  modelId: "auto",
  modelName: "Short & concise · screen-aware",
};

const FALLBACK_PROMPTS: DeskifyPrompt[] = [
  {
    title: "Developer Assistant",
    prompt: "You are an expert developer assistant. Provide concise, accurate code snippets and technical explanations. Always consider the provided screen context.",
    modelId: "dev",
    modelName: "Developer Mode",
  },
  {
    title: "Writing Assistant",
    prompt: "You are a professional writing assistant. Help the user draft, edit, and improve their text. Focus on clarity, tone, and grammar. Consider the text visible on their screen.",
    modelId: "writer",
    modelName: "Writer Mode",
  },
  {
    title: "Math Solver",
    prompt: "You are an expert math solver. Provide step-by-step solutions to mathematical problems visible on the screen.",
    modelId: "math",
    modelName: "Math Mode",
  }
];

interface DeskifyPrompt {
  title: string;
  prompt: string;
  modelId: string;
  modelName: string;
}

interface DeskifyPromptsResponse {
  prompts: DeskifyPrompt[];
  total: number;
  last_updated?: string;
}

interface Model {
  provider: string;
  name: string;
  id: string;
  model: string;
  description: string;
  modality: string;
  isAvailable: boolean;
}

const SELECTED_DESKIFY_MODEL_STORAGE_KEY = "selected_deskify_model";
const SELECTED_DESKIFY_PROMPT_STORAGE_KEY = "selected_deskify_prompt";

export const DeskifyPrompts = () => {
  const {
    setSystemPrompt,
    setSupportsImages,
  } = useApp();
  const [prompts, setPrompts] = useState<DeskifyPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedDeskifyPrompt, setSelectedDeskifyPrompt] =
    useState<DeskifyPrompt | null>(() => {
      // Load selected prompt from local storage on initial render
      const stored = safeLocalStorage.getItem(
        SELECTED_DESKIFY_PROMPT_STORAGE_KEY
      );
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
      return null;
    });
  const [models, setModels] = useState<Model[]>([]);
  const fetchInitiated = useRef(false);

  useEffect(() => {
    if (!fetchInitiated.current) {
      fetchInitiated.current = true;
      fetchDeskifyPrompts();
      fetchModels();
    }
  }, []);

  // Watch for changes in user's selected prompt and clear Deskify selection if needed
  useEffect(() => {
    const checkUserPromptSelection = () => {
      const userSelectedPromptId = safeLocalStorage.getItem(
        STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID
      );
      // If user has selected one of their own prompts, clear Deskify prompt selection
      if (userSelectedPromptId) {
        setSelectedDeskifyPrompt(null);
      }
    };

    // Check on mount
    checkUserPromptSelection();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID) {
        checkUserPromptSelection();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const fetchDeskifyPrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await invoke<DeskifyPromptsResponse>("fetch_prompts");
      setPrompts(response.prompts.length > 0 ? response.prompts : FALLBACK_PROMPTS);
      if (response.last_updated) {
        setLastUpdated(response.last_updated);
      }
    } catch (err) {
      console.error("Failed to fetch Deskify prompts:", err);
      setPrompts(FALLBACK_PROMPTS);
      setError(
        typeof err === "string" ? err : "Failed to fetch Deskify prompts"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const fetchedModels = await invoke<Model[]>("fetch_models");
      setModels(fetchedModels);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  const handleSelectDeskifyPrompt = async (prompt: DeskifyPrompt) => {

    try {
      // Set the system prompt
      setSystemPrompt(prompt.prompt);
      setSelectedDeskifyPrompt(prompt);

      // Clear the user's selected prompt ID from local storage
      // This ensures the user prompt cards don't show as selected
      safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);

      // Save the system prompt to local storage
      safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, prompt.prompt);

      // Save the selected Deskify prompt to local storage for persistence
      safeLocalStorage.setItem(
        SELECTED_DESKIFY_PROMPT_STORAGE_KEY,
        JSON.stringify(prompt)
      );

      // Find the model by modelId and select it
      const matchingModel = models.find(
        (model) => model.model === prompt.modelId || model.id === prompt.modelId
      );

      if (matchingModel) {
        // Update supportsImages based on model modality
        const hasImageSupport =
          matchingModel.modality?.includes("image") ?? false;
        setSupportsImages(hasImageSupport);

        await invoke("secure_storage_save", {
          items: [
            {
              key: SELECTED_DESKIFY_MODEL_STORAGE_KEY,
              value: JSON.stringify(matchingModel),
            },
          ],
        });
      }
    } catch (error) {
      console.error("Failed to select Deskify prompt:", error);
    }
  };

  const handleCardClick = (prompt: DeskifyPrompt) => {
    handleSelectDeskifyPrompt(prompt);
  };

  const isPromptSelected = (prompt: DeskifyPrompt) => {
    return (
      selectedDeskifyPrompt?.title === prompt.title &&
      selectedDeskifyPrompt?.modelId === prompt.modelId
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        <Header
          title="Deskify Default Prompts"
          description="Pre-configured prompts with optimal model selection"
        />
        <Empty
          isLoading={true}
          icon={Sparkles}
          title="Loading prompts..."
          description="Fetching Deskify default prompts"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 mt-6">
        <div className="flex items-start justify-between gap-3 border-t border-input/50 pt-6">
          <div className="flex flex-col gap-1 w-full">
            <Header
              title="Deskify Default Prompts"
              description="Pre-configured prompts. Selecting a prompt will set the AI's behavior."
            />
          </div>
        </div>
        <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 pb-4`}>
          {(() => {
            const isAutoSelected = isPromptSelected(AUTO_PROMPT);
            return (
              <Card
                key="auto-prompt"
                className={`relative border lg:border-2 shadow-none p-4 pb-10 gap-0 group transition-all hover:shadow-sm cursor-pointer ${
                  isAutoSelected
                    ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                    : "!bg-black/5 dark:!bg-white/5 border-transparent"
                }`}
                onClick={() => handleCardClick(AUTO_PROMPT)}
              >
                {isAutoSelected && (
                  <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
                )}
                <CardHeader className="p-0 pb-0 select-none">
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <ZapIcon className="size-4 text-emerald-500" />
                        <CardTitle className="text-base line-clamp-1 flex-1 pr-3">
                          Auto
                        </CardTitle>
                      </div>
                      <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                        Short, concise responses. Automatically sends a screenshot with every message for full screen context.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <div className="absolute bottom-2 left-4 w-full flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-emerald-500 select-none">
                    <ZapIcon className="size-3" />
                    <span>Screen-aware · Built-in</span>
                  </div>
                </div>
              </Card>
            );
          })()}
          
          {/* Fetched/Fallback API prompts */}
          {prompts.map((prompt, index) => {
            const isSelected = isPromptSelected(prompt);
            return (
              <Card
                key={`${prompt.title}-${index}`}
                className={`relative border lg:border-2 shadow-none p-4 pb-10 gap-0 group transition-all hover:shadow-sm cursor-pointer ${
                  isSelected
                    ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                    : "!bg-black/5 dark:!bg-white/5 border-transparent"
                }`}
                onClick={() => handleCardClick(prompt)}
              >
                {isSelected && (
                  <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
                )}
                <CardHeader className="p-0 pb-0 select-none">
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-[10px] text-base line-clamp-1 flex-1 pr-3">
                          {prompt.title}
                        </CardTitle>
                      </div>
                      <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                        {prompt.prompt}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <div className="absolute bottom-2 left-4 w-full flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-muted-foreground select-none">
                    <BotIcon className="size-3" />
                    <span className="line-clamp-1 max-w-[180px]">
                      {prompt.modelName}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-start justify-between gap-3 border-t border-input/50 pt-6">
        <div className="flex items-start gap-3 w-full">
          <div className="flex flex-col gap-1 w-full">
            <Header
              title="Deskify Default Prompts"
              description="Pre-configured prompts. Selecting a prompt will set the AI's behavior."
            />
            {lastUpdated && (
              <div className="flex justify-end items-center gap-1 text-[10px] text-muted-foreground">
                <ClockIcon className="size-2" />
                <span>Last updated: {moment(lastUpdated).fromNow()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 pb-4`}
      >
        {/* Always-visible Auto prompt */}
        {(() => {
          const isAutoSelected = isPromptSelected(AUTO_PROMPT);
          return (
            <Card
              key="auto-prompt"
              className={`relative border lg:border-2 shadow-none p-4 pb-10 gap-0 group transition-all hover:shadow-sm cursor-pointer ${
                isAutoSelected
                  ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                  : "!bg-black/5 dark:!bg-white/5 border-transparent"
              }`}
              onClick={() => handleCardClick(AUTO_PROMPT)}
            >
              {isAutoSelected && (
                <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
              )}
              <CardHeader className="p-0 pb-0 select-none">
                <div className="flex items-start justify-between gap-2 relative">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ZapIcon className="size-4 text-emerald-500" />
                      <CardTitle className="text-base line-clamp-1 flex-1 pr-3">
                        Auto
                      </CardTitle>
                    </div>
                    <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                      Short, concise responses. Automatically sends a screenshot with every message for full screen context.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <div className="absolute bottom-2 left-4 w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-emerald-500 select-none">
                  <ZapIcon className="size-3" />
                  <span>Screen-aware · Built-in</span>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Fetched API prompts */}
        {prompts.map((prompt, index) => {
          const isSelected = isPromptSelected(prompt);
          return (
            <Card
              key={`${prompt.title}-${index}`}
              className={`relative border lg:border-2 shadow-none p-4 pb-10 gap-0 group transition-all hover:shadow-sm cursor-pointer ${
                isSelected
                  ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                  : "!bg-black/5 dark:!bg-white/5 border-transparent"
              }`}
              onClick={() => handleCardClick(prompt)}
            >
              {isSelected && (
                <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
              )}
              <CardHeader className="p-0 pb-0 select-none">
                <div className="flex items-start justify-between gap-2 relative">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-[10px] text-base line-clamp-1 flex-1 pr-3">
                        {prompt.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                      {prompt.prompt}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <div className="absolute bottom-2 left-4 w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-muted-foreground select-none">
                  <BotIcon className="size-3" />
                  <span className="line-clamp-1 max-w-[180px]">
                    {prompt.modelName}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
