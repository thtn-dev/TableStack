import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Window } from "@wailsio/runtime";
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
  AlertCircleIcon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  DatabaseIcon,
  FloppyDiskIcon,
  Login01Icon,
  RefreshIcon,
  Table01Icon,
} from "@hugeicons/core-free-icons";
import { useDBStore } from "@/store";
import type { Profile } from "@/store";
import { cn } from "@/lib/utils";

const STARTUP_SSL_MODES = [
  "disable",
  "require",
  "verify-ca",
  "verify-full",
] as const;
const STARTUP_DRIVERS = ["postgres", "mysql"] as const;
const STARTUP_DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
};

const startupConnectionSchema = z.object({
  driver: z.enum(STARTUP_DRIVERS),
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number({ error: "Port must be a number" }).int().min(1).max(65535),
  user: z.string().min(1, "User is required"),
  password: z.string(),
  database: z.string().min(1, "Database is required"),
  sslMode: z.enum(STARTUP_SSL_MODES),
});

type StartupFormValues = z.infer<typeof startupConnectionSchema>;

const STARTUP_DEFAULT_VALUES: StartupFormValues = {
  driver: "postgres",
  name: "",
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "postgres",
  sslMode: "disable",
};

const DRIVER_META: Record<
  StartupFormValues["driver"],
  {
    label: string;
    icon: typeof DatabaseIcon;
    ringClass: string;
    tintClass: string;
  }
> = {
  postgres: {
    label: "PostgreSQL",
    icon: DatabaseIcon,
    ringClass: "ring-sky-300/35",
    tintClass: "text-sky-100",
  },
  mysql: {
    label: "MySQL",
    icon: Table01Icon,
    ringClass: "ring-amber-300/35",
    tintClass: "text-amber-100",
  },
};

interface StartupFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function StartupField({
  label,
  htmlFor,
  error,
  required,
  children,
}: StartupFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-slate-100/90">
        {label}
        {required && <span className="ml-0.5 text-rose-300">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[11px] text-rose-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function StartupWindow() {
  const profilesData = useDBStore((s) => s.profiles.data);
  const profilesStatus = useDBStore((s) => s.profiles.status);
  const activeConnectionsKey = useDBStore((s) =>
    [...s.activeConnections].sort().join(","),
  );
  const connectingIdsKey = useDBStore((s) =>
    [...s.connectingIds].sort().join(","),
  );
  const loadProfiles = useDBStore((s) => s.loadProfiles);
  const saveProfile = useDBStore((s) => s.saveProfile);
  const connect = useDBStore((s) => s.connect);
  const setActiveProfile = useDBStore((s) => s.setActiveProfile);

  const profiles = profilesData ?? [];
  const activeConnections = activeConnectionsKey
    ? new Set(activeConnectionsKey.split(",").filter(Boolean))
    : new Set<string>();
  const connectingIds = connectingIdsKey
    ? new Set(connectingIdsKey.split(",").filter(Boolean))
    : new Set<string>();

  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [connectMessage, setConnectMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const {
    register,
    control,
    reset,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<StartupFormValues>({
    resolver: zodResolver(startupConnectionSchema),
    defaultValues: STARTUP_DEFAULT_VALUES,
  });

  const selectedDriver = watch("driver");
  const currentDriver = selectedDriver ?? STARTUP_DEFAULT_VALUES.driver;
  const driverMeta = DRIVER_META[currentDriver];
  const WatermarkIcon = driverMeta.icon;

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    setValue("port", STARTUP_DEFAULT_PORTS[currentDriver] ?? 5432);
  }, [currentDriver, setValue]);

  const handleClose = () => {
    void Window.Close();
  };

  const handleConnect = async (profile: Profile) => {
    setConnectMessage(null);

    if (activeConnections.has(profile.id)) {
      setActiveProfile(profile.id);
      handleClose();
      return;
    }

    try {
      await connect(profile.id);
      setActiveProfile(profile.id);
      handleClose();
    } catch (err) {
      setConnectMessage({
        type: "error",
        text: `Failed to connect ${profile.name}: ${String(err)}`,
      });
    }
  };

  const onSubmit = async (values: StartupFormValues) => {
    setSaving(true);
    setFormMessage(null);

    try {
      const saved = await saveProfile({
        id: "",
        driver: values.driver,
        name: values.name,
        host: values.host,
        port: values.port,
        user: values.user,
        password: values.password,
        database: values.database,
        sslMode: values.sslMode,
      });

      await connect(saved.id);
      setActiveProfile(saved.id);

      setFormMessage({
        type: "success",
        text: "Connection profile saved and connected successfully.",
      });
      handleClose();
    } catch (err) {
      setFormMessage({
        type: "error",
        text: `Unable to save/connect profile: ${String(err)}`,
      });
      reset({
        ...STARTUP_DEFAULT_VALUES,
        driver: values.driver,
        port: STARTUP_DEFAULT_PORTS[values.driver],
      });
      await loadProfiles();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-cyan-900 text-slate-100">
      <main className="relative flex h-full w-full items-center justify-center p-4 md:p-6">
        <div className="pointer-events-none absolute -top-24 -left-10 size-72 rounded-full bg-sky-200/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 size-80 rounded-full bg-cyan-200/15 blur-3xl" />

        <section className="relative grid h-full w-full max-w-6xl grid-rows-[auto_1fr_auto] gap-3 rounded-3xl border border-white/12 bg-slate-950/45 p-3 shadow-2xl backdrop-blur-md md:h-[92vh] md:grid-rows-[auto_1fr] md:p-4">
          <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl bg-sky-500/20 ring-1",
                  driverMeta.ringClass,
                )}
              >
                <HugeiconsIcon
                  icon={driverMeta.icon}
                  size={18}
                  className={driverMeta.tintClass}
                />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">TableStack</h1>
                <p className="text-xs text-slate-300/80">
                  Quick setup for {driverMeta.label}
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleClose}
              variant="outline"
              className="border-white/20 bg-slate-900/50 text-slate-100 hover:bg-slate-800"
            >
              Continue to Workspace
            </Button>
          </header>

          <div className="grid min-h-0 gap-3 md:grid-cols-[320px_1fr]">
            <aside className="flex min-h-0 flex-col rounded-2xl border border-white/12 bg-slate-900/55">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-300/70">
                    Saved Connections
                  </p>
                  <p className="text-[11px] text-slate-400/80">
                    Connect instantly from your profiles
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={() => loadProfiles()}
                  disabled={profilesStatus === "loading"}
                  aria-label="Refresh saved profiles"
                >
                  {profilesStatus === "loading" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <HugeiconsIcon icon={RefreshIcon} size={14} />
                  )}
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {profiles.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-6 text-center">
                    <HugeiconsIcon
                      icon={DatabaseIcon}
                      size={22}
                      className="text-slate-400/40"
                    />
                    <p className="text-xs text-slate-300/85">
                      No saved connections yet.
                    </p>
                    <p className="text-[11px] text-slate-400/80">
                      Create one from the form on the right.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {profiles.map((profile) => {
                      const isConnected = activeConnections.has(profile.id);
                      const isConnecting = connectingIds.has(profile.id);

                      return (
                        <button
                          key={profile.id}
                          type="button"
                          className={cn(
                            "group flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors",
                            isConnected
                              ? "border-emerald-300/40 bg-emerald-400/10"
                              : "border-white/10 bg-white/3 hover:bg-white/6",
                          )}
                          onClick={() => {
                            if (isConnected || !isConnecting) {
                              void handleConnect(profile);
                            }
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                isConnected ? "bg-emerald-300" : "bg-slate-500",
                              )}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-100">
                                {profile.name}
                              </p>
                              <p className="truncate text-[11px] text-slate-400/90">
                                {profile.driver.toUpperCase()} - {profile.host}:{profile.port}
                              </p>
                            </div>
                          </div>

                          <span className="flex shrink-0 items-center">
                            {isConnecting ? (
                              <Spinner className="size-3.5 text-slate-200" />
                            ) : isConnected ? (
                              <HugeiconsIcon
                                icon={CheckmarkCircle01Icon}
                                size={15}
                                className="text-emerald-300"
                              />
                            ) : (
                              <HugeiconsIcon
                                icon={ArrowRight01Icon}
                                size={14}
                                className="text-slate-300/70 transition-transform group-hover:translate-x-0.5"
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {connectMessage && (
                <div
                  className={cn(
                    "m-2 rounded-lg border px-2.5 py-2 text-[11px]",
                    connectMessage.type === "success"
                      ? "border-emerald-300/35 bg-emerald-500/10 text-emerald-100"
                      : "border-rose-300/35 bg-rose-500/10 text-rose-100",
                  )}
                  role="status"
                >
                  {connectMessage.text}
                </div>
              )}
            </aside>

            <section className="relative min-h-0 overflow-hidden rounded-2xl border border-white/12 bg-slate-900/60">
              <div className="pointer-events-none absolute inset-0">
                <HugeiconsIcon
                  icon={WatermarkIcon}
                  size={240}
                  className="absolute -bottom-12 -right-8 text-white/5 blur-[1px]"
                />
                <div className="absolute -bottom-12 left-1/3 size-56 rounded-full bg-sky-200/10 blur-3xl" />
              </div>

              <div className="relative z-10 h-full overflow-y-auto px-4 py-4 md:px-5">
                <div className="mb-4 flex items-center gap-2">
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg bg-white/8 ring-1",
                      driverMeta.ringClass,
                    )}
                  >
                    <HugeiconsIcon
                      icon={driverMeta.icon}
                      size={15}
                      className={driverMeta.tintClass}
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">
                      Create New Connection
                    </h2>
                    <p className="text-xs text-slate-300/80">
                      Fill in database settings. The icon updates when you change type.
                    </p>
                  </div>
                </div>

                <form
                  className="grid grid-cols-1 gap-3 md:grid-cols-2"
                  onSubmit={handleSubmit(onSubmit)}
                  noValidate
                >
                  <StartupField
                    label="Database Type"
                    htmlFor="startup-driver"
                    required
                    error={errors.driver?.message}
                  >
                    <Controller
                      name="driver"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger
                            id="startup-driver"
                            className="border-white/20 bg-slate-950/60 text-slate-100"
                          >
                            <SelectValue placeholder="Select database" />
                          </SelectTrigger>
                          <SelectContent>
                            {STARTUP_DRIVERS.map((driver) => (
                              <SelectItem key={driver} value={driver}>
                                {DRIVER_META[driver].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </StartupField>

                  <StartupField
                    label="Connection Name"
                    htmlFor="startup-name"
                    required
                    error={errors.name?.message}
                  >
                    <Input
                      id="startup-name"
                      placeholder="Production DB"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.name)}
                      {...register("name")}
                    />
                  </StartupField>

                  <StartupField
                    label="Host"
                    htmlFor="startup-host"
                    required
                    error={errors.host?.message}
                  >
                    <Input
                      id="startup-host"
                      placeholder="localhost"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.host)}
                      {...register("host")}
                    />
                  </StartupField>

                  <StartupField
                    label="Port"
                    htmlFor="startup-port"
                    required
                    error={errors.port?.message}
                  >
                    <Input
                      id="startup-port"
                      type="number"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.port)}
                      {...register("port", { valueAsNumber: true })}
                    />
                  </StartupField>

                  <StartupField
                    label="User"
                    htmlFor="startup-user"
                    required
                    error={errors.user?.message}
                  >
                    <Input
                      id="startup-user"
                      placeholder="postgres"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.user)}
                      {...register("user")}
                    />
                  </StartupField>

                  <StartupField
                    label="Password"
                    htmlFor="startup-password"
                    error={errors.password?.message}
                  >
                    <Input
                      id="startup-password"
                      type="password"
                      placeholder="Optional"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.password)}
                      {...register("password")}
                    />
                  </StartupField>

                  <StartupField
                    label="Database"
                    htmlFor="startup-database"
                    required
                    error={errors.database?.message}
                  >
                    <Input
                      id="startup-database"
                      placeholder="postgres"
                      className="border-white/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-400"
                      aria-invalid={Boolean(errors.database)}
                      {...register("database")}
                    />
                  </StartupField>

                  <StartupField
                    label="SSL Mode"
                    htmlFor="startup-ssl"
                    error={errors.sslMode?.message}
                  >
                    <Controller
                      name="sslMode"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger
                            id="startup-ssl"
                            className="border-white/20 bg-slate-950/60 text-slate-100"
                          >
                            <SelectValue placeholder="Select SSL mode" />
                          </SelectTrigger>
                          <SelectContent>
                            {STARTUP_SSL_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {mode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </StartupField>

                  <div className="md:col-span-2 flex items-center justify-between gap-3 pt-1">
                    <div className="min-h-5">
                      {formMessage && (
                        <p
                          className={cn(
                            "text-xs",
                            formMessage.type === "success"
                              ? "text-emerald-200"
                              : "text-rose-200",
                          )}
                          role="status"
                        >
                          {formMessage.type === "error" && (
                            <HugeiconsIcon
                              icon={AlertCircleIcon}
                              size={13}
                              className="mr-1 inline"
                            />
                          )}
                          {formMessage.type === "success" && (
                            <HugeiconsIcon
                              icon={CheckmarkCircle01Icon}
                              size={13}
                              className="mr-1 inline"
                            />
                          )}
                          {formMessage.text}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/20 bg-slate-900/50 text-slate-100 hover:bg-slate-800"
                        onClick={handleClose}
                      >
                        Later
                      </Button>
                      <Button
                        type="submit"
                        disabled={saving}
                        className="gap-1.5 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                      >
                        {saving ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
                        )}
                        Save Connection
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </section>
          </div>

          <footer className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/45 px-4 py-2 text-[11px] text-slate-300/85 md:hidden">
            <span>Tap a saved connection to connect quickly.</span>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 bg-sky-300 text-slate-950 hover:bg-sky-200"
              onClick={handleClose}
            >
              <HugeiconsIcon icon={Login01Icon} size={13} />
              Continue
            </Button>
          </footer>
        </section>
      </main>
    </div>
  );
}
