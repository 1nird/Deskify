import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef } from "react";

/** Last non-overlay height so drag/mutation shrink uses the correct idle size */
export const windowIdleHeightRef = { current: 184 as number };

// Helper function to check if any popover is open in the DOM
const isAnyPopoverOpen = (): boolean => {
  const popoverContents = document.querySelectorAll(
    "[data-radix-popper-content-wrapper]"
  );
  return popoverContents.length > 0;
};

export const useWindowResize = () => {
  const expandedRef = useRef(false);
  const resizeWindow = useCallback(
    async (expanded: boolean, collapsedHeight?: number) => {
      try {
        expandedRef.current = expanded;
        const window = getCurrentWebviewWindow();

        if (!expanded && isAnyPopoverOpen()) {
          return;
        }

        if (typeof collapsedHeight === "number") {
          windowIdleHeightRef.current = collapsedHeight;
        }

        const newHeight = expanded ? 640 : windowIdleHeightRef.current;

        await invoke("set_window_height", {
          window,
          height: newHeight,
        });
      } catch (error) {
        console.error("Failed to resize window:", error);
      }
    },
    []
  );

  // Setup drag handling and popover monitoring
  useEffect(() => {
    let isDragging = false;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isDragRegion = target.closest('[data-tauri-drag-region="true"]');

      if (isDragRegion) {
        isDragging = true;
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        isDragging = false;

        setTimeout(() => {
          // Only shrink to idle height if the app is not currently expanded.
          if (!expandedRef.current && !isAnyPopoverOpen()) resizeWindow(false);
        }, 100);
      }
    };

    const observer = new MutationObserver(() => {
      // Popover portals can mount/unmount frequently; don't fight the expanded size.
      if (!expandedRef.current && !isAnyPopoverOpen()) resizeWindow(false);
    });

    // Observe the body for changes to detect popover open/close
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      observer.disconnect();
    };
  }, [resizeWindow]);

  return { resizeWindow };
};



interface UseWindowFocusOptions {
  onFocusLost?: () => void;
  onFocusGained?: () => void;
}

export const useWindowFocus = ({
  onFocusLost,
  onFocusGained,
}: UseWindowFocusOptions = {}) => {
  const handleFocusChange = useCallback(
    async (focused: boolean) => {
      if (focused && onFocusGained) {
        onFocusGained();
      } else if (!focused && onFocusLost) {
        onFocusLost();
      }
    },
    [onFocusLost, onFocusGained]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const window = getCurrentWebviewWindow();

        // Listen to focus change events
        unlisten = await window.onFocusChanged(({ payload: focused }) => {
          handleFocusChange(focused);
        });
      } catch (error) {
        console.error("Failed to setup focus listener:", error);
      }
    };

    setupFocusListener();

    // Cleanup
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFocusChange]);
};
