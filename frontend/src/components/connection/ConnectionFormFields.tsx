import { Controller, useWatch } from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  EyeIcon,
  EyeOff,
} from "@hugeicons/core-free-icons";

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
import { cn } from "@/lib/utils";

import {
  DRIVERS,
  SSL_MODES,
  TAG_COLORS,
} from "./connectionFormSchema";
import type { ConnectionFormValues } from "./connectionFormSchema";

// =============================================================================
// TestBanner
// =============================================================================

export type TestStatus = "idle" | "testing" | "success" | "error";

interface TestBannerProps {
  status: TestStatus;
  message: string;
}

export function TestBanner({ status, message }: TestBannerProps) {
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
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} className="mt-px shrink-0" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <HugeiconsIcon icon={AlertCircleIcon} size={14} className="mt-px shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// =============================================================================
// Field wrapper
// =============================================================================

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, required, children, className }: FieldProps) {
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
// TagPreviewChip — isolated so only this re-renders on tag.name/color changes
// =============================================================================

interface TagPreviewChipProps {
  control: Control<ConnectionFormValues>;
}

function TagPreviewChip({ control }: TagPreviewChipProps) {
  const tagColor = useWatch({ control, name: "tag.color" });
  const tagName = useWatch({ control, name: "tag.name" });

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white select-none"
      style={{ backgroundColor: tagColor }}
    >
      <span className="block h-1.5 w-1.5 rounded-full bg-white/60 shrink-0" />
      {tagName || "Default"}
    </span>
  );
}

// =============================================================================
// TagColorSwatches
// =============================================================================

interface TagColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
}

export function TagColorSwatches({ value, onChange }: TagColorSwatchesProps) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {TAG_COLORS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          title={preset.label}
          aria-label={preset.label}
          onClick={() => onChange(preset.value)}
          className={cn(
            "h-5 w-full rounded-sm transition-all duration-100",
            "ring-offset-background hover:scale-110 focus-visible:outline-none",
            value === preset.value && "ring-2 ring-offset-1 ring-foreground/50 scale-110",
          )}
          style={{ backgroundColor: preset.value }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// ConnectionFormFields — all form inputs, reusable across Dialog + StartupWindow
// =============================================================================

export interface ConnectionFormFieldsProps {
  register: UseFormRegister<ConnectionFormValues>;
  control: Control<ConnectionFormValues>;
  errors: FieldErrors<ConnectionFormValues>;
  showPassword: boolean;
  onTogglePassword: () => void;
  /** Unique prefix for input `id` attributes to avoid collisions when multiple forms exist. */
  idPrefix?: string;
}

export function ConnectionFormFields({
  register,
  control,
  errors,
  showPassword,
  onTogglePassword,
  idPrefix = "conn",
}: ConnectionFormFieldsProps) {
  const id = (key: string) => `${idPrefix}-${key}`;

  return (
    <>
      <Field label="Connection Name" htmlFor={id("name")} error={errors.name?.message} required>
        <Input
          id={id("name")}
          placeholder="My PostgreSQL"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
      </Field>

      {/* Driver */}
      <Field label="Database Type" htmlFor={id("driver")} error={errors.driver?.message} required>
        <Controller
          name="driver"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id("driver")} className="w-full" aria-invalid={Boolean(errors.driver)}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {DRIVERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === "postgres" ? "PostgreSQL" : "MySQL"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {/* Host + Port */}
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <Field label="Host" htmlFor={id("host")} error={errors.host?.message} required>
          <Input
            id={id("host")}
            placeholder="localhost"
            aria-invalid={Boolean(errors.host)}
            {...register("host")}
          />
        </Field>
        <Field label="Port" htmlFor={id("port")} error={errors.port?.message} required>
          <Input
            id={id("port")}
            type="number"
            placeholder="5432"
            aria-invalid={Boolean(errors.port)}
            {...register("port", { valueAsNumber: true })}
          />
        </Field>
      </div>

      {/* User + Password */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="User" htmlFor={id("user")} error={errors.user?.message} required>
          <Input
            id={id("user")}
            placeholder="root"
            autoComplete="username"
            aria-invalid={Boolean(errors.user)}
            {...register("user")}
          />
        </Field>
        <Field label="Password" htmlFor={id("password")} error={errors.password?.message}>
          <div className="relative">
            <Input
              id={id("password")}
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
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={onTogglePassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <HugeiconsIcon icon={showPassword ? EyeOff : EyeIcon} size={13} />
            </button>
          </div>
        </Field>
      </div>

      {/* Database + SSL */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Database" htmlFor={id("db")} error={errors.database?.message} required>
          <Input
            id={id("db")}
            placeholder="mydb"
            aria-invalid={Boolean(errors.database)}
            {...register("database")}
          />
        </Field>
        <Field label="SSL Mode" htmlFor={id("ssl")} error={errors.sslMode?.message}>
          <Controller
            name="sslMode"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("ssl")} className="w-full" aria-invalid={Boolean(errors.sslMode)}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {SSL_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      {/* Tag picker */}
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
            Tag
          </span>
          {/* Live preview chip */}
          <TagPreviewChip control={control} />
        </div>

        <Controller
          name="tag.color"
          control={control}
          render={({ field }) => (
            <TagColorSwatches value={field.value} onChange={field.onChange} />
          )}
        />

        <div className="flex flex-col gap-1">
          <Input
            id={id("tag-name")}
            placeholder="Tag name (e.g. Production)"
            className="h-7 text-xs"
            autoComplete="off"
            aria-invalid={Boolean(errors.tag?.name?.message)}
            {...register("tag.name")}
          />
          {errors.tag?.name?.message && (
            <p className="text-[11px] text-destructive" role="alert">
              {errors.tag.name.message}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
