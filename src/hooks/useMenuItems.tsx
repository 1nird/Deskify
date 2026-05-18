import {
  Settings,
  MessagesSquare,
  WandSparkles,
  SquareSlashIcon,
  MonitorIcon,
  PowerIcon,
  GlobeIcon,
  ArrowUpCircleIcon,
  PlayIcon,
  Bug,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { GithubIcon, InstagramIcon, TikTokIcon } from "@/components";

export const useMenuItems = (isPremium?: boolean) => {
  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
    action?: () => void;
    className?: string;
  }[] = [
    {
      icon: MessagesSquare,
      label: "Chats",
      href: "/chats",
    },
    {
      icon: WandSparkles,
      label: "System Prompts",
      href: "/system-prompts",
    },

    {
      icon: MonitorIcon,
      label: "Screenshot",
      href: "/screenshot",
    },
    {
      icon: SquareSlashIcon,
      label: "Shortcuts",
      href: "/shortcuts",
    },
    {
      icon: Settings,
      label: "Settings",
      href: "/settings",
    },
  ];

  if (isPremium === false) {
    menu.push({
      icon: ArrowUpCircleIcon,
      label: "Upgrade to Premium",
      href: "#",
      className: "text-emerald-500 hover:bg-emerald-500/10 font-bold",
    });
  }

  menu.push({
    icon: PlayIcon,
    label: "Start Deskify",
    href: "#",
    action: () => {
      localStorage.setItem("deskify-new-conversation", String(Date.now()));
      window.dispatchEvent(new CustomEvent("newConversation"));
      invoke("toggle_main_window");
    },
    className: "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/20 transition-all font-bold mt-2 justify-center",
  });

  const footerItems: {
    icon: React.ElementType;
    label: string;
    href?: string;
    action?: () => Promise<void> | void;
  }[] = [
    {
      icon: Bug,
      label: "Report Bug / Feedback",
      action: () => {
        import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
          openUrl("https://deskify.site/feedback");
        });
      },
    },
    {
      icon: PowerIcon,
      label: "Quit Deskify",
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  const footerLinks: {
    title: string;
    icon: React.ElementType;
    link: string;
  }[] = [
    {
      title: "Website",
      icon: GlobeIcon,
      link: "https://deskify.site/",
    },
    {
      title: "Github",
      icon: GithubIcon,
      link: "https://github.com/1nird/deskify",
    },
    {
      title: "TikTok",
      icon: TikTokIcon,
      link: "https://www.tiktok.com/@deskify_official",
    },
    {
      title: "Instagram",
      icon: InstagramIcon,
      link: "https://www.instagram.com/deskify_verified/",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
