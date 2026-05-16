import { ShortcutAction } from "@/types";

export const DEFAULT_SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "toggle_window",
    name: "Show/hide Deskify",
    description: "Toggle visibility of Deskify",
    defaultKey: {
      // macOS: avoid Cmd+Q (quit app); use Cmd+Shift+Q for toggle
      macos: "cmd+shift+q",
      windows: "ctrl+q",
      linux: "ctrl+q",
    },
  },
  {
    id: "focus_input",
    name: "Ask Deskify",
    description: "Ask Deskify about your screen",
    defaultKey: {
      macos: "cmd+e",
      windows: "ctrl+e",
      linux: "ctrl+e",
    },
  },
  {
    id: "clear_chat",
    name: "Clear chat",
    description: "Clear the current conversation with Deskify",
    defaultKey: {
      macos: "cmd+r",
      windows: "ctrl+r",
      linux: "ctrl+r",
    },
  },
  {
    id: "screenshot",
    name: "Screenshot",
    description: "Capture screenshot manually",
    defaultKey: {
      macos: "cmd+shift+s",
      windows: "ctrl+shift+s",
      linux: "ctrl+shift+s",
    },
  },
  {
    id: "toggle_dashboard",
    name: "Show Dashboard",
    description: "Toggle the main dashboard window",
    defaultKey: {
      macos: "cmd+g",
      windows: "ctrl+g",
      linux: "ctrl+g",
    },
  },
];
