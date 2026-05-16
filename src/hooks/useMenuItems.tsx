import {
  Settings,
  MessagesSquare,
  WandSparkles,
  SquareSlashIcon,
  MonitorIcon,
  PowerIcon,
  GlobeIcon,
  ArrowUpCircleIcon,
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

  const footerItems: {
    icon: React.ElementType;
    label: string;
    href?: string;
    action?: () => Promise<void> | void;
  }[] = [
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
      link: "https://github.com/deskify/deskify",
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
