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
  { href: "/",           label: "Tổng quan",       icon: LayoutDashboard, shortcut: "G H" },
  { href: "/compose",    label: "Tạo nội dung",    icon: PenSquare,       shortcut: "G C" },
  { href: "/calendar",   label: "Lịch đăng",       icon: CalendarDays,    shortcut: "G L" },
  { href: "/campaigns",  label: "Chiến dịch",      icon: Sparkles },
  { href: "/analytics",  label: "Phân tích",       icon: BarChart3,       shortcut: "G A" },
  { href: "/remix",      label: "Remix Studio",    icon: Wand2,           shortcut: "G R" },
  { href: "/media",      label: "Thư viện media",  icon: Images },
  { href: "/engagement", label: "Tương tác",       icon: MessageSquare },
  { href: "/channels",   label: "Kênh",            icon: Radio },
  { href: "/settings",   label: "Cài đặt",         icon: Settings },
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
          <CommandInput placeholder="Tìm trang, bài đăng, chiến dịch…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy kết quả nào.</CommandEmpty>
            <CommandGroup heading="Trang">
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
            <CommandGroup heading="Thao tác nhanh">
              <CommandItem
                value="Tạo bài đăng mới"
                onSelect={() => navigate("/compose")}
              >
                <PenSquare className="size-4 text-primary" aria-hidden="true" />
                <span>Tạo bài đăng mới</span>
                <CommandShortcut>⌘ N</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Remix video mới"
                onSelect={() => navigate("/remix")}
              >
                <Wand2 className="size-4 text-accent" aria-hidden="true" />
                <span>Remix video mới</span>
              </CommandItem>
              <CommandItem
                value="Xem lịch đăng"
                onSelect={() => navigate("/calendar")}
              >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>Xem lịch đăng</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
