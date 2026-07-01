import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AuthGate } from "./components/AuthGate";
import { AppProvider, AuthProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { Updater } from "@/components";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AuthProvider>
            <Updater />
            <AuthGate>
              <AppRoutes />
            </AuthGate>
          </AuthProvider>
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
