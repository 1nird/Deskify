import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/auth.context";
import { LogOut, Settings, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export const UserProfile = () => {
  const { googleProfile, signOut, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isAuthenticated) return null;

  const name = googleProfile?.name || "Google User";
  const email = googleProfile?.email || "";
  const picture = googleProfile?.picture;
  const plan = googleProfile?.plan;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="relative w-full px-2" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-2 transition-all duration-200 hover:bg-white/10 group",
          isOpen ? "bg-white/10" : "bg-transparent"
        )}
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-zinc-500/20 to-zinc-700/40 border border-zinc-500/30">
          {picture ? (
            <img src={picture} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-zinc-400">{initial}</span>
          )}
          <div className="absolute inset-0 bg-zinc-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="flex flex-1 flex-col items-start overflow-hidden text-left">
          <span className="truncate text-xs font-semibold text-white/90">{name}</span>
          <span className="truncate text-[10px] text-white/40">{email}</span>
        </div>

        <ChevronUp className={cn(
          "size-4 text-white/20 transition-transform duration-200",
          isOpen ? "rotate-180" : ""
        )} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-2 right-2 mb-2 z-[100] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-3 py-2 border-b border-white/5 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Account</p>
            <p className="truncate text-xs font-medium text-white/90">{name}</p>
            <p className={cn("truncate text-[10px] mt-0.5 font-semibold", googleProfile?.isPaid ? "text-emerald-400" : "text-white/40")}>
              {googleProfile?.isPaid && plan ? plan : "Free"} Plan
            </p>
          </div>

          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            onClick={() => {
              setIsOpen(false);
              navigate("/settings");
            }}
          >
            <Settings className="size-4 opacity-70" />
            Settings
          </button>

          <div className="my-1 h-px bg-white/5" />

          <button
            onClick={() => {
              setIsOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="size-4 opacity-70" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};
