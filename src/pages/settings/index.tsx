import {
  Theme,
  AlwaysOnTopToggle,
  AutostartToggle,
  DashboardOnLaunchToggle,
  DevOptions,
} from "./components";
import { PageLayout } from "@/layouts";
import { useApp as useAppContext } from "@/contexts";
import { DEV_EMAILS } from "@/components";

const Settings = () => {
  const { user } = useAppContext();
  const isDev = !!(user?.email && DEV_EMAILS.includes(user.email.toLowerCase()));
  
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
      {isDev && <DevOptions />}
    </PageLayout>
  );
};

export default Settings;
