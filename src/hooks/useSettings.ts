import { useEffect, useState } from "react";
import { useApp } from "@/contexts";
import {
  extractVariables,
  safeLocalStorage,
  deleteAllConversations,
} from "@/lib";
import { STORAGE_KEYS } from "@/config";

export const useSettings = () => {
  const {
    screenshotConfiguration,
    setScreenshotConfiguration,
    allAiProviders,
    selectedAIProvider,
    onSetSelectedAIProvider,
  } = useApp();
  const [variables, setVariables] = useState<{ key: string; value: string }[]>(
    []
  );


  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const handleScreenshotModeChange = (value: "auto" | "manual") => {
    const newConfig = { ...screenshotConfiguration, mode: value };
    setScreenshotConfiguration(newConfig);
    safeLocalStorage.setItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG,
      JSON.stringify(newConfig)
    );
  };

  const handleScreenshotPromptChange = (value: string) => {
    const newConfig = { ...screenshotConfiguration, autoPrompt: value };
    setScreenshotConfiguration(newConfig);
    safeLocalStorage.setItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG,
      JSON.stringify(newConfig)
    );
  };

  const handleScreenshotEnabledChange = (enabled: boolean) => {

    const newConfig = { ...screenshotConfiguration, enabled };
    setScreenshotConfiguration(newConfig);
    safeLocalStorage.setItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG,
      JSON.stringify(newConfig)
    );
  };

  useEffect(() => {
    if (selectedAIProvider.provider) {
      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (provider) {
        const variables = extractVariables(provider?.curl);
        setVariables(variables);
      }
    }
  }, [selectedAIProvider.provider]);



  const handleDeleteAllChatsConfirm = async () => {
    try {
      await deleteAllConversations();
      setShowDeleteConfirmDialog(false);
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
    }
  };

  return {
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotModeChange,
    handleScreenshotPromptChange,
    handleScreenshotEnabledChange,
    allAiProviders,
    selectedAIProvider,
    onSetSelectedAIProvider,
    handleDeleteAllChatsConfirm,
    showDeleteConfirmDialog,
    setShowDeleteConfirmDialog,
    variables,
  };
};
