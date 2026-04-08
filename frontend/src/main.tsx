import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./style.css";
import App from "./App";

const container = document.getElementById("root")!;

createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      {/* TooltipProvider required by shadcn/ui tooltip component */}
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </HashRouter>
  </React.StrictMode>
);
