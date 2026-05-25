import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MousePointer2 } from "lucide-react";

const MIN_SELECTION_SIZE = 10;

interface SelectionCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayProps {
  monitorIndex: number;
}

const Overlay: React.FC<OverlayProps> = ({ monitorIndex }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startCoords, setStartCoords] = useState({ x: 0, y: 0 });
  const [selectionStyle, setSelectionStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    display: "none" as "none" | "block",
  });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  const selectionRef = useRef<HTMLDivElement>(null);

  // Handle cancellation (ESC key, cancel button)
  const handleCancel = async () => {
    setIsSelecting(false);
    try {
      await invoke("close_overlay_window", { reason: "User cancelled" });
    } catch {
      // Error ignored
    }
  };

  // Handle selection completion
  const handleSelectionComplete = async (
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    try {
      const scaleFactor = window.devicePixelRatio || 1;
      const coords: SelectionCoords = {
        x: Math.round(x * scaleFactor),
        y: Math.round(y * scaleFactor),
        width: Math.round(width * scaleFactor),
        height: Math.round(height * scaleFactor),
      };

      await invoke("capture_selected_area", {
        coords,
        monitorIndex,
      });
    } catch {
      // Error ignored
      console.error("Error capturing selected area");
    }
  };

  // Handle mouse selection logic
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSelecting(true);
    setStartCoords({ x: e.clientX, y: e.clientY });
    setCursorPosition({ x: e.clientX, y: e.clientY });
    setShowDimensions(false);

    setSelectionStyle({
      left: e.clientX,
      top: e.clientY,
      width: 0,
      height: 0,
      display: "block",
    });

    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Always update cursor position
    setCursorPosition({ x: e.clientX, y: e.clientY });

    if (!cursorVisible) {
      setCursorVisible(true);
    }

    if (!isSelecting) return;

    const width = Math.abs(e.clientX - startCoords.x);
    const height = Math.abs(e.clientY - startCoords.y);
    const left = Math.min(e.clientX, startCoords.x);
    const top = Math.min(e.clientY, startCoords.y);

    setSelectionStyle((prev) => ({
      ...prev,
      width,
      height,
      left,
      top,
    }));

    // Show dimensions when selection is meaningful
    if (width >= MIN_SELECTION_SIZE || height >= MIN_SELECTION_SIZE) {
      const scaleFactor = window.devicePixelRatio || 1;
      setDimensions({ w: Math.round(width * scaleFactor), h: Math.round(height * scaleFactor) });
      setShowDimensions(true);
    } else {
      setShowDimensions(false);
    }

    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Update cursor position
    setCursorPosition({ x: e.clientX, y: e.clientY });

    if (!isSelecting) return;

    setIsSelecting(false);

    const x = Math.min(e.clientX, startCoords.x);
    const y = Math.min(e.clientY, startCoords.y);
    const width = Math.abs(e.clientX - startCoords.x);
    const height = Math.abs(e.clientY - startCoords.y);

    e.preventDefault();
    e.stopPropagation();

    setShowDimensions(false);

    if (width >= MIN_SELECTION_SIZE && height >= MIN_SELECTION_SIZE) {
      handleSelectionComplete(x, y, width, height);
    } else {
      handleCancel();
    }
  };

  // Handle ESC key
  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.keyCode === 27) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleCancel();
    }
  };

  // Event listeners setup
  useEffect(() => {
    // ESC key listeners (multiple levels for reliability)
    document.addEventListener("keydown", handleEscapeKey, true);
    document.body.addEventListener("keydown", handleEscapeKey, true);
    window.addEventListener("keydown", handleEscapeKey, true);

    return () => {
      document.removeEventListener("keydown", handleEscapeKey, true);
      document.body.removeEventListener("keydown", handleEscapeKey, true);
      window.removeEventListener("keydown", handleEscapeKey, true);
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 w-screen h-screen overflow-hidden"
        style={{
          cursor: "none",
          backgroundColor: "rgba(15, 23, 42, 0.35)",
          backdropFilter: "blur(2px)",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Instructions - Show on all monitors so users always see them */}
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-lg font-sans text-sm pointer-events-none z-[5000] shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Screen Capture:</span>
            <span>Click and drag to select area · Press ESC to cancel</span>
          </div>
        </div>

        {/* Cancel Button - Show on all monitors for easy access */}
        <button
          onClick={handleCancel}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCancel();
          }}
          style={{ cursor: "none" }}
          className="fixed top-5 right-5 bg-red-500 hover:bg-red-600 text-white border-none px-5 py-2.5 rounded-lg font-sans text-sm z-[5000] transition-colors duration-200 shadow-2xl backdrop-blur-sm font-semibold"
        >
          Cancel (ESC)
        </button>

        {/* Selection Rectangle — outer glow */}
        <div
          ref={selectionRef}
          className="absolute border-2 border-white/80 bg-white/5 pointer-events-none"
          style={{
            left: selectionStyle.left,
            top: selectionStyle.top,
            width: selectionStyle.width,
            height: selectionStyle.height,
            display: selectionStyle.display,
            zIndex: 4000,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.15), inset 0 0 0 1px rgba(255,255,255,0.05)",
            borderRadius: "6px",
          }}
        />
        {/* Selection Rectangle — inner dashed accent */}
        <div
          className="absolute border border-dashed border-emerald-400/50 pointer-events-none"
          style={{
            left: selectionStyle.left + 2,
            top: selectionStyle.top + 2,
            width: Math.max(0, selectionStyle.width - 4),
            height: Math.max(0, selectionStyle.height - 4),
            display: selectionStyle.display,
            zIndex: 4001,
            borderRadius: "4px",
          }}
        />
        {/* Dimensions tooltip */}
        {showDimensions && isSelecting && (
          <div
            className="fixed pointer-events-none z-[5001] px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-emerald-300 shadow-lg"
            style={{
              left: Math.min(selectionStyle.left + selectionStyle.width + 8, window.innerWidth - 110),
              top: Math.min(selectionStyle.top + selectionStyle.height + 8, window.innerHeight - 32),
            }}
          >
            {dimensions.w} × {dimensions.h}
          </div>
        )}

        {/* Custom Cursor */}
        <div
          className="fixed pointer-events-none z-[9999] transition-opacity duration-100"
          style={{
            left: cursorPosition.x,
            top: cursorPosition.y,
            transform: "translate(-2px, -2px)",
            opacity: cursorVisible ? 1 : 0,
          }}
        >
          <MousePointer2 className="w-5 h-5 drop-shadow-2xl fill-secondary stroke-primary" />
        </div>
      </div>
    </>
  );
};

export default Overlay;
