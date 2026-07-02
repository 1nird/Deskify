import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Bot,
  Play,
  Plus,
  Trash2,
  Save,
  Loader2,
  Sparkles,
  X,
  ChevronRight,
  ChevronDown,
  Check,
  AlertCircle,
  Square,
  GripVertical,
  Camera,
  Circle,
} from "lucide-react";
import { Button } from "@/components";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import {
  getAllAutomationScripts,
  createAutomationScript,
  updateAutomationScript,
  deleteAutomationScript,
  type AutomationScript,
  type AutomationStep,
} from "@/lib/database/automation-script.action";
import { useShortcuts } from "@/hooks/useShortcuts";

// ─── Types ──────────────────────────────────────────────────────────────────

const ACTIONS = [
  { value: "mouse_move", label: "Mouse Move" },
  { value: "mouse_click", label: "Mouse Click" },
  { value: "mouse_double_click", label: "Mouse Double Click" },
  { value: "mouse_down", label: "Mouse Down" },
  { value: "mouse_up", label: "Mouse Up" },
  { value: "key_press", label: "Key Press" },
  { value: "key_combo", label: "Key Combo" },
  { value: "type_text", label: "Type Text" },
  { value: "scroll", label: "Scroll" },
  { value: "wait", label: "Wait" },
  { value: "open_app", label: "Open App" },
  { value: "run_command", label: "Run Command" },
];

const SPEEDS = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
];

// ─── Custom Dropdown (fixes white-on-white option issue) ─────────────────────

function DropdownSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string | number; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 hover:border-emerald-500/40 transition-colors"
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown
          className={cn(
            "size-3 text-white/30 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#111827] border border-white/15 rounded-lg shadow-xl shadow-black/60 overflow-hidden max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => {
                onChange(String(opt.value));
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                String(opt.value) === String(value)
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-white/60 hover:bg-white/5 hover:text-white/80"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Automation Library Sidebar ──────────────────────────────────────────────

function LibrarySidebar({
  scripts,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: {
  scripts: AutomationScript[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col h-full border-r border-white/8 bg-[#0a0f14]/40 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-white/30 pl-1">
          Automations
        </span>
        <button
          onClick={onNew}
          className="size-7 rounded-lg flex items-center justify-center bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 transition-all duration-200"
          title="New automation"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {scripts.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-12 gap-2 opacity-40">
            <Bot className="size-6 text-white/30" />
            <p className="text-[10px] text-white/30 text-center px-4">
              No automations yet. Create one below.
            </p>
          </div>
        )}
        {scripts.map((script) => {
          const isActive = script.id === activeId;
          const stepCount = (() => {
            try {
              return JSON.parse(script.steps || "[]").length;
            } catch {
              return 0;
            }
          })();
          return (
            <div
              key={script.id}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150 min-w-0",
                isActive
                  ? "bg-emerald-500/15 border border-emerald-500/25"
                  : "hover:bg-white/5 border border-transparent"
              )}
              onClick={() => onSelect(script.id)}
            >
              <Bot
                className={cn(
                  "size-3.5 shrink-0 transition-colors",
                  isActive ? "text-emerald-400" : "text-white/30 group-hover:text-white/50"
                )}
              />
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "block text-xs truncate font-medium transition-colors",
                    isActive ? "text-emerald-200" : "text-white/50 group-hover:text-white/70"
                  )}
                >
                  {script.name}
                </span>
                <span className="text-[10px] text-white/20">
                  {stepCount} step{stepCount !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(script.id);
                }}
                className="opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center rounded-md hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all duration-150 shrink-0"
                title="Delete"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Automation Page ────────────────────────────────────────────────────

export const Automation = () => {
  const [scripts, setScripts] = useState<AutomationScript[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [runResults, setRunResults] = useState<string[]>([]);
  const [saved, setSaved] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [speed, setSpeed] = useState(1);
  const [repeatCount, setRepeatCount] = useState(1);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const runStepsRef = useRef(false);
  // Refs to avoid stale closures in shortcut callbacks
  const handleRunRef = useRef<() => Promise<void>>(async () => {});
  const handleStopRef = useRef<() => Promise<void>>(async () => {});
  const handleToggleRecordRef = useRef<() => void>(() => {});
  const handleScreenshotCaptureRef = useRef<() => Promise<void>>(async () => {});

  // ── Load scripts ──────────────────────────────────────────────────────────

  const loadScripts = useCallback(async () => {
    const all = await getAllAutomationScripts();
    setScripts(all);
    return all;
  }, []);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  useEffect(() => {
    if (!activeId) return;
    const script = scripts.find((s) => s.id === activeId);
    if (script) {
      setName(script.name);
      setDescription(script.description);
      try {
        setSteps(JSON.parse(script.steps || "[]"));
      } catch {
        setSteps([]);
      }
      setSaved(true);
      setRunResults([]);
      setCurrentStepIdx(-1);
      setRunning(false);
    }
  }, [activeId, scripts]);

  // ── Shortcuts ─────────────────────────────────────────────────────────────

  // ── Recording ──────────────────────────────────────────────────────────

  const handleToggleRecord = useCallback(() => {
    if (!recording) {
      // Start recording
      setRecording(true);
      recordingRef.current = true;
      // Auto-capture screenshot immediately
      handleScreenshotCapture();
      // Then capture every 2 seconds
      recordIntervalRef.current = setInterval(() => {
        if (recordingRef.current) {
          handleScreenshotCapture();
        }
      }, 2000);
    } else {
      // Stop recording
      setRecording(false);
      recordingRef.current = false;
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
    }
  }, [recording]);

  handleToggleRecordRef.current = handleToggleRecord;

  // Cleanup recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
      }
    };
  }, []);

  // ── Shortcuts (using refs to avoid stale closures) ────────────────────────

  const shortcutCallbacks = useMemo(
    () => ({
      automation_capture: () => handleScreenshotCaptureRef.current(),
      automation_run: () => handleRunRef.current(),
      automation_stop: () => handleStopRef.current(),
      automation_record: () => handleToggleRecordRef.current(),
    }),
    []
  );

  useShortcuts({ customShortcuts: shortcutCallbacks });

  // ── CRUD helpers ──────────────────────────────────────────────────────────

  const handleNew = () => {
    setActiveId(null);
    setName("New Automation");
    setDescription("");
    setSteps([]);
    setSaved(false);
    setRunResults([]);
    setCurrentStepIdx(-1);
    setRunning(false);
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  const handleDelete = async (id: string) => {
    await deleteAutomationScript(id);
    if (id === activeId) {
      setActiveId(null);
      setName("");
      setDescription("");
      setSteps([]);
    }
    await loadScripts();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveMsg("Name is required");
      return;
    }
    try {
      const stepsJson = JSON.stringify(steps);
      if (activeId) {
        await updateAutomationScript(activeId, {
          name: name.trim(),
          description,
          steps: stepsJson,
        });
      } else {
        const id = `auto-${Date.now()}`;
        await createAutomationScript({
          id,
          name: name.trim(),
          description,
          steps: stepsJson,
        });
        setActiveId(id);
      }
      setSaved(true);
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2000);
      await loadScripts();
    } catch {
      setSaveMsg("Save failed");
    }
  };

  // ── Step editing ──────────────────────────────────────────────────────────

  const addStep = () => {
    setSteps([
      ...steps,
      { action: "wait", params: { ms: 1000 }, description: "New step" },
    ]);
    setSaved(false);
  };

  const updateStep = (index: number, upd: Partial<AutomationStep>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], ...upd };
    setSteps(updated);
    setSaved(false);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setSaved(false);
    setEditingStepIndex(null);
  };

  // ── Drag and drop ───────────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDragIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === index) return;
  };

  const handleDrop = (index: number) => {
    if (dragIdx === null || dragIdx === index) return;
    const updated = [...steps];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(index, 0, moved);
    setSteps(updated);
    setDragIdx(null);
    setSaved(false);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  // ── Run automation ────────────────────────────────────────────────────────

  const handleStop = useCallback(async () => {
    runStepsRef.current = false;
    try {
      await invoke("automation_stop");
    } catch {}
    setRunning(false);
    setCurrentStepIdx(-1);
  }, []);

  const handleRun = useCallback(async () => {
    if (steps.length === 0 || running) return;
    setRunning(true);
    setCurrentStepIdx(-1);
    setRunResults([]);
    runStepsRef.current = true;

    const maxRepeats = repeatCount === 0 ? Infinity : repeatCount;
    let allResults: string[] = [];
    let repeat = 0;
    let stopped = false;

    try {
      while (runStepsRef.current && repeat < maxRepeats) {
        if (repeat > 0) {
          allResults.push(`─── Repeat ${repeat + 1}/${maxRepeats === Infinity ? "∞" : maxRepeats} ───`);
        }

        const results = await invoke<string[]>("automation_execute_steps", {
          steps,
          speed,
        });

        for (let i = 0; i < results.length; i++) {
          if (results[i].includes("⏹ Stopped")) {
            stopped = true;
            break;
          }
          setCurrentStepIdx(repeat * steps.length + i);
          allResults.push(results[i]);
          setRunResults([...allResults]);
          // Small delay so UI updates between steps
          await new Promise((r) => setTimeout(r, 50));
        }

        if (stopped || results.some((r) => r.includes("ERR") || r.includes("❌"))) {
          break;
        }

        repeat++;
      }

      if (!runStepsRef.current || stopped) {
        allResults.push("⏹ Automation stopped");
        setRunResults([...allResults]);
      } else if (repeat >= maxRepeats) {
        allResults.push("✅ Automation complete");
        setRunResults([...allResults]);
      }
    } catch (e) {
      allResults.push(
        `❌ Error: ${e instanceof Error ? e.message : String(e)}`
      );
      setRunResults([...allResults]);
    } finally {
      setRunning(false);
      setCurrentStepIdx(-1);
      runStepsRef.current = false;
    }
  }, [steps, running, repeatCount, speed]);

  // Keep refs in sync with latest callbacks
  handleRunRef.current = handleRun;
  handleStopRef.current = handleStop;

  // ── Screenshot handling ───────────────────────────────────────────────────

  const handleScreenshotCapture = async () => {
    try {
      const base64 = await invoke<string>("automation_capture_screen");
      setScreenshot(`data:image/png;base64,${base64}`);
    } catch (e) {
      console.error("Screenshot capture failed:", e);
    }
  };

  handleScreenshotCaptureRef.current = handleScreenshotCapture;

  const handleScreenshotPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setScreenshot(ev.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // ── AI generation ─────────────────────────────────────────────────────────

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;

    // Cancel previous request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiLoading(true);

    try {
      const systemPrompt = `You are an automation script generator for Deskify, an AI-powered desktop assistant.
Your task is to generate a JSON array of automation steps based on the user's request${screenshot ? " and the screenshot they provided" : ""}.

Available automation actions:
- mouse_move: { "x": number, "y": number } — move mouse to screen coordinates
- mouse_click: { "button": "left"|"right"|"middle" } — click a mouse button
- mouse_double_click: { "button": "left"|"right"|"middle" } — double-click
- mouse_down: { "button": "left"|"right"|"middle" } — press mouse button down
- mouse_up: { "button": "left"|"right"|"middle" } — release mouse button
- key_press: { "key": string } — press a single key (e.g. Enter, Escape, Tab, a, A)
- key_combo: { "keys": string } — key combination (e.g. "ctrl,c" for Ctrl+C)
- type_text: { "text": string } — type a string of text
- scroll: { "amount": number } — scroll wheel (positive=up, negative=down)
- wait: { "ms": number } — wait in milliseconds (1000 = 1 second)
- open_app: { "path": string } — open an app (e.g. "chrome.exe", "notepad.exe")
- run_command: { "cmd": string } — run a shell command

Rules:
1. ONLY output the JSON array, nothing else. No markdown, no explanation.
2. Every step should have a "description" field explaining what it does.
3. Use realistic coordinates if the user mentions specific UI elements.
4. Include wait steps between actions to allow the system to respond.
5. If the user provides a screenshot, analyze what's visible and generate steps to interact with it.

Example output:
[
  { "action": "open_app", "params": { "path": "notepad.exe" }, "description": "Open Notepad" },
  { "action": "wait", "params": { "ms": 1000 }, "description": "Wait for Notepad to open" },
  { "action": "type_text", "params": { "text": "Hello from Deskify!" }, "description": "Type greeting" }
]`;

      // Strip data URL prefix from screenshot for API
      let cleanScreenshot: string | undefined;
      if (screenshot) {
        cleanScreenshot = screenshot.includes(",")
          ? screenshot.split(",")[1]
          : screenshot;
      }

      let fullResponse = "";
      for await (const chunk of fetchAIResponse({
        systemPrompt,
        userMessage: aiPrompt,
        imagesBase64: cleanScreenshot ? [cleanScreenshot] : [],
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        fullResponse += chunk;
      }

      if (controller.signal.aborted) return;

      // Try to extract JSON from the response
      const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const newSteps: AutomationStep[] = parsed.map((s: any) => ({
            action: s.action || "wait",
            params: s.params || {},
            description: s.description,
          }));
          setSteps(newSteps);
          setSaved(false);
          setAiPrompt("");
        }
      } else {
        alert("Could not parse automation steps from AI response.");
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error("AI generation failed:", e);
      alert("Failed to generate automation. Please try again.");
    } finally {
      setAiLoading(false);
      aiAbortRef.current = null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const totalSteps = steps.length * (repeatCount === 0 ? 1 : repeatCount);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background pt-10">
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <LibrarySidebar
          scripts={scripts}
          activeId={activeId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onNew={handleNew}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-white/8 bg-[#0a0f14]/40 backdrop-blur-sm">
          <Bot className="size-3.5 text-emerald-400" />
          <span className="text-sm font-semibold text-white/80">Automation Studio</span>
          {!saved && (
            <span className="text-[10px] text-amber-400 ml-2">● Unsaved</span>
          )}
          {saveMsg && (
            <span className="text-[10px] text-emerald-400 ml-2">{saveMsg}</span>
          )}
          {running && (
            <span className="flex items-center gap-1 ml-2 text-[10px] text-amber-400 animate-pulse">
              <span className="size-1.5 rounded-full bg-amber-400 animate-ping" />
              Running
            </span>
          )}
          <div className="flex-1" />

          {/* Speed selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/25 uppercase">Speed</span>
            <DropdownSelect
              value={String(speed)}
              options={SPEEDS}
              onChange={(v) => setSpeed(Number(v))}
              className="w-16"
            />
          </div>

          {/* Repeat count */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/25 uppercase">Repeat</span>
            <input
              type="number"
              min={0}
              value={repeatCount}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0;
                setRepeatCount(Math.max(0, v));
              }}
              className="w-12 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 outline-none focus:border-emerald-500/50 text-center"
            />
            <span className="text-[10px] text-white/20">
              {repeatCount === 0 ? "∞" : ""}
            </span>
          </div>

          {/* Record */}
          <button
            onClick={handleToggleRecord}
            className={cn(
              "h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1 transition-all",
              recording
                ? "bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 animate-pulse"
                : "bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80"
            )}
            title={recording ? "Stop recording (Ctrl+Shift+U)" : "Record (Ctrl+Shift+U)"}
          >
            <Circle className={cn("size-2.5", recording && "fill-red-400")} />
            {recording ? "Recording" : "Record"}
            <kbd className="text-[9px] opacity-40 hidden sm:inline">Ctrl+Shift+U</kbd>
          </button>

          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="h-7 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 text-xs font-medium"
          >
            <Save className="size-3 mr-1" />
            Save
          </Button>

          {/* Run / Stop */}
          {running ? (
            <Button
              onClick={handleStop}
              className="h-7 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-medium flex items-center gap-1"
              title="Stop (Ctrl+Shift+X)"
            >
              <Square className="size-3" />
              Stop
              <kbd className="text-[9px] opacity-50 ml-0.5 hidden sm:inline">Ctrl+Shift+X</kbd>
            </Button>
          ) : (
            <Button
              onClick={handleRun}
              disabled={steps.length === 0}
              className="h-7 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium flex items-center gap-1"
              title="Run (Ctrl+Shift+R)"
            >
              <Play className="size-3" />
              Run
              <kbd className="text-[9px] opacity-50 ml-0.5 hidden sm:inline">Ctrl+Shift+R</kbd>
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!activeId && !name ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center select-none animate-in fade-in duration-500 px-4">
              <div className="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner mb-2">
                <Bot className="size-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white/70">
                  Create your first automation
                </p>
                <p className="text-xs text-white/30 max-w-md">
                  Use AI to generate automation steps from a screenshot &amp;
                  description, or build one manually step by step. Deskify can
                  control your mouse, keyboard, and apps.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  onClick={handleNew}
                  className="h-9 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm"
                >
                  <Plus className="size-4 mr-2" />
                  New Automation
                </Button>
                <span className="text-[10px] text-white/20 flex items-center gap-1">
                  or press <kbd className="px-1 py-0.5 rounded bg-white/10 text-[9px]">Ctrl+Shift+R</kbd> to run
                </span>
              </div>
            </div>
          ) : (
            /* Editor */
            <div className="px-6 py-5 space-y-5 max-w-3xl">
              {/* Name & Description */}
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="Automation name"
                  className="w-full bg-transparent text-xl font-bold text-white/90 placeholder-white/20 outline-none border-b border-white/8 pb-2 focus:border-emerald-500/50 transition-colors"
                />
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="Describe what this automation does..."
                  rows={2}
                  className="w-full bg-transparent text-sm text-white/50 placeholder-white/15 outline-none resize-none"
                />
              </div>

              {/* Running indicator banner */}
              {running && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
                  <Loader2 className="size-4 text-amber-400 animate-spin shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-amber-300">
                      Running automation...
                    </span>
                    <span className="text-[10px] text-amber-400/60 ml-2">
                      Step {Math.min(currentStepIdx + 1, totalSteps)} of {totalSteps || steps.length}
                    </span>
                  </div>
                  <button
                    onClick={handleStop}
                    className="px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-medium flex items-center gap-1"
                  >
                    <Square className="size-2.5" />
                    Stop (Ctrl+Shift+X)
                  </button>
                </div>
              )}

              {/* Run results */}
              {runResults.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-1.5 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                      Run Results
                    </span>
                    <button
                      onClick={() => setRunResults([])}
                      className="text-[10px] text-white/30 hover:text-white/60"
                    >
                      Clear
                    </button>
                  </div>
                  {runResults.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-xs flex items-start gap-2",
                        r.includes("❌") || r.includes("ERR")
                          ? "text-red-400"
                          : r.includes("⏹")
                          ? "text-amber-400"
                          : r.includes("───")
                          ? "text-white/20 font-mono"
                          : r.includes("✅")
                          ? "text-emerald-400 font-semibold"
                          : "text-emerald-400"
                      )}
                    >
                      {r.includes("❌") || r.includes("ERR") ? (
                        <AlertCircle className="size-3 mt-0.5 shrink-0" />
                      ) : r.includes("───") || r.includes("✅") || r.includes("⏹") ? (
                        <span className="size-3 shrink-0" />
                      ) : (
                        <Check className="size-3 mt-0.5 shrink-0" />
                      )}
                      {r}
                    </div>
                  ))}
                </div>
              )}

              {/* Steps list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                    Steps ({steps.length})
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white/15 flex items-center gap-1">
                      <GripVertical className="size-3" />
                      Drag to reorder
                    </span>
                    <button
                      onClick={addStep}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Add Step
                    </button>
                  </div>
                </div>

                {steps.length === 0 && (
                  <p className="text-xs text-white/20 py-3">
                    No steps yet. Add one manually or use AI to generate.
                  </p>
                )}

                {steps.map((step, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "rounded-xl border transition-all duration-200",
                      running && currentStepIdx === i
                        ? "border-amber-500/50 bg-amber-500/8 animate-pulse"
                        : editingStepIndex === i
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : dragIdx === i
                        ? "border-emerald-500/60 bg-emerald-500/10 opacity-50"
                        : "border-white/8 bg-white/3 hover:border-white/12",
                      dragIdx !== null && dragIdx !== i && "border-emerald-500/20"
                    )}
                  >
                    {/* Step header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer group"
                      onClick={() =>
                        setEditingStepIndex(editingStepIndex === i ? null : i)
                      }
                    >
                      {/* Drag handle */}
                      <div className="text-white/15 group-hover:text-white/40 cursor-grab active:cursor-grabbing">
                        <GripVertical className="size-3.5" />
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-mono w-5 shrink-0 transition-colors",
                          running && currentStepIdx === i
                            ? "text-amber-400"
                            : "text-white/25"
                        )}
                      >
                        {running && currentStepIdx === i ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : running && currentStepIdx > i ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 shrink-0">
                        {step.action}
                      </span>
                      <span className="text-xs text-white/50 flex-1 truncate">
                        {step.description || "No description"}
                      </span>
                      <ChevronRight
                        className={cn(
                          "size-3 text-white/20 transition-transform shrink-0",
                          editingStepIndex === i && "rotate-90"
                        )}
                      />
                    </div>

                    {/* Step editor (expanded) */}
                    {editingStepIndex === i && (
                      <div className="px-4 pb-3 pt-1 space-y-2 border-t border-white/5">
                        <div>
                          <label className="text-[10px] text-white/30 uppercase">
                            Action
                          </label>
                          <DropdownSelect
                            value={step.action}
                            options={ACTIONS}
                            onChange={(v) =>
                              updateStep(i, { action: v })
                            }
                          />
                        </div>

                        {/* Dynamic params editor */}
                        <StepParamsEditor
                          step={step}
                          onChange={(params) => updateStep(i, { params })}
                        />

                        <div>
                          <label className="text-[10px] text-white/30 uppercase">
                            Description
                          </label>
                          <input
                            value={step.description || ""}
                            onChange={(e) =>
                              updateStep(i, { description: e.target.value })
                            }
                            placeholder="What does this step do?"
                            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 outline-none focus:border-emerald-500/50"
                          />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => removeStep(i)}
                            className="text-[10px] text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="size-3 inline mr-0.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* AI Generation section */}
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">
                    Generate with AI
                  </span>
                </div>
                <p className="text-xs text-white/40">
                  Paste a screenshot and describe what you want to automate.
                  Deskify will generate the steps for you.
                </p>

                {/* Screenshot preview */}
                {screenshot ? (
                  <div className="relative inline-block">
                    <img
                      src={screenshot}
                      alt="Screenshot"
                      className="max-h-48 rounded-lg border border-white/10"
                    />
                    <button
                      onClick={() => setScreenshot(null)}
                      className="absolute -top-1.5 -right-1.5 size-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={handleScreenshotCapture}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white/80 transition-all"
                    >
                      <Camera className="size-3.5" />
                      Capture Screen
                      <kbd className="text-[9px] opacity-40 ml-1">Ctrl+Shift+A</kbd>
                    </button>
                    <span className="text-[10px] text-white/20 self-center">
                      or paste an image
                    </span>
                  </div>
                )}

                {/* Prompt input */}
                <div
                  className="flex gap-2"
                  onPaste={handleScreenshotPaste}
                >
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAIGenerate();
                      }
                    }}
                    placeholder='e.g. "Open Chrome, go to github.com, and sign in"'
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 outline-none focus:border-emerald-500/50"
                  />
                  <Button
                    onClick={handleAIGenerate}
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm"
                  >
                    {aiLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="size-3.5 mr-1.5" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
                {aiLoading && (
                  <p className="text-[10px] text-amber-400/60 animate-pulse">
                    Generating automation steps… this may take a moment.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Step Params Editor ──────────────────────────────────────────────────────

function StepParamsEditor({
  step,
  onChange,
}: {
  step: AutomationStep;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const p = step.params;

  switch (step.action) {
    case "mouse_move":
      return (
        <div className="flex gap-2">
          <ParamInput
            label="X"
            value={String(p.x ?? 0)}
            onChange={(v) => onChange({ ...p, x: Number(v) })}
          />
          <ParamInput
            label="Y"
            value={String(p.y ?? 0)}
            onChange={(v) => onChange({ ...p, y: Number(v) })}
          />
        </div>
      );
    case "mouse_click":
    case "mouse_double_click":
    case "mouse_down":
    case "mouse_up":
      return (
        <ParamDropdownSelect
          label="Button"
          value={String(p.button ?? "left")}
          options={[
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "middle", label: "Middle" },
          ]}
          onChange={(v) => onChange({ ...p, button: v })}
        />
      );
    case "key_press":
      return (
        <ParamInput
          label="Key"
          value={String(p.key ?? "")}
          onChange={(v) => onChange({ ...p, key: v })}
          placeholder="Enter, Escape, Tab, a..."
        />
      );
    case "key_combo":
      return (
        <ParamInput
          label="Keys (comma-separated)"
          value={String(p.keys ?? "")}
          onChange={(v) => onChange({ ...p, keys: v })}
          placeholder="ctrl,c"
        />
      );
    case "type_text":
      return (
        <ParamInput
          label="Text"
          value={String(p.text ?? "")}
          onChange={(v) => onChange({ ...p, text: v })}
          placeholder="Text to type..."
        />
      );
    case "scroll":
      return (
        <ParamInput
          label="Amount (positive=up, negative=down)"
          value={String(p.amount ?? 0)}
          onChange={(v) => onChange({ ...p, amount: Number(v) })}
        />
      );
    case "wait":
      return (
        <ParamInput
          label="Milliseconds"
          value={String(p.ms ?? 1000)}
          onChange={(v) => onChange({ ...p, ms: Number(v) })}
        />
      );
    case "open_app":
      return (
        <ParamInput
          label="App path"
          value={String(p.path ?? "")}
          onChange={(v) => onChange({ ...p, path: v })}
          placeholder="chrome.exe, notepad.exe..."
        />
      );
    case "run_command":
      return (
        <ParamInput
          label="Command"
          value={String(p.cmd ?? "")}
          onChange={(v) => onChange({ ...p, cmd: v })}
          placeholder="dir, echo hello..."
        />
      );
    default:
      return null;
  }
}

function ParamInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-white/30 uppercase">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 outline-none focus:border-emerald-500/50"
      />
    </div>
  );
}

function ParamDropdownSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-white/30 uppercase">{label}</label>
      <DropdownSelect
        value={value}
        options={options}
        onChange={onChange}
        className="mt-1"
      />
    </div>
  );
}

export default Automation;
