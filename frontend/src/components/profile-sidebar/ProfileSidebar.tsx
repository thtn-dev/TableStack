import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Logout01Icon,
  Login01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  RefreshIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useDBStore } from "@/store";
import type { Profile } from "@/store";
import { ConnectionDialog } from "@/components/connection";
import { cn } from "@/lib/utils";

// =============================================================================
// ProfileAvatar — single profile icon in the rail
// =============================================================================

interface ProfileAvatarProps {
  profile: Profile;
  isActive: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onClick: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}

function ProfileAvatar({
  profile,
  isActive,
  isConnected,
  isConnecting,
  onClick,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onRefresh,
}: ProfileAvatarProps) {
  const initial = profile.name.charAt(0).toUpperCase();
  const tagColor = profile.tag?.color ?? "#6B7280";

  return (
    <div className="relative group/avatar">
      {/* Primary avatar button — click to connect/switch */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`Switch to ${profile.name}`}
            onClick={onClick}
            className={cn(
              "relative flex items-center justify-center w-9 h-9 rounded-xl",
              "text-white text-[13px] font-bold select-none cursor-pointer",
              "transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar scale-105"
                : "opacity-60 hover:opacity-90 hover:scale-105",
            )}
            style={{ backgroundColor: tagColor }}
          >
            {isConnecting ? (
              <Spinner className="size-4 text-white" />
            ) : (
              initial
            )}

            {/* Connection status dot */}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full",
                "border-2 border-sidebar transition-colors",
                isConnected ? "bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[180px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{profile.name}</span>
            <span className="text-muted-foreground text-[11px] truncate">
              {profile.host}:{profile.port}/{profile.database}
            </span>
            <span className="text-muted-foreground/60 text-[10px]">
              {isConnected ? "Connected" : "Disconnected"} · {profile.driver}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Context menu trigger — appears on avatar hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Options for ${profile.name}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute -top-1 -right-1",
              "flex items-center justify-center w-4 h-4 rounded-full",
              "bg-background border border-border/60 shadow-sm",
              "text-muted-foreground hover:text-foreground hover:border-border",
              "opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-100",
              "outline-none focus-visible:opacity-100",
            )}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={10} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="start" className="w-44">
          {isConnected ? (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
              >
                <HugeiconsIcon icon={RefreshIcon} size={13} />
                Refresh schema
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnect();
                }}
              >
                <HugeiconsIcon icon={Logout01Icon} size={13} />
                Disconnect
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
            >
              <HugeiconsIcon icon={Login01Icon} size={13} />
              Connect
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={13} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =============================================================================
// ProfileSidebar — narrow icon rail on the far left
// =============================================================================

const EMPTY_PROFILES: Profile[] = [];

export function ProfileSidebar() {
  const profilesData = useDBStore((s) => s.profiles.data);
  const profiles = profilesData ?? EMPTY_PROFILES;

  const activeConnections = useDBStore((s) => s.activeConnections);
  const connectingIds = useDBStore((s) => s.connectingIds);
  const activeProfileId = useDBStore((s) => s.activeProfileId);

  const connect = useDBStore((s) => s.connect);
  const disconnect = useDBStore((s) => s.disconnect);
  const deleteProfile = useDBStore((s) => s.deleteProfile);
  const loadSchemaTree = useDBStore((s) => s.loadSchemaTree);
  const loadProfiles = useDBStore((s) => s.loadProfiles);
  const setActiveProfile = useDBStore((s) => s.setActiveProfile);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | undefined>(undefined);

  const handleAvatarClick = useCallback(
    async (profile: Profile) => {
      const isConnected = activeConnections.has(profile.id);
      if (isConnected) {
        setActiveProfile(profile.id);
        // Load schema if not already in store
        const schemaNode = useDBStore.getState().schemaTree[profile.id];
        if (!schemaNode) {
          void loadSchemaTree(profile.id);
        }
      } else {
        // connect() internally sets activeProfileId + loads schema tree
        await connect(profile.id);
      }
    },
    [activeConnections, setActiveProfile, connect, loadSchemaTree],
  );

  const handleDialogClose = useCallback(
    async (open: boolean) => {
      setDialogOpen(open);
      if (!open) {
        await loadProfiles();
      }
    },
    [loadProfiles],
  );

  return (
    <aside className="flex flex-col h-full w-12 shrink-0 border-r border-border/60 bg-sidebar items-center py-2">
      {/* Profile avatars */}
      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col items-center gap-2.5 py-1 px-1.5">
          {profiles.map((profile) => (
            <ProfileAvatar
              key={profile.id}
              profile={profile}
              isActive={activeProfileId === profile.id}
              isConnected={activeConnections.has(profile.id)}
              isConnecting={connectingIds.has(profile.id)}
              onClick={() => void handleAvatarClick(profile)}
              onConnect={() => void connect(profile.id)}
              onDisconnect={() => void disconnect(profile.id)}
              onRefresh={() => void loadSchemaTree(profile.id)}
              onDelete={() => void deleteProfile(profile.id)}
              onEdit={() => {
                setEditProfile(profile);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Add new connection */}
      <div className="shrink-0 pb-1 pt-2 border-t border-border/40 w-full flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              id="profile-sidebar-new-connection"
              aria-label="New connection"
              className="w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditProfile(undefined);
                setDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New Connection</TooltipContent>
        </Tooltip>
      </div>

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editProfile={editProfile}
      />
    </aside>
  );
}
