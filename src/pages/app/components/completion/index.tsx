import { useMemo } from "react";
import { useCompletion } from "@/hooks";
import { Screenshot } from "./Screenshot";
import { ScreenshotToggle } from "./ScreenshotToggle";
import { Files } from "./Files";
import { Input } from "./Input";
import { ResponsePanel } from "./ResponsePanel";
import {
  formatShortcutKeyForDisplay,
  getShortcutsConfig,
} from "@/lib/storage";

function buildShortcutTipsLine(): string {
  const cfg = getShortcutsConfig();
  const parts: string[] = [];
  const add = (label: string, actionId: string) => {
    const b = cfg.bindings[actionId];
    if (b?.enabled && b.key?.trim()) {
      parts.push(`${label}: ${formatShortcutKeyForDisplay(b.key)}`);
    }
  };
  add("Hide/show", "toggle_window");
  add("Clear chat", "clear_chat");
  add("Screen ask", "focus_input");
  add("Screenshot", "screenshot");
  add("Dashboard", "toggle_dashboard");
  return parts.join(" · ");
}

export const Completion = ({
  isHidden,
  isChatPanelExpanded,
}: {
  isHidden: boolean;
  isChatPanelExpanded: boolean;
}) => {
  const completion = useCompletion(isChatPanelExpanded);
  const shortcutTips = useMemo(() => buildShortcutTipsLine(), []);

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Input row */}
      <div className="w-full flex flex-row gap-2 items-center">
        <Input
          {...completion}
          isHidden={isHidden}
          isChatPanelExpanded={isChatPanelExpanded}
        />
        <ScreenshotToggle
          screenshotConfiguration={completion.screenshotConfiguration}
          onScreenshotsEnabledChange={completion.onScreenshotsEnabledChange}
          isHidden={isHidden}
        />
        <Screenshot
          input={completion.input}
          isLoading={completion.isLoading}
          submit={completion.submit}
          screenshotConfiguration={completion.screenshotConfiguration}
        />
        <Files {...completion} isChatPanelExpanded={isChatPanelExpanded} />
      </div>

      {/* Response panel — renders inline below input when there's content */}
      {completion.isPopoverOpen && isChatPanelExpanded && (
        <ResponsePanel {...completion} />
      )}

      {/* Shortcut Tips - Only visible when a conversation is active */}
      {shortcutTips && completion.isPopoverOpen && isChatPanelExpanded && (
        <div className="px-1 pt-1 opacity-60">
          <p className="text-[9px] text-zinc-500 font-medium leading-none select-none">
            <span className="font-bold">Shortcuts:</span> {shortcutTips}
          </p>
        </div>
      )}
    </div>
  );
};
