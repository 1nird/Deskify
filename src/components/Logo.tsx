import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Edge length in CSS pixels */
  size?: number;
  /** Show hover / press micro-interactions */
  interactive?: boolean;
  /** Window drag handle (grab cursor); use in overlay title bar */
  dragHandle?: boolean;
}

export const Logo = ({
  className,
  size = 40,
  interactive = true,
  dragHandle = false,
}: LogoProps) => {
  return (
    <div
      data-tauri-drag-region={dragHandle}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl bg-transparent",
        interactive &&
          "transition-transform duration-300 ease-out active:scale-[0.96]",
        dragHandle
          ? "cursor-grab active:cursor-grabbing"
          : interactive && "cursor-pointer",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/d-logo.png"
        alt=""
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        data-tauri-drag-region={dragHandle}
        className={cn(
          "h-full w-full object-contain select-none",
          interactive &&
            "transition-[transform,filter] duration-300 ease-out hover:scale-[1.07] hover:brightness-[1.08] hover:drop-shadow-[0_0_18px_rgba(45,212,191,0.55)]"
        )}
      />
    </div>
  );
};
