import { PageLayout } from "@/layouts";
import { Button, Switch } from "@/components";
import { useApp } from "@/contexts";
import { invoke } from "@tauri-apps/api/core";
import { PlayIcon, EyeIcon, EyeOffIcon, SparklesIcon } from "lucide-react";

const Dashboard = () => {
  const { customizable, setCursorType } = useApp();

  const handleStart = () => {
    localStorage.setItem("deskify-new-conversation", String(Date.now()));
    window.dispatchEvent(new CustomEvent("newConversation"));
    invoke("toggle_main_window");
  };

  const isUndetectable = customizable.cursor.type === "invisible";

  const TopControls = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-full border border-border/50 transition-all hover:bg-muted/60">
        {isUndetectable ? (
          <EyeOffIcon className="size-4 text-muted-foreground" />
        ) : (
          <EyeIcon className="size-4 text-emerald-500" />
        )}
        <span className="text-sm font-medium pr-1 select-none">
          {isUndetectable ? "Undetectable" : "Detectable"}
        </span>
        <Switch
          checked={isUndetectable}
          onCheckedChange={(checked) => {
            setCursorType(checked ? "invisible" : "auto");
          }}
          className="data-[state=checked]:bg-emerald-500"
        />
      </div>

      <Button
        onClick={handleStart}
        className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-400/30 transition-all hover:scale-105 px-6"
      >
        <PlayIcon className="size-4 mr-2 fill-current" />
        Start Deskify
      </Button>
    </div>
  );

  return (
    <PageLayout
      title="Dashboard"
      description="Deskify is ready to use. Start a conversation or configure your stealth settings."
      rightSlot={TopControls}
    >
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
        <div className="size-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
          <SparklesIcon className="size-8 text-emerald-500" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">System Ready</h2>
          <p className="text-muted-foreground">
            The managed AI network is fully operational. Deskify handles all processing securely in the cloud—no API keys required.
          </p>
        </div>
        <Button
          onClick={handleStart}
          size="lg"
          className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 px-8 h-12 text-base"
        >
          <PlayIcon className="size-5 mr-2 fill-current" />
          Launch Assistant
        </Button>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
