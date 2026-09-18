"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Images,
  LayoutDashboard,
  MessageSquare,
  PenSquare,
  Radio,
  Settings,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * CommandPalette — global ⌘K search palette.
 *
 * Rendered in DashboardShell, opened via Topbar ⌘K button or keyboard shortcut.
 * Sections: Pages, Actions.
 * Navigates via Next.js router on selection.
 */

const PAGES = [
  { href: "/",           label: "Overview",        icon: LayoutDashboard, shortcut: "G H" },
  { href: "/compose",    label: "Compose",         icon: PenSquare,       shortcut: "G C" },
  { href: "/calendar",   label: "Calendar",        icon: CalendarDays,    shortcut: "G L" },
  { href: "/campaigns",  label: "Campaigns",       icon: Sparkles },
  { href: "/analytics",  label: "Analytics",       icon: BarChart3,       shortcut: "G A" },
  { href: "/remix",      label: "Remix Studio",    icon: Wand2,           shortcut: "G R" },
  { href: "/media",      label: "Media Library",   icon: Images },
  { href: "/engagement", label: "Engagement",      icon: MessageSquare },
  { href: "/channels",   label: "Channels",        icon: Radio },
  { href: "/settings",   label: "Settings",        icon: Settings },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function navigate(href: string) {
    router.push(href);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 max-w-lg"
        showClose={false}
        aria-label="Command palette"
      >
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5">
          <CommandInput placeholder="Search pages, posts, campaigns…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Pages">
              {PAGES.map((page) => (
                <CommandItem
                  key={page.href}
                  value={page.label}
                  onSelect={() => navigate(page.href)}
                >
                  <page.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span>{page.label}</span>
                  {page.shortcut && (
                    <CommandShortcut>{page.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              <CommandItem
                value="Create new post"
                onSelect={() => navigate("/compose")}
              >
                <PenSquare className="size-4 text-primary" aria-hidden="true" />
                <span>Create new post</span>
                <CommandShortcut>⌘ N</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Remix new video"
                onSelect={() => navigate("/remix")}
              >
                <Wand2 className="size-4 text-accent" aria-hidden="true" />
                <span>Remix new video</span>
              </CommandItem>
              <CommandItem
                value="View calendar"
                onSelect={() => navigate("/calendar")}
              >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>View calendar</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
