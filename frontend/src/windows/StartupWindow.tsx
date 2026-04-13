import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Window } from "@wailsio/runtime";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowRight01Icon,
  DatabaseIcon,
  FloppyDiskIcon,
  Login01Icon,
  RefreshIcon,
  Settings02Icon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";

import { TitleBar } from "@/components/layout/TitleBar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";

import { TestConnection } from "../../bindings/github.com/thtn-dev/table_stack/app";
import { useDBStore } from "@/store";
import type { Profile } from "@/store";
import { cn } from "@/lib/utils";

import {
  connectionSchema,
  DEFAULT_FORM_VALUES,
  DEFAULT_TAG_COLOR,
  profileToForm,
  formToProfile,
} from "@/components/connection/connectionFormSchema";
import type { ConnectionFormValues } from "@/components/connection/connectionFormSchema";
import {
  ConnectionFormFields,
  TestBanner,
} from "@/components/connection/ConnectionFormFields";
import type { TestStatus } from "@/components/connection/ConnectionFormFields";

// =============================================================================
// ProfileListItem
// =============================================================================

interface ProfileListItemProps {
  profile: Profile;
  isSelected: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onClick: () => void;
}

function ProfileListItem({
  profile,
  isSelected,
  isConnected,
  isConnecting,
  onClick,
}: ProfileListItemProps) {
  const tagColor = profile.tag?.color || DEFAULT_TAG_COLOR;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
        "hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-accent text-accent-foreground ring-1 ring-border",
      )}
    >
      {/* Tag color + connection status */}
      <div className="relative shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ backgroundColor: `${tagColor}20` }}
        >
          <HugeiconsIcon icon={DatabaseIcon} size={15} style={{ color: tagColor }} />
        </div>
        {/* Connection dot */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-background",
            isConnected
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
              : "bg-muted-foreground/30",
          )}
        />
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm"
            style={{ backgroundColor: tagColor }}
          />
          <p className="truncate text-sm font-medium">{profile.name}</p>
        </div>
        <p className="truncate text-[10px] uppercase text-muted-foreground">
          {profile.driver} · {profile.host}
        </p>
      </div>

      {/* Right: spinner or chevron */}
      <div className="shrink-0 text-muted-foreground">
        {isConnecting ? (
          <Spinner className="size-3.5" />
        ) : (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={13}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
    </button>
  );
}

// =============================================================================
// StartupWindow
// =============================================================================

export function StartupWindow() {
  const {
    profiles: { data: profilesData, status: profilesStatus },
    loadProfiles,
    saveProfile,
    connect,
    setActiveProfile,
    openMainWindow,
    activeConnections,
    connectingIds,
  } = useDBStore();
  const profiles = profilesData ?? [];

  // Which profile is selected for editing (null = new connection form)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);

  const isEditMode = Boolean(selectedProfile?.id);

  const { register, control, handleSubmit, reset, getValues, setValue, watch, formState: { errors } } =
    useForm<ConnectionFormValues>({
      resolver: zodResolver(connectionSchema),
      defaultValues: DEFAULT_FORM_VALUES,
    });

  const watchedDriver = watch("driver");
  const tagColor = watch("tag.color");

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Auto-update port when driver changes on new connection forms
  useEffect(() => {
    if (!selectedProfile) {
      const ports: Record<string, number> = { postgres: 5432, mysql: 3306 };
      setValue("port", ports[watchedDriver] ?? 5432);
    }
  }, [watchedDriver, selectedProfile, setValue]);

  const resetToNew = useCallback(() => {
    setSelectedProfile(null);
    reset(DEFAULT_FORM_VALUES);
    setTestStatus("idle");
    setTestMessage("");
    setConnectError(null);
  }, [reset]);

  const handleSelectProfile = useCallback(
    (profile: Profile) => {
      setSelectedProfile(profile);
      reset(profileToForm(profile));
      setTestStatus("idle");
      setTestMessage("");
      setConnectError(null);
    },
    [reset],
  );

  const handleClose = useCallback(async () => {
    await openMainWindow();
    await Window.Close();
  }, [openMainWindow]);

  // ── Test connection ─────────────────────────────────────────────────────────

  const handleTest = async () => {
    const values = getValues();
    setTestStatus("testing");
    setTestMessage("");
    try {
      const result = await TestConnection(formToProfile(values, selectedProfile?.id ?? ""));
      if (result.success) {
        setTestStatus("success");
        setTestMessage(result.version ? `Connected · ${result.version}` : result.message || "Connection successful");
      } else {
        setTestStatus("error");
        setTestMessage(result.message || "Connection failed");
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(String(err));
    }
  };

  // ── Save (no connect) ───────────────────────────────────────────────────────

  const handleSave = handleSubmit(async (values) => {
    setSaving(true);
    setConnectError(null);
    try {
      const saved = await saveProfile(formToProfile(values, selectedProfile?.id ?? ""));
      // Update selection to the saved profile (gets the server-assigned ID on create)
      handleSelectProfile(saved);
      await loadProfiles();
    } catch (err) {
      setConnectError(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  });

  // ── Save + Connect ──────────────────────────────────────────────────────────

  const handleConnect = handleSubmit(async (values) => {
    setConnecting(true);
    setConnectError(null);
    try {
      const saved = await saveProfile(formToProfile(values, selectedProfile?.id ?? ""));
      await connect(saved.id);
      setActiveProfile(saved.id);
      await handleClose();
    } catch (err) {
      setConnectError(String(err));
    } finally {
      setConnecting(false);
    }
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen w-screen bg-background text-foreground antialiased">
      <TitleBar
        onClose={() => void Window.Close()}
        showMaximize={false}
        showRightToolbar={false}
        showCenterDropdown={false}
      />

      <div className="flex overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/30">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Saved Connections
            </h2>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => loadProfiles()}
                className="h-6 w-6 text-muted-foreground"
                title="Refresh"
              >
                {profilesStatus === "loading" ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} size={13} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={resetToNew}
                className="h-6 w-6 text-muted-foreground"
                title="New connection"
              >
                <HugeiconsIcon icon={Add01Icon} size={13} />
              </Button>
            </div>
          </div>

          {/* Profile list */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-0.5">
              {profiles.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No saved connections
                </div>
              ) : (
                profiles.map((p) => (
                  <ProfileListItem
                    key={p.id}
                    profile={p}
                    isSelected={selectedProfile?.id === p.id}
                    isConnected={activeConnections.has(p.id)}
                    isConnecting={connectingIds.has(p.id)}
                    onClick={() => handleSelectProfile(p)}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-3 border-t border-border">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={handleClose}
            >
              <HugeiconsIcon icon={Settings02Icon} size={13} />
              Open workspace
            </Button>
          </div>
        </aside>

        {/* ── Main panel ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-6 py-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200"
              style={{ backgroundColor: `${tagColor}20` }}
            >
              <HugeiconsIcon icon={DatabaseIcon} size={16} style={{ color: tagColor }} />
            </div>
            <div>
              <h1 className="text-sm font-semibold">
                {isEditMode ? `Edit: ${selectedProfile!.name}` : "New Connection"}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {isEditMode
                  ? "Update settings then connect or save."
                  : "Fill in your credentials to connect."}
              </p>
            </div>
          </div>

          {/* Scrollable form area */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-5">
              <form
                id="startup-connection-form"
                onSubmit={(e) => e.preventDefault()}
                noValidate
                className="flex flex-col gap-3 max-w-xl"
              >
                <ConnectionFormFields
                  register={register}
                  control={control}
                  errors={errors}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((v) => !v)}
                  idPrefix="startup"
                />

                <TestBanner status={testStatus} message={testMessage} />

                {connectError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <HugeiconsIcon
                      icon={DatabaseIcon}
                      size={13}
                      className="mt-px shrink-0 opacity-70"
                    />
                    <span className="break-all">{connectError}</span>
                  </div>
                )}
              </form>
            </div>
          </ScrollArea>

          {/* Footer actions */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
            {/* Test — left */}
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testStatus === "testing" || saving || connecting}
              className="gap-1.5"
            >
              {testStatus === "testing" ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={TestTube01Icon} size={14} />
              )}
              Test
            </Button>

            {/* Save + Connect — right */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSave}
                disabled={saving || connecting}
                className="gap-1.5"
              >
                {saving ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
                )}
                {isEditMode ? "Update" : "Save"}
              </Button>

              <Button
                type="button"
                onClick={handleConnect}
                disabled={saving || connecting}
                className="gap-1.5"
              >
                {connecting ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <HugeiconsIcon icon={Login01Icon} size={14} />
                )}
                {isEditMode ? "Reconnect" : "Connect & Save"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
