import React, { useEffect, useState } from "react";
import {
  DatabaseIcon,
  SquareIcon,
  Cancel01Icon,
  CollapseIcon,
  SolidLine01Icon,
  Menu01Icon,
  Settings01Icon,
  SidebarRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Application, System, Window } from "@wailsio/runtime";
import { SettingsDialog } from "@/components/settings";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useDBStore } from "@/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TitleBarProps {
  className?: string;
  onClose?: () => void;

  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;

  leftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;

  rightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  showRightToolbar?: boolean;
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
// Left Sidebar Toggle
// ---------------------------------------------------------------------------

interface LeftSidebarToggleProps {
  open: boolean;
  onToggle: () => void;
}

function LeftSidebarToggle({ open, onToggle }: LeftSidebarToggleProps) {
  return (
    <Button
      size="icon-lg"
      onClick={onToggle}
      variant={"ghost"}
      title={open ? "Hide sidebar" : "Show sidebar"}
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
        "hover:bg-white/10 text-foreground/70 hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={Menu01Icon} size={16} strokeWidth={1.5} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Center — active profile name label
// ---------------------------------------------------------------------------

function ActiveProfileLabel() {
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const activeProfile = useDBStore((s) =>
    s.profiles.data?.find((p) => p.id === activeProfileId) ?? null,
  );

  if (!activeProfile) return null;

  const tagColor = activeProfile.tag?.color ?? "#6B7280";

  return (
    <div
      className="flex items-center gap-1.5 select-none"
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: tagColor }}
      />
      <span className="text-[12px] font-medium text-foreground/70 truncate max-w-50">
        {activeProfile.name}
      </span>
      {activeProfile.database && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[12px] text-muted-foreground/60 truncate max-w-30">
            {activeProfile.database}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right Toolbar
// ---------------------------------------------------------------------------

interface RightToolbarProps {
  onOpenSettings: () => void;
  rightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
}

function RightToolbar({ onOpenSettings, rightSidebarOpen, onToggleRightSidebar }: RightToolbarProps) {
  const dragStyle = { "--wails-draggable": "no-drag" } as React.CSSProperties;

  const btnClass = cn(
    "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
    "hover:bg-white/10 text-foreground/70 hover:text-foreground",
  );

  return (
    <>
      <div className="flex items-center gap-0.5 mr-1" style={dragStyle}>
        <Button
          size="icon-lg"
          variant={"ghost"}
          title={rightSidebarOpen ? "Hide right panel" : "Show right panel"}
          onClick={onToggleRightSidebar}
          className={cn(btnClass, rightSidebarOpen && "bg-white/10 text-foreground")}
        >
          <HugeiconsIcon
            icon={SidebarRight01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </Button>
        <Button
          size="icon-lg"
          variant={"ghost"}
          title="Settings"
          onClick={onOpenSettings}
          className={btnClass}
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
        </Button>
      </div>
      <Separator orientation="vertical" />
    </>
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

  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
}

function WindowControls({
  platform,
  isMaximized,
  onMinimize,
  onMaximizeToggle,
  onClose,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
}: WindowControlsProps) {
  const isMac = platform === "darwin";

  const btnClassBase = "flex items-center justify-center transition-colors";
  const dragStyle = { "--wails-draggable": "no-drag" } as React.CSSProperties;

  if (isMac) {
    return (
      <div className="flex items-center gap-2 group mx-2" style={dragStyle}>
        {showClose && (
          <button
            name="close"
            title="Close"
            type="button"
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-red-500/90 hover:bg-red-500 border border-black/10"
          />
        )}
        {showMinimize && (
          <button
            name="minimize"
            title="Minimize"
            type="button"
            onClick={onMinimize}
            className="w-3 h-3 rounded-full bg-yellow-500/90 hover:bg-yellow-500 border border-black/10"
          />
        )}
        {showMaximize && (
          <button
            name="maximize"
            title={isMaximized ? "Restore" : "Maximize"}
            type="button"
            onClick={onMaximizeToggle}
            className="w-3 h-3 rounded-full bg-green-500/90 hover:bg-green-500 border border-black/10"
          />
        )}
      </div>
    );
  }

  // Windows / Linux
  return (
    <div className="flex items-center" style={dragStyle}>
      {showMinimize && (
        <button
          onClick={onMinimize}
          className={cn(btnClassBase, "w-11 h-10 hover:bg-white/10")}
          title="Minimize"
        >
          <HugeiconsIcon icon={SolidLine01Icon} size={16} strokeWidth={1} />
        </button>
      )}

      {showMaximize && (
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
      )}

      {showClose && (
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TitleBar
// ---------------------------------------------------------------------------

export function TitleBar({
  className,
  onClose,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  leftSidebarOpen = true,
  onToggleLeftSidebar,
  rightSidebarOpen = false,
  onToggleRightSidebar,
  showRightToolbar = true,
}: TitleBarProps) {
  const [platform, setPlatform] = useState<string>("windows");
  const [isMaximized, setIsMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    System.Environment()
      .then((env) => setPlatform(env.OS))
      .catch(console.error);

    const checkMaximized = () => {
      Window.IsMaximised().then(setIsMaximized).catch(console.error);
    };

    checkMaximized();

    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMinimize = () => void Window.Minimise();

  const handleMaximizeToggle = () => {
    void Window.ToggleMaximise();
    setIsMaximized((prev) => !prev);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else void Application.Quit();
  };

  const isMac = platform === "darwin";

  return (
    <>
      <header
        id="titlebar"
        onDoubleClick={showMaximize ? handleMaximizeToggle : undefined}
        style={{ "--wails-draggable": "drag" } as React.CSSProperties}
        className={cn(
          "relative flex h-10 shrink-0 items-center justify-between",
          !isMac && "pl-3",
          "border-b border-border/60 bg-background/95 backdrop-blur-sm",
          "select-none overflow-hidden z-51",
          className,
        )}
      >
        {/* ── Left: platform controls (mac) + sidebar toggle + brand ── */}
        <div
          className="flex items-center gap-1.5 h-full"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {isMac && (
            <WindowControls
              platform={platform}
              isMaximized={isMaximized}
              onMinimize={handleMinimize}
              onMaximizeToggle={handleMaximizeToggle}
              onClose={handleClose}
              showMinimize={showMinimize}
              showMaximize={showMaximize}
              showClose={showClose}
            />
          )}

          {onToggleLeftSidebar && (
            <LeftSidebarToggle
              open={leftSidebarOpen}
              onToggle={onToggleLeftSidebar}
            />
          )}

          <div
            style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
          >
            <AppBrand />
          </div>
        </div>

        {/* ── Center: active profile label (absolutely centered) ── */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ActiveProfileLabel />
        </div>

        {/* ── Right: toolbar + platform controls (win/linux) ── */}
        <div
          className="flex items-center h-full"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {
            showRightToolbar && (<RightToolbar
            onOpenSettings={() => setSettingsOpen(true)}
            rightSidebarOpen={rightSidebarOpen}
            onToggleRightSidebar={onToggleRightSidebar}
          />)
          }

          {!isMac && (
            <WindowControls
              platform={platform}
              isMaximized={isMaximized}
              onMinimize={handleMinimize}
              onMaximizeToggle={handleMaximizeToggle}
              onClose={handleClose}
              showMinimize={showMinimize}
              showMaximize={showMaximize}
              showClose={showClose}
            />
          )}
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
