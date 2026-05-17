import { useState, useEffect } from "react";
import { ChevronDown, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components";
import { Button } from "@/components/ui/button";
import { safeLocalStorage } from "@/lib";
import { usePremium } from "@/components/PremiumGate";

export interface AIModel {
  id: string;
  name: string;
  plan: "free" | "student" | "developer";
}

const MODELS: AIModel[] = [
  { id: "gemini-3-flash", name: "Gemini 3 Flash", plan: "free" },
  { id: "gemini-31-medium", name: "Gemini 3.1 Medium", plan: "student" },
  { id: "gpt-54-low", name: "GPT 5.4 Low", plan: "student" },
  { id: "claude-35-haiku", name: "Claude 3.5 Haiku", plan: "student" },
  { id: "claude-sonnet-46", name: "Claude Sonnet 4.6", plan: "developer" },
  { id: "gpt-54-high", name: "GPT 5.4 High", plan: "developer" },
  { id: "kimi-k26", name: "Kimi K2.6", plan: "developer" },
  { id: "claude-opus-46-speed", name: "Claude Opus 4.6 Speed", plan: "developer" },
];

const MODEL_STORAGE_KEY = "selected_ai_model";

export const ModelSelector = () => {
  const { userPlan } = usePremium();
  const [selectedModel, setSelectedModel] = useState<AIModel>(MODELS[0]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const stored = safeLocalStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const model = MODELS.find((m) => m.id === parsed.id);
        if (model && canAccessModel(model.plan, userPlan)) {
          setSelectedModel(model);
        } else {
          setSelectedModel(MODELS[0]);
        }
      } catch (e) {
        setSelectedModel(MODELS[0]);
      }
    }
  }, [userPlan]);

  const canAccessModel = (modelPlan: string, userPlanTier: string): boolean => {
    if (modelPlan === "free") return true;
    if (modelPlan === "student") return userPlanTier === "student" || userPlanTier === "developer";
    if (modelPlan === "developer") return userPlanTier === "developer";
    return false;
  };

  const handleSelectModel = (model: AIModel) => {
    if (!canAccessModel(model.plan, userPlan)) return;

    setSelectedModel(model);
    safeLocalStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(model));
    setIsOpen(false);
  };

  // Group models by plan and filter based on user's plan
  const freeModels = MODELS.filter((m) => m.plan === "free");
  const studentModels = MODELS.filter((m) => m.plan === "student");
  const developerModels = MODELS.filter((m) => m.plan === "developer");

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-emerald-400 active:scale-95 transition-all duration-200"
          title="Select AI Model"
        >
          <span className="hidden sm:inline">{selectedModel.name}</span>
          <span className="sm:hidden">{selectedModel.name.split(" ")[0]}</span>
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" sideOffset={6} collisionPadding={10} className="w-52 rounded-2xl border border-white/10 bg-[#0d1117]/95 backdrop-blur-2xl shadow-2xl shadow-black/60 max-h-[240px] overflow-y-auto z-[100]">
        {/* Free Plan */}
        <div className="px-2 py-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Free Plan</p>
        </div>
        {freeModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleSelectModel(model)}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 w-full">
              <span className="flex-1">{model.name}</span>
              {selectedModel.id === model.id && (
                <span className="text-emerald-500 font-bold">✓</span>
              )}
            </div>
          </DropdownMenuItem>
        ))}

        {/* Student Plan */}
        <div className="px-2 py-1.5 mt-2">
          <p className="text-xs font-semibold text-muted-foreground">Student Plan</p>
        </div>
        {studentModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleSelectModel(model)}
            disabled={userPlan !== "student" && userPlan !== "developer"}
            className={userPlan === "student" || userPlan === "developer" ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}
          >
            <div className="flex items-center gap-2 w-full">
              <span className="flex-1">{model.name}</span>
              {(userPlan !== "student" && userPlan !== "developer") && <Lock className="size-3 text-muted-foreground" />}
              {selectedModel.id === model.id && (userPlan === "student" || userPlan === "developer") && (
                <span className="text-emerald-500 font-bold">✓</span>
              )}
            </div>
          </DropdownMenuItem>
        ))}

        {/* Developer Plan */}
        <div className="px-2 py-1.5 mt-2">
          <p className="text-xs font-semibold text-muted-foreground">Developer Plan</p>
        </div>
        {developerModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleSelectModel(model)}
            disabled={userPlan !== "developer"}
            className={userPlan === "developer" ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}
          >
            <div className="flex items-center gap-2 w-full">
              <span className="flex-1">{model.name}</span>
              {userPlan !== "developer" && <Lock className="size-3 text-muted-foreground" />}
              {selectedModel.id === model.id && userPlan === "developer" && (
                <span className="text-emerald-500 font-bold">✓</span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const useSelectedModel = () => {
  const { userPlan } = usePremium();
  const [selectedModel, setSelectedModel] = useState<AIModel>(MODELS[0]);

  useEffect(() => {
    const stored = safeLocalStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const model = MODELS.find((m) => m.id === parsed.id);
        if (model && canAccessModel(model.plan, userPlan)) {
          setSelectedModel(model);
        } else {
          setSelectedModel(MODELS[0]);
        }
      } catch (e) {
        setSelectedModel(MODELS[0]);
      }
    }
  }, [userPlan]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MODEL_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const model = MODELS.find((m) => m.id === parsed.id);
          if (model && canAccessModel(model.plan, userPlan)) {
            setSelectedModel(model);
          } else {
            setSelectedModel(MODELS[0]);
          }
        } catch (e) {
          setSelectedModel(MODELS[0]);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [userPlan]);

  return selectedModel;
};

const canAccessModel = (modelPlan: string, userPlanTier: string): boolean => {
  if (modelPlan === "free") return true;
  if (modelPlan === "student") return userPlanTier === "student" || userPlanTier === "developer";
  if (modelPlan === "developer") return userPlanTier === "developer";
  return false;
};
