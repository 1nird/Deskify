import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LockIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useApp } from "@/contexts";

type PremiumGateProps = {
  children: ReactNode;
  fallback?: ReactNode;
  featureName?: string;
  mode?: "modal" | "inline";
};

export const DEV_EMAILS = [
  "nirdeshbar@gmail.com",
  "aarya.vaishnav111@gmail.com",
  "aarya.vaishnav17@gmail.com",
  "siddhantm167@gmail.com",
];

export const usePremium = () => {
  const { user } = useApp();
  
  const isDevEmail = !!(user?.email && DEV_EMAILS.includes(user.email.toLowerCase()));
  
  // Check if user has any paid plan (student or developer)
  const isPremium = isDevEmail || user?.isPaid === true || (!!user?.plan && user.plan !== "free" && user.plan !== "");
  
  // Check specific plan tier
  const rawPlan = isDevEmail ? "developer" : (user?.plan?.toLowerCase() || "free");
  
  // Normalize plan tier to base tier
  const userPlan = rawPlan.includes("developer") ? "developer" : rawPlan.includes("student") ? "student" : rawPlan;
  
  const isStudent = userPlan === "student";
  const isDeveloper = userPlan === "developer";
  
  const upgrade = async () => {
    await openUrl("https://deskify.site/pricing");
  };

  return { isPremium, isStudent, isDeveloper, userPlan, upgrade };
};

export const PremiumGate = ({ children, fallback, featureName, mode = "modal" }: PremiumGateProps) => {
  const { isPremium, upgrade } = usePremium();

  if (isPremium) {
    return <>{children}</>;
  }

  if (mode === "inline") {
    // Inline mode: show disabled/greyed-out version
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <LockIcon className="w-5 h-5 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Requires Premium</p>
          </div>
        </div>
      </div>
    );
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  // Modal mode (default): show full-page premium lock
  return (
    <div className="flex flex-col items-center justify-center p-8 border border-white/10 rounded-2xl bg-zinc-900/50 backdrop-blur-md">
      <div className="bg-emerald-500/10 p-4 rounded-full mb-4">
        <LockIcon className="w-8 h-8 text-emerald-400" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2 text-center">
        {featureName ? `${featureName} is a Premium Feature` : "Premium Feature"}
      </h3>
      <p className="text-sm text-zinc-400 text-center mb-6 max-w-sm">
        Upgrade to Student or Developer plan to unlock this feature and supercharge your workflow.
      </p>
      <Button onClick={upgrade} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 rounded-full shadow-lg shadow-emerald-500/20">
        Upgrade Now
      </Button>
    </div>
  );
};
