import { Sidebar, Button } from "@/components";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";
import { invoke } from "@tauri-apps/api/core";
import { XIcon } from "lucide-react";

export const DashboardLayout = () => {
  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout />;
      }}
      resetKeys={["dashboard-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div className="relative flex h-screen w-screen overflow-hidden bg-background">
        {/* Draggable region */}
        <div
          className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
          data-tauri-drag-region={true}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-[60] size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title="Close dashboard"
          onClick={() => void invoke("close_dashboard")}
        >
          <XIcon className="size-4" />
        </Button>

        {/* Sidebar */}
        <Sidebar />
        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden px-8">
          <Outlet />
        </main>
      </div>
    </ErrorBoundary>
  );
};
