import { useEffect, useState } from "react";
import { Card, CustomCursor, Button, Logo, Switch } from "@/components";
import { Completion } from "./components";
import { useApp } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { ChevronDown, ChevronUp, LayoutDashboardIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { getPlatform } from "@/lib";
import { cn } from "@/lib/utils";

const App = () => {
  const { isHidden } = useApp();
  const {
    customizable,
    setCursorType,
  } = useAppContext();
  const platform = getPlatform();
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(true);

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  const toggleChatPanel = () => setIsChatPanelOpen((v) => !v);

  // Removed automatic dashboard launch on startup to prevent white screen flashes.
  // Dashboard can still be opened via the tray icon or the dashboard button in the header.

  useEffect(() => {
    const handleExpand = () => setIsChatPanelOpen(true);
    window.addEventListener("expand-chat", handleExpand);
    return () => window.removeEventListener("expand-chat", handleExpand);
  }, []);

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout isCompact />;
      }}
      resetKeys={["app-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div
        className={cn(
          "w-screen h-screen flex flex-col overflow-hidden items-center pt-2 gap-2 transition-opacity duration-200 pointer-events-none",
          isHidden && "hidden"
        )}
      >
        {/* Top bar — shrink hitbox to content; gaps pass clicks through to apps below */}
        <div
          data-tauri-drag-region
          className="pointer-events-auto self-center flex w-max max-w-[min(100%,calc(100vw-16px))] items-center gap-1.5 px-3 py-1.5 rounded-3xl border border-emerald-500/20 bg-black/20 backdrop-blur-xl shadow-lg hover:bg-black/40 hover:border-emerald-500/40 hover:shadow-emerald-500/10 transition-all duration-300 cursor-move select-none z-50 group"
        >
          <div
            className="flex items-center justify-center rounded-xl outline-none opacity-80 group-hover:opacity-100 transition-opacity"
            title="Drag to move"
          >
            <Logo size={40} interactive dragHandle />
          </div>

          <button
            type="button"
            data-tauri-drag-region={false}
            onClick={toggleChatPanel}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-tight text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 hover:border-emerald-500/60 transition-all duration-200 cursor-pointer"
          >
            {isChatPanelOpen ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {isChatPanelOpen ? "Hide" : "Show"}
          </button>

          <div className="w-px h-4 bg-emerald-500/20 mx-0.5" />

          <Button
            variant="ghost"
            size="icon"
            data-tauri-drag-region={false}
            className="cursor-pointer rounded-full size-8 text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 hover:border-emerald-500/60 transition-all duration-200"
            title="Open dashboard"
            onClick={() => void openDashboard()}
          >
            <LayoutDashboardIcon className="size-4" />
          </Button>

          <div className="w-px h-4 bg-emerald-500/20 mx-0.5" />

          <div className="flex items-center gap-2 px-1" data-tauri-drag-region={false}>
            <Switch
              checked={customizable.cursor.type === "invisible"}
              onCheckedChange={(checked: boolean) => {
                setCursorType(checked ? "invisible" : "auto");
              }}
              className="data-[state=checked]:bg-emerald-500 scale-75 origin-left"
            />
            <span className="text-[10px] font-medium text-emerald-400/80 whitespace-nowrap pr-1">
              {customizable.cursor.type === "invisible" ? "Undetect." : "Detectable"}
            </span>
          </div>
        </div>

        {/* Chat body — narrow interactive band so empty window area does not steal clicks */}
        <div
          className={cn(
            "pointer-events-auto flex w-full max-w-[min(768px,calc(100vw-16px))] justify-center px-3 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] grid will-change-[grid-template-rows]",
            isChatPanelOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-95 pointer-events-none"
          )}
        >
          <div
            className={cn(
              "w-full flex justify-center overflow-hidden",
              !isChatPanelOpen && "pointer-events-none select-none"
            )}
          >
            <Card className="pointer-events-auto w-full max-w-[calc(100%-8px)] flex flex-col gap-2 p-2 border border-emerald-500/20 hover:border-emerald-500/40 shadow-xl bg-black/40 hover:bg-black/50 backdrop-blur-2xl rounded-3xl transition-all duration-300">
              <Completion isHidden={isHidden} isChatPanelExpanded={isChatPanelOpen} />
            </Card>
          </div>
        </div>

        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
