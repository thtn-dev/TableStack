import React, { useEffect, useState } from "react";
import {
  DatabaseIcon,
  SquareIcon,
  Cancel01Icon,
  CollapseIcon,
  SolidLine01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Application, System, Window } from "@wailsio/runtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TitleBarProps {
  className?: string;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// App branding
// ---------------------------------------------------------------------------

function AppBrand() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
        <HugeiconsIcon
          icon={DatabaseIcon}
          size={13}
          className="text-primary-foreground"
        />
      </div>
      <span className="text-[13px] font-semibold tracking-tight text-foreground/90">
        TableStack
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Window Controls
// ---------------------------------------------------------------------------

interface WindowControlsProps {
  platform: string;
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximizeToggle: () => void;
  onClose: () => void;
}

function WindowControls({
  platform,
  isMaximized,
  onMinimize,
  onMaximizeToggle,
  onClose,
}: WindowControlsProps) {
  const isMac = platform === "darwin";

  const btnClassBase = "flex items-center justify-center transition-colors";
  const dragStyle = { "--wails-draggable": "no-drag" } as React.CSSProperties;

  if (isMac) {
    return (
      <div
        className="flex items-center gap-2 group ml-1 mr-2"
        style={dragStyle}
      >
        <button
          name="close"
          title="Close"
          type="button"
          onClick={onClose}
          className="w-3 h-3 rounded-full bg-red-500/90 hover:bg-red-500 border border-black/10 flex items-center justify-center outline-none"
        />
        <button
          name="minimize"
          title="Minimize"
          type="button"
          onClick={onMinimize}
          className="w-3 h-3 rounded-full bg-yellow-500/90 hover:bg-yellow-500 border border-black/10 flex items-center justify-center outline-none"
        />
        <button
          name="maximize"
          title={isMaximized ? "Restore" : "Maximize"}
          type="button"
          onClick={onMaximizeToggle}
          className="w-3 h-3 rounded-full bg-green-500/90 hover:bg-green-500 border border-black/10 flex items-center justify-center outline-none"
        />
      </div>
    );
  }

  // Windows / Linux
  return (
    <div className="flex items-center" style={dragStyle}>
      <button
        onClick={onMinimize}
        className={cn(btnClassBase, "w-11 h-10 hover:bg-white/10")}
        title="Minimize"
      >
        <HugeiconsIcon icon={SolidLine01Icon} size={16} strokeWidth={1} />
      </button>
      <button
        onClick={onMaximizeToggle}
        className={cn(btnClassBase, "w-11 h-10 hover:bg-white/10")}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        <HugeiconsIcon
          icon={isMaximized ? CollapseIcon : SquareIcon}
          size={16}
          strokeWidth={1}
        />
      </button>
      <button
        onClick={onClose}
        className={cn(
          btnClassBase,
          "w-11 h-10 hover:bg-red-500 hover:text-white",
        )}
        title="Close"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TitleBar
// ---------------------------------------------------------------------------

export function TitleBar({ className, onClose }: TitleBarProps) {
  const [platform, setPlatform] = useState<string>("windows");
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    System.Environment()
      .then((env) => {
        setPlatform(env.OS);
      })
      .catch(console.error);

    const checkMaximized = () => {
      Window.IsMaximised().then(setIsMaximized).catch(console.error);
    };
    checkMaximized();

    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMinimize = () => {
    void Window.Minimise();
  };
  const handleMaximizeToggle = () => {
    void Window.ToggleMaximise();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      void Application.Quit();
    }
  };

  const isMac = platform === "darwin";

  return (
    <header
      id="titlebar"
      onDoubleClick={handleMaximizeToggle}
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      className={cn(
        "flex h-10 shrink-0 items-center justify-between",
        !isMac && "pl-3",
        "border-b border-border/60 bg-background/95 backdrop-blur-sm",
        "select-none overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center h-full">
        {isMac && (
          <WindowControls
            platform={platform}
            isMaximized={isMaximized}
            onMinimize={handleMinimize}
            onMaximizeToggle={handleMaximizeToggle}
            onClose={handleClose}
          />
        )}
        <div
          className={cn(isMac ? "ml-2" : "")}
          style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
        >
          <AppBrand />
        </div>
      </div>

      <div className="flex-1 h-full" />

      {!isMac && (
        <WindowControls
          platform={platform}
          isMaximized={isMaximized}
          onMinimize={handleMinimize}
          onMaximizeToggle={handleMaximizeToggle}
          onClose={handleClose}
        />
      )}
    </header>
  );
}
