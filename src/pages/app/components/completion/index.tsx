import { useCompletion } from "@/hooks";
import { Screenshot } from "./Screenshot";
import { ScreenshotToggle } from "./ScreenshotToggle";
import { Files } from "./Files";
import { Input } from "./Input";
import { ResponsePanel } from "./ResponsePanel";

export const Completion = ({
  isHidden,
  isChatPanelExpanded,
}: {
  isHidden: boolean;
  isChatPanelExpanded: boolean;
}) => {
  const completion = useCompletion(isChatPanelExpanded);

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
        />
        <Files {...completion} isChatPanelExpanded={isChatPanelExpanded} />
      </div>

      {/* Response panel — renders inline below input when there's content */}
      {completion.isPopoverOpen && isChatPanelExpanded && (
        <ResponsePanel {...completion} />
      )}
    </div>
  );
};
