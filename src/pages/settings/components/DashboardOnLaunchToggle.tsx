import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

export const DashboardOnLaunchToggle = () => {
  const { showDashboardOnLaunch, setShowDashboardOnLaunch } = useApp();

  return (
    <div id="dashboard-on-launch" className="space-y-2">
      <Header
        title="Dashboard on Launch"
        description="Control whether the dashboard opens automatically when Deskify starts."
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">Open Dashboard on Start</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {showDashboardOnLaunch
                ? "Dashboard will open automatically on launch"
                : "Only the overlay bar will open on launch"}
            </p>
          </div>
        </div>
        <Switch
          checked={showDashboardOnLaunch}
          onCheckedChange={setShowDashboardOnLaunch}
          aria-label="Toggle dashboard on launch"
        />
      </div>
    </div>
  );
};
