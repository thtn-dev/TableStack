import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./style.css";
import App from "./App";

const container = document.getElementById("root")!;

createRoot(container).render(
  <React.StrictMode>
    {/* TooltipProvider required by shadcn/ui tooltip component */}
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
