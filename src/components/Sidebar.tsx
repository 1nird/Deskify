import { Button, Logo, UserProfile } from "@/components";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMenuItems, useVersion } from "@/hooks";
import { usePremium } from "@/components";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { isPremium } = usePremium();
  const { menu, footerLinks, footerItems } = useMenuItems(isPremium === true);

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;

  return (
    <aside className="flex w-56 flex-col select-none pt-2 relative bg-sidebar/80 backdrop-blur-lg border-r border-sidebar-border/50 shadow-xl z-20">
      {/* Subtle left-border glow */}
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent pointer-events-none" />

      {/* Logo */}
      <div
        onClick={() => navigate("/chats")}
        className="flex flex-col items-center justify-center h-20 mt-3 mb-1 cursor-pointer group"
      >
        <Logo size={48} />
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[8px] leading-none font-medium tracking-wide text-muted-foreground/55 tabular-nums group-hover:text-primary/55 transition-colors">
            {isLoading ? "…" : `v${version}`}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-6">
        {menu.map((item, index) => {
          const isActive = activeRoute === item.href || (item.href !== "/" && item.href !== "#" && activeRoute.startsWith(item.href));
          return (
              <button
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else if (item.label === "Upgrade to Premium") {
                    openUrl("https://deskify.site/pricing");
                  } else {
                    navigate(item.href);
                  }
                }}
                key={`${item.label}-${index}`}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs lg:text-sm transition-all duration-200",
                isActive
                  ? "nav-active font-medium"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                item.className
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon
                  className={cn(
                    "size-3.5 lg:size-4 transition-all duration-200",
                    isActive ? "text-primary" : ""
                  )}
                />
                {item.label}
              </div>
              {item.count ? (
                <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col space-y-0.5 px-3 pb-3">
        <UserProfile />
        <div className="my-2 h-px bg-white/5 mx-2" />
        {/* Social links */}
        <div className="flex flex-row justify-center items-center gap-1.5 mb-2 px-1">
          {footerLinks.map((item, index) => (
            <Button
              key={`${item.title}-${index}`}
              title={item.title}
              size="sm"
              variant="ghost"
              className="flex-1 h-8 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
              onClick={() => openUrl(item.link)}
            >
              <item.icon className="size-3.5 transition-all duration-200" />
            </Button>
          ))}
        </div>

        {/* Footer action items */}
        {footerItems.map((item, index) => (
          item.href ? (
            <a
              href={item.href}
              onClick={item.action}
              target="_blank"
              rel="noopener noreferrer"
              key={`${item.label}-${index}`}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs lg:text-sm text-sidebar-foreground/60 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="size-3.5 lg:size-4 transition-all duration-200" />
                {item.label}
              </div>
            </a>
          ) : (
            <button
              onClick={item.action}
              key={`${item.label}-${index}`}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs lg:text-sm text-sidebar-foreground/60 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="size-3.5 lg:size-4 transition-all duration-200" />
                {item.label}
              </div>
            </button>
          )
        ))}
      </div>
    </aside>
  );
};
