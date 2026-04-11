import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon, FloppyDiskIcon, TestTube01Icon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { TestConnection } from "../../../bindings/github.com/thtn-dev/table_stack/app";
import { useDBStore } from "@/store";
import type { Profile } from "@/store";

import {
  connectionSchema,
  DEFAULT_FORM_VALUES,
  profileToForm,
  formToProfile,
} from "./connectionFormSchema";
import type { ConnectionFormValues } from "./connectionFormSchema";
import { ConnectionFormFields, TestBanner } from "./ConnectionFormFields";
import type { TestStatus } from "./ConnectionFormFields";

// =============================================================================
// ConnectionDialog
// =============================================================================

export interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing profile to edit it; undefined = new profile */
  editProfile?: Profile;
}

export function ConnectionDialog({ open, onOpenChange, editProfile }: ConnectionDialogProps) {
  const saveProfile = useDBStore((s) => s.saveProfile);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEditMode = Boolean(editProfile?.id);

  const { register, handleSubmit, control, reset, getValues, setValue, watch, formState: { errors } } =
    useForm<ConnectionFormValues>({
      resolver: zodResolver(connectionSchema),
      defaultValues: editProfile ? profileToForm(editProfile) : DEFAULT_FORM_VALUES,
    });

  const tagColor = watch("tag.color");

  // Reset when dialog opens / profile changes
  useEffect(() => {
    if (open) {
      reset(editProfile ? profileToForm(editProfile) : DEFAULT_FORM_VALUES);
      setTestStatus("idle");
      setTestMessage("");
    }
  }, [open, editProfile, reset]);

  // Auto-update port when driver changes (new profiles only)
  const watchedDriver = watch("driver");
  useEffect(() => {
    if (!editProfile) {
      const ports: Record<string, number> = { postgres: 5432, mysql: 3306 };
      setValue("port", ports[watchedDriver] ?? 5432);
    }
  }, [watchedDriver, editProfile, setValue]);

  const handleTest = async () => {
    const values = getValues();
    setTestStatus("testing");
    setTestMessage("");
    try {
      const result = await TestConnection(formToProfile(values, editProfile?.id ?? ""));
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

  const onSubmit = async (values: ConnectionFormValues) => {
    setIsSaving(true);
    try {
      await saveProfile(formToProfile(values, editProfile?.id ?? ""));
      onOpenChange(false);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(`Failed to save: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200"
              style={{ backgroundColor: `${tagColor}20` }}
            >
              <HugeiconsIcon icon={DatabaseIcon} size={15} style={{ color: tagColor }} />
            </div>
            <div>
              <DialogTitle>{isEditMode ? "Edit Connection" : "New Connection"}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {isEditMode ? "Update your connection settings." : "Configure a new database connection."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Form body */}
        <form id="connection-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-3 px-4 py-4">
            <ConnectionFormFields
              register={register}
              control={control}
              errors={errors}
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
              idPrefix="dlg"
            />
            <TestBanner status={testStatus} message={testMessage} />
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="px-4 pb-4 pt-0 flex flex-row items-center gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testStatus === "testing" || isSaving}
            className="gap-1.5"
            id="btn-test-connection"
          >
            {testStatus === "testing" ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={TestTube01Icon} size={14} />}
            Test Connection
          </Button>

          <Button
            type="submit"
            form="connection-form"
            disabled={isSaving || testStatus === "testing"}
            className="gap-1.5"
            id="btn-save-connection"
          >
            {isSaving ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={FloppyDiskIcon} size={14} />}
            {isEditMode ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
