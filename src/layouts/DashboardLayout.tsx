import { Sidebar, Button } from "@/components";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";
import { invoke } from "@tauri-apps/api/core";
import { XIcon, Minus, Square } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const win = getCurrentWebviewWindow();

export const DashboardLayout = () => {
  return (
    <ErrorBoundary
      fallbackRender={() => <ErrorLayout />}
      resetKeys={["dashboard-error"]}
      onReset={() => console.log("Reset")}
    >
      {/* Outer: pass-through; inner: actual UI hitbox (rectangular; rounded look is visual only) */}
      <div className="flex h-screen w-screen items-center justify-center bg-transparent p-3 pointer-events-none">
        <div className="relative flex h-full w-full max-h-full max-w-full flex-col overflow-hidden rounded-xl border-0 bg-background pointer-events-auto">

          <div
            className="absolute left-64 right-32 top-0 z-[70] h-10 select-none"
            data-tauri-drag-region
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />

          {/* Window control buttons */}
          <div className="absolute right-2 top-2 z-[60] flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
              title="Minimise"
              onClick={async () => {
                try {
                  await win.minimize();
                } catch (e) {
                  console.error("Failed to minimize:", e);
                }
              }}
            >
              <Minus className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
              title="Toggle fullscreen / maximise"
              onClick={async () => {
                try {
                  if (await win.isFullscreen()) {
                    await win.setFullscreen(false);
                    return;
                  }
                  // Undecorated windows on Windows often report isMaximized() incorrectly; use OS toggle.
                  await win.toggleMaximize();
                } catch (e) {
                  console.error("Failed to toggle maximize:", e);
                }
              }}
            >
              <Square className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground/60 hover:bg-destructive/20 hover:text-destructive transition-colors"
              title="Close dashboard"
              onClick={async () => {
                try {
                  await invoke("close_dashboard");
                } catch (e) {
                  console.error("Failed to close dashboard:", e);
                }
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </div>

          {/* App body */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-hidden px-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
