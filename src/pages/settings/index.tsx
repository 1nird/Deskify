import {
  Theme,
  AlwaysOnTopToggle,
  AutostartToggle,
  DashboardOnLaunchToggle,
} from "./components";
import { PageLayout } from "@/layouts";

const Settings = () => {
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
    </PageLayout>
  );
};

export default Settings;
