import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Window } from "@wailsio/runtime";
import { TitleBar } from "@/components/layout/TitleBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  PlusSignIcon,
  RefreshIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { useDBStore } from "@/store";
import type { Profile } from "@/store";
import { cn } from "@/lib/utils";

const STARTUP_DRIVERS = ["postgres", "mysql"] as const;
const STARTUP_DEFAULT_PORTS: Record<string, number> = { postgres: 5432, mysql: 3306 };

const startupConnectionSchema = z.object({
  driver: z.enum(STARTUP_DRIVERS),
  name: z.string().min(1, "Bắt buộc"),
  host: z.string().min(1, "Bắt buộc"),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1, "Bắt buộc"),
  password: z.string(),
  database: z.string().min(1, "Bắt buộc"),
  sslMode: z.string(),
});

type StartupFormValues = z.infer<typeof startupConnectionSchema>;

export function StartupWindow() {
  const { 
    profiles: { data: profilesData, status: profilesStatus }, 
    loadProfiles, saveProfile, connect, setActiveProfile, openMainWindow, 
    activeConnections, connectingIds 
  } = useDBStore();
  const profiles = profilesData ?? [];
  
  const [saving, setSaving] = useState(false);
  
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<StartupFormValues>({
    resolver: zodResolver(startupConnectionSchema),
    defaultValues: { driver: "postgres", host: "localhost", port: 5432, sslMode: "disable" },
  });

  const selectedDriver = watch("driver");

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { setValue("port", STARTUP_DEFAULT_PORTS[selectedDriver]); }, [selectedDriver, setValue]);

  const handleClose = async () => {
    await openMainWindow();
    await Window.Close();
  };

  const onSubmit = async (values: StartupFormValues) => {
    setSaving(true);
    try {
      const saved = await saveProfile({ ...values, id: "" });
      await connect(saved.id);
      setActiveProfile(saved.id);
      await handleClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen w-screen bg-background text-foreground antialiased">
      <TitleBar onClose={() => void Window.Close()} showMaximize={false} showRightToolbar={false} showCenterDropdown={false} />

      {/* Body */}
      <div className="flex overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-72 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Connections
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={() => loadProfiles()} className="h-6 w-6 text-muted-foreground">
            {profilesStatus === "loading" ? <Spinner className="size-3" /> : <HugeiconsIcon icon={RefreshIcon} size={14} />}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {profiles.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No saved profiles</div>
          ) : (
            profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => connect(p.id).then(handleClose)}
                className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-all"
              >
                <div 
                  className={cn(
                    "size-2 rounded-full", 
                    activeConnections.has(p.id) 
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                      : "bg-muted-foreground/40"
                  )} 
                />
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground uppercase">{p.driver} • {p.host}</p>
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button variant="outline" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleClose}>
            <HugeiconsIcon icon={Settings02Icon} size={14} />
            Workspace settings
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">New Connection</h1>
            <p className="text-sm text-muted-foreground">Setup your database credentials to get started.</p>
          </header>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Type & Name */}
              <div className="col-span-1 space-y-2">
                <Label>Database Type</Label>
                <Controller
                  name="driver"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STARTUP_DRIVERS.map(d => (
                          <SelectItem key={d} value={d}>{d === 'postgres' ? 'PostgreSQL' : 'MySQL'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>Profile Name</Label>
                <Input {...register("name")} placeholder="e.g. Production" />
                {errors.name && <span className="text-[10px] text-destructive">{errors.name.message}</span>}
              </div>

              {/* Host & Port */}
              <div className="col-span-1 space-y-2">
                <Label>Host</Label>
                <Input {...register("host")} placeholder="127.0.0.1" />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>Port</Label>
                <Input type="number" {...register("port", { valueAsNumber: true })} />
              </div>

              {/* User & Password */}
              <div className="col-span-1 space-y-2">
                <Label>User</Label>
                <Input {...register("user")} />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>Password</Label>
                <Input type="password" {...register("password")} placeholder="••••••••" />
              </div>

              {/* Database & SSL */}
              <div className="col-span-1 space-y-2">
                <Label>Database Name</Label>
                <Input {...register("database")} />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>SSL Mode</Label>
                <Controller
                  name="sslMode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["disable", "require", "verify-ca", "verify-full"].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="ghost" onClick={handleClose} className="text-muted-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} >
                Connect & Save
              </Button>
            </div>
          </form>
        </div>
      </main>
      </div>
    </div>
  );
}