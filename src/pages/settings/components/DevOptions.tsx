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
      if (checkForUpdate) {
        await checkForUpdate();
      }
      
      setTimeout(() => {
        setStatus("success");
        setMessage("Check complete. If an update exists, it will appear in the dashboard.");
        
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 3000);
      }, 500);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Error checking for updates.");
      
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
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

