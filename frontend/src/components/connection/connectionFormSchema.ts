import { z } from "zod";
import type { Profile } from "@/store";

// =============================================================================
// Constants
// =============================================================================

export const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"] as const;
export const DRIVERS = ["postgres", "mysql"] as const;
export const DEFAULT_PORTS: Record<string, number> = { postgres: 5432, mysql: 3306 };

/** 16 preset tag colors. Index 0 is the default. */
export const TAG_COLORS = [
  { label: "Gray",    value: "#6B7280" },
  { label: "Stone",   value: "#78716C" },
  { label: "Red",     value: "#EF4444" },
  { label: "Orange",  value: "#F97316" },
  { label: "Amber",   value: "#F59E0B" },
  { label: "Yellow",  value: "#EAB308" },
  { label: "Lime",    value: "#84CC16" },
  { label: "Green",   value: "#22C55E" },
  { label: "Emerald", value: "#10B981" },
  { label: "Teal",    value: "#14B8A6" },
  { label: "Cyan",    value: "#06B6D4" },
  { label: "Sky",     value: "#0EA5E9" },
  { label: "Blue",    value: "#3B82F6" },
  { label: "Indigo",  value: "#6366F1" },
  { label: "Violet",  value: "#8B5CF6" },
  { label: "Pink",    value: "#EC4899" },
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLORS[0].value;
export const DEFAULT_TAG = { name: "Default", color: DEFAULT_TAG_COLOR };

// =============================================================================
// Zod schema
// =============================================================================

const tagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
});

export const connectionSchema = z.object({
  driver: z.enum(DRIVERS),
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number({ error: "Port must be a number" }).int().min(1).max(65535),
  user: z.string().min(1, "User is required"),
  password: z.string(),
  database: z.string().min(1, "Database is required"),
  sslMode: z.enum(SSL_MODES),
  tag: tagSchema,
});

export type ConnectionFormValues = z.infer<typeof connectionSchema>;

// =============================================================================
// Default values
// =============================================================================

export const DEFAULT_FORM_VALUES: ConnectionFormValues = {
  driver: "postgres",
  name: "",
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "postgres",
  sslMode: "disable",
  tag: DEFAULT_TAG,
};

// =============================================================================
// Helpers
// =============================================================================

export function profileToForm(p: Profile): ConnectionFormValues {
  return {
    driver: (DRIVERS as readonly string[]).includes(p.driver)
      ? (p.driver as ConnectionFormValues["driver"])
      : "postgres",
    name: p.name,
    host: p.host,
    port: p.port,
    user: p.user,
    password: p.password,
    database: p.database,
    sslMode: (SSL_MODES as readonly string[]).includes(p.sslMode)
      ? (p.sslMode as ConnectionFormValues["sslMode"])
      : "disable",
    tag: p.tag?.name
      ? { name: p.tag.name, color: p.tag.color || DEFAULT_TAG_COLOR }
      : DEFAULT_TAG,
  };
}

export function formToProfile(
  values: ConnectionFormValues,
  id = "",
): Omit<Profile, "id"> & { id: string } {
  return {
    id,
    driver: values.driver,
    name: values.name,
    host: values.host,
    port: values.port,
    user: values.user,
    password: values.password,
    database: values.database,
    sslMode: values.sslMode,
    tag: values.tag,
  };
}
