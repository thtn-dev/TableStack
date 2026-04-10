import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./style.css";
import "@/hooks/useTheme"; // apply persisted theme before first render
import App from "./App";

const container = document.getElementById("root")!;

createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      {/* TooltipProvider required by shadcn/ui tooltip component */}
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
    </HashRouter>
  </React.StrictMode>
);
