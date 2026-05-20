import {
  Theme,
  AlwaysOnTopToggle,
  AutostartToggle,
  DashboardOnLaunchToggle,
  DevOptions,
} from "./components";
import { PageLayout } from "@/layouts";
import { useApp as useAppContext } from "@/contexts";

const Settings = () => {
  const { user } = useAppContext();
  
  return (
    <PageLayout title="Settings" description="Manage your settings">
      {/* Dashboard on Launch */}
      <DashboardOnLaunchToggle />

      {/* Theme */}
      <Theme />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />
      
      {/* Dev Options for admin only */}
      {user?.email === "nirdeshbar@gmail.com" && <DevOptions />}
    </PageLayout>
  );
};

export default Settings;
