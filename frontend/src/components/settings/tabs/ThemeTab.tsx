import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useThemeStore, type Theme } from "@/hooks/useTheme";

interface ThemeOptionProps {
  value: Theme;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  current: Theme;
  onSelect: (theme: Theme) => void;
}

function ThemeOption({
  value,
  label,
  description,
  icon,
  current,
  onSelect,
}: ThemeOptionProps) {
  const isActive = current === value;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left transition-colors",
        isActive
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border/60 hover:border-border hover:bg-muted/50 text-foreground/70 hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </div>
      {isActive && (
        <span className="ml-auto text-[11px] font-semibold text-primary">Active</span>
      )}
    </button>
  );
}

export function ThemeTab() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">Appearance</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Choose how TableStack looks to you.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <ThemeOption
          value="light"
          label="Light"
          description="A clean, bright interface"
          icon={Sun01Icon}
          current={theme}
          onSelect={setTheme}
        />
        <ThemeOption
          value="dark"
          label="Dark"
          description="Easier on the eyes in low light"
          icon={Moon02Icon}
          current={theme}
          onSelect={setTheme}
        />
      </div>
    </div>
  );
}
