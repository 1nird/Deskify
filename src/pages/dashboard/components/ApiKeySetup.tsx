import { useState, useEffect } from "react";
import { KeyIcon, TrashIcon, CheckCircle2Icon, ChevronDownIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { AI_PROVIDERS } from "@/config";
import {
  Button,
  Header,
  Input,
} from "@/components";
import curl2Json from "@bany/curl-to-json";

const PROVIDER_ICONS: Record<string, string> = {
  openai: "🤖",
  claude: "🔮",
  gemini: "✨",
  grok: "⚡",
  mistral: "🌪️",
  groq: "🚀",
  perplexity: "🔍",
  openrouter: "🌐",
  ollama: "🦙",
};

export const ApiKeySetup = () => {
  const { selectedAIProvider, onSetSelectedAIProvider } = useApp();

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState(
    selectedAIProvider.provider || ""
  );
  const [saved, setSaved] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);

  // On mount, load saved values from context
  useEffect(() => {
    if (selectedAIProvider.provider) {
      setSelectedProviderId(selectedAIProvider.provider);
      setApiKey(selectedAIProvider.variables?.api_key || "");
      setModel(selectedAIProvider.variables?.model || "");
    }
  }, []);

  const selectedProvider = AI_PROVIDERS.find((p) => p.id === selectedProviderId);

  const handleProviderChange = (providerId: string) => {
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    setSelectedProviderId(providerId);
    setModel(provider?.defaultModel || "");
    setApiKey("");
    setSaved(false);
    setProviderOpen(false);
  };

  const handleSave = () => {
    if (!selectedProviderId || !apiKey.trim()) return;

    onSetSelectedAIProvider({
      provider: selectedProviderId,
      variables: {
        api_key: apiKey.trim(),
        model: model.trim() || selectedProvider?.defaultModel || "",
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => {
    onSetSelectedAIProvider({ provider: "", variables: {} });
    setApiKey("");
    setModel("");
    setSelectedProviderId("");
    setSaved(false);
  };

  const isConfigured =
    selectedAIProvider.provider && selectedAIProvider.variables?.api_key;

  // Derive endpoint from curl
  const endpointDisplay = selectedProvider
    ? (() => {
        try {
          const json = curl2Json(selectedProvider.curl);
          return (json as any)?.url || "";
        } catch {
          return "";
        }
      })()
    : "";

  return (
    <div id="api-key-setup" className="space-y-4">
      {/* Status badge */}
      {isConfigured && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
          <CheckCircle2Icon className="size-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Connected to{" "}
              {AI_PROVIDERS.find((p) => p.id === selectedAIProvider.provider)
                ?.name || selectedAIProvider.provider}
            </p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-500/60 truncate">
              Model: {selectedAIProvider.variables?.model || "default"}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 size-7 text-emerald-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            onClick={handleClear}
            title="Disconnect"
          >
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Provider selector */}
      <div className="space-y-1.5">
        <Header
          title="AI Provider"
          description="Select the provider you want to use for AI responses."
        />
        <div className="relative">
          <button
            onClick={() => setProviderOpen(!providerOpen)}
            className="w-full h-11 flex items-center justify-between gap-2 px-3 rounded-xl border border-input bg-background hover:border-primary/50 transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <span>{PROVIDER_ICONS[selectedProviderId] || "🔌"}</span>
              <span className="font-medium">
                {selectedProvider?.name || "Choose a provider…"}
              </span>
            </span>
            <ChevronDownIcon
              className={`size-4 text-muted-foreground transition-transform ${
                providerOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {providerOpen && (
            <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="p-1 max-h-64 overflow-y-auto">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors text-left ${
                      selectedProviderId === p.id
                        ? "bg-primary/10 text-primary font-semibold"
                        : ""
                    }`}
                  >
                    <span className="text-base">{PROVIDER_ICONS[p.id] || "🔌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Default: {p.defaultModel}
                      </p>
                    </div>
                    {selectedProviderId === p.id && (
                      <CheckCircle2Icon className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {endpointDisplay && (
          <p className="text-xs text-muted-foreground px-1 truncate">
            Endpoint: <span className="font-mono">{endpointDisplay}</span>
          </p>
        )}
      </div>

      {/* API Key */}
      {selectedProviderId && (
        <div className="space-y-1.5">
          <Header
            title="API Key"
            description={`Your ${selectedProvider?.name || "provider"} API key. Stored locally — never transmitted to Deskify.`}
          />
          <Input
            type="password"
            placeholder={`sk-… or your ${selectedProvider?.name} key`}
            value={apiKey}
            onChange={(e) => {
              setApiKey(typeof e === "string" ? e : e.target.value);
              setSaved(false);
            }}
            className="h-11 border border-input/60 focus:border-primary/60 transition-colors"
          />
        </div>
      )}

      {/* Model */}
      {selectedProviderId && (
        <div className="space-y-1.5">
          <Header
            title="Model"
            description="The model ID to use. Leave blank to use the provider default."
          />
          <Input
            placeholder={selectedProvider?.defaultModel || "model-id"}
            value={model}
            onChange={(e) => {
              setModel(typeof e === "string" ? e : e.target.value);
              setSaved(false);
            }}
            className="h-11 border border-input/60 focus:border-primary/60 transition-colors"
          />
        </div>
      )}

      {/* Save button */}
      {selectedProviderId && (
        <Button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className={`w-full h-11 transition-all ${
            saved
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : ""
          }`}
        >
          {saved ? (
            <span className="flex items-center gap-2">
              <CheckCircle2Icon className="size-4" />
              Saved!
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <KeyIcon className="size-4" />
              Save & Connect
            </span>
          )}
        </Button>
      )}
    </div>
  );
};
