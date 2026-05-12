import { Switch } from "@/components";
import { UseCompletionReturn } from "@/types";
import { cn } from "@/lib/utils";

/** Inline toggle: when off, messages send without auto-attaching a screen capture */
export const ScreenshotToggle = ({
  screenshotConfiguration,
  onScreenshotsEnabledChange,
  isHidden,
}: Pick<
  UseCompletionReturn,
  "screenshotConfiguration" | "onScreenshotsEnabledChange"
> & {
  isHidden: boolean;
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-500/25 bg-black/30 px-2 py-1",
        isHidden && "opacity-50 pointer-events-none"
      )}
      title="Attach screen capture with each message (when on)"
    >
      <Switch
        checked={screenshotConfiguration.enabled}
        onCheckedChange={onScreenshotsEnabledChange}
        disabled={isHidden}
        className="data-[state=checked]:bg-emerald-500 scale-75 origin-center"
      />
      <span className="text-[10px] font-medium text-emerald-400/90 whitespace-nowrap select-none">
        Screen
      </span>
    </div>
  );
};
