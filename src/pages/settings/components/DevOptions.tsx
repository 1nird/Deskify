import { useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { useApp as useAppHook } from "@/hooks";
import { Header, Label, Button } from "@/components";

export const DevOptions = () => {
  const { checkForUpdate } = useAppHook();
  const [status, setStatus] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleCheckUpdate = async () => {
    setStatus("checking");
    setMessage("Checking for updates...");
    
    try {
      const update = await checkForUpdate();
      
      if (update) {
        setStatus("success");
        setMessage(`Update v${update.version} found! Install it from the dashboard or restart the app.`);
      } else {
        setStatus("success");
        setMessage("You're on the latest version.");
      }
      
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 4000);
    } catch (err) {
      console.error(err);
      setStatus("error");
      const errorDetail = err instanceof Error ? err.message : "Unknown error";
      setMessage(`Update check failed: ${errorDetail}. Check your connection and try again.`);
      
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    }
  };

  return (
    <div id="dev-options" className="space-y-2 mt-8 border-t border-zinc-800 pt-6">
      <Header
        title="Developer Options"
        description="Tools and features specifically for developers"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">Test Tauri Updater</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Manually trigger an update check. This bypasses the app launch check.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={handleCheckUpdate}
            disabled={status === "checking"}
            className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[140px]"
          >
            {status === "checking" ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : status === "success" ? (
              <CheckCircle className="w-4 h-4 mr-2" />
            ) : status === "error" ? (
              <AlertCircle className="w-4 h-4 mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Check Now
          </Button>
          {message && (
            <span className={`text-[11px] ${status === "error" ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

