import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DatabaseIcon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  FloppyDiskIcon,
  TestTube01Icon,
  EyeIcon,
  EyeOff,
} from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

import { TestConnection } from "../../../bindings/github.com/thtn-dev/table_stack/app";
import { useDBStore } from "@/store";
import type { Profile } from "@/store";
import { cn } from "@/lib/utils";

// =============================================================================
// Schema
// =============================================================================

const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"] as const;

const connectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number({ error: "Port must be a number" }).int().min(1).max(65535),
  user: z.string().min(1, "User is required"),
  password: z.string(),
  database: z.string().min(1, "Database is required"),
  sslMode: z.enum(SSL_MODES),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;

// =============================================================================
// Default values
// =============================================================================

const DEFAULT_VALUES: ConnectionFormValues = {
  name: "",
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "postgres",
  sslMode: "disable",
};

function profileToForm(p: Profile): ConnectionFormValues {
  return {
    name: p.name,
    host: p.host,
    port: p.port,
    user: p.user,
    password: p.password,
    database: p.database,
    sslMode: (SSL_MODES as readonly string[]).includes(p.sslMode)
      ? (p.sslMode as ConnectionFormValues["sslMode"])
      : "disable",
  };
}

// =============================================================================
// Test result banner
// =============================================================================

type TestStatus = "idle" | "testing" | "success" | "error";

interface TestBannerProps {
  status: TestStatus;
  message: string;
}

function TestBanner({ status, message }: TestBannerProps) {
  if (status === "idle") return null;

  if (status === "testing") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        <span>Testing connection…</span>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={14}
          className="mt-px shrink-0"
        />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive dark:text-destructive">
      <HugeiconsIcon
        icon={AlertCircleIcon}
        size={14}
        className="mt-px shrink-0"
      />
      <span>{message}</span>
    </div>
  );
}

// =============================================================================
// Field helpers
// =============================================================================

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing profile to edit it; undefined = new profile */
  editProfile?: Profile;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  editProfile,
}: ConnectionDialogProps) {
  const saveProfile = useDBStore((s) => s.saveProfile);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEditMode = Boolean(editProfile?.id);

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: editProfile ? profileToForm(editProfile) : DEFAULT_VALUES,
  });

  // Reset form when dialog opens/closes or profile changes
  useEffect(() => {
    if (open) {
      reset(editProfile ? profileToForm(editProfile) : DEFAULT_VALUES);
      setTestStatus("idle");
      setTestMessage("");
    }
  }, [open, editProfile, reset]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTest = async () => {
    const values = getValues();
    setTestStatus("testing");
    setTestMessage("");

    try {
      const result = await TestConnection({
        id: editProfile?.id ?? "",
        name: values.name,
        host: values.host,
        port: values.port,
        user: values.user,
        password: values.password,
        database: values.database,
        sslMode: values.sslMode,
      });

      if (result.success) {
        setTestStatus("success");
        setTestMessage(
          result.version
            ? `Connected · ${result.version}`
            : result.message || "Connection successful",
        );
      } else {
        setTestStatus("error");
        setTestMessage(result.message || "Connection failed");
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(String(err));
    }
  };

  const onSubmit = async (values: ConnectionFormValues) => {
    setIsSaving(true);
    try {
      await saveProfile({
        id: editProfile?.id ?? "",
        name: values.name,
        host: values.host,
        port: values.port,
        user: values.user,
        password: values.password,
        database: values.database,
        sslMode: values.sslMode,
      });
      onOpenChange(false);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(`Failed to save: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <HugeiconsIcon
                icon={DatabaseIcon}
                size={15}
                className="text-primary"
              />
            </div>
            <div>
              <DialogTitle>
                {isEditMode ? "Edit Connection" : "New Connection"}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {isEditMode
                  ? "Update your PostgreSQL connection settings."
                  : "Configure a new PostgreSQL connection."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Form body */}
        <form id="connection-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-3 px-4 py-4">
            {/* Connection name */}
            <Field
              label="Connection Name"
              htmlFor="conn-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="conn-name"
                placeholder="My PostgreSQL"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
            </Field>

            {/* Host + Port */}
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field
                label="Host"
                htmlFor="conn-host"
                error={errors.host?.message}
                required
              >
                <Input
                  id="conn-host"
                  placeholder="localhost"
                  aria-invalid={Boolean(errors.host)}
                  {...register("host")}
                />
              </Field>

              <Field
                label="Port"
                htmlFor="conn-port"
                error={errors.port?.message}
                required
              >
                <Input
                  id="conn-port"
                  type="number"
                  placeholder="5432"
                  aria-invalid={Boolean(errors.port)}
                  {...register("port", { valueAsNumber: true })}
                />
              </Field>
            </div>

            {/* User + Password */}
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="User"
                htmlFor="conn-user"
                error={errors.user?.message}
                required
              >
                <Input
                  id="conn-user"
                  placeholder="postgres"
                  autoComplete="username"
                  aria-invalid={Boolean(errors.user)}
                  {...register("user")}
                />
              </Field>

              <Field
                label="Password"
                htmlFor="conn-password"
                error={errors.password?.message}
              >
                <div className="relative">
                  <Input
                    id="conn-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-8"
                    aria-invalid={Boolean(errors.password)}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((v) => !v)}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2",
                      "text-muted-foreground hover:text-foreground transition-colors",
                    )}
                  >
                    <HugeiconsIcon
                      icon={showPassword ? EyeOff : EyeIcon}
                      size={13}
                    />
                  </button>
                </div>
              </Field>
            </div>

            {/* Database + SSL */}
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Database"
                htmlFor="conn-db"
                error={errors.database?.message}
                required
              >
                <Input
                  id="conn-db"
                  placeholder="postgres"
                  aria-invalid={Boolean(errors.database)}
                  {...register("database")}
                />
              </Field>

              <Field
                label="SSL Mode"
                htmlFor="conn-ssl"
                error={errors.sslMode?.message}
              >
                <Controller
                  name="sslMode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="conn-ssl"
                        className="w-full"
                        aria-invalid={Boolean(errors.sslMode)}
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SSL_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            {/* Test result banner */}
            <TestBanner status={testStatus} message={testMessage} />
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="px-4 pb-4 pt-0 flex flex-row items-center gap-2 sm:justify-between">
          {/* Test button — left-aligned */}
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testStatus === "testing" || isSaving}
            className="gap-1.5"
            id="btn-test-connection"
          >
            {testStatus === "testing" ? (
              <Spinner className="size-3.5" />
            ) : (
              <HugeiconsIcon icon={TestTube01Icon} size={14} />
            )}
            Test Connection
          </Button>

          {/* Save button — right-aligned */}
          <Button
            type="submit"
            form="connection-form"
            disabled={isSaving || testStatus === "testing"}
            className="gap-1.5"
            id="btn-save-connection"
          >
            {isSaving ? (
              <Spinner className="size-3.5" />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
            )}
            {isEditMode ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
