import {
  BarChart3,
  Bell,
  CalendarDays,
  Images,
  LayoutDashboard,
  MessageSquare,
  PenSquare,
  Radio,
  Settings,
  Sliders,
  Sparkles,
  Syringe,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation model — redesign v2.
 *
 * Role filtering is UX-only. Real authorization lives in RLS + route handlers.
 * Icons kept as Lucide for now (Phosphor migration is Phase 6).
 */

export type Role = "admin" | "editor" | "viewer";

export type BadgeKey =
  | "drafts"
  | "remixReview"
  | "pendingEngagement"
  | "needsReauth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  badgeKey?: BadgeKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "editor", "viewer"];
const WRITE: Role[] = ["admin", "editor"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/",          label: "Overview",       icon: LayoutDashboard, roles: ALL },
      { href: "/compose",   label: "Compose",        icon: PenSquare,       roles: WRITE },
      { href: "/posts",     label: "Posts",          icon: Images,          roles: ALL, badgeKey: "drafts" },
      { href: "/calendar",  label: "Calendar",       icon: CalendarDays,    roles: ALL },
      { href: "/campaigns", label: "Campaigns",      icon: Sparkles,        roles: WRITE },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/remix",         label: "Remix Studio",     icon: Wand2,   roles: WRITE, badgeKey: "remixReview" },
      { href: "/remix/presets", label: "Remix Presets",    icon: Sliders, roles: WRITE },
      { href: "/media",         label: "Media Library",    icon: Images,  roles: ALL },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/analytics",         label: "Analytics",        icon: BarChart3,    roles: ALL },
      { href: "/engagement",        label: "Engagement",       icon: MessageSquare, roles: WRITE, badgeKey: "pendingEngagement" },
      { href: "/seeding",           label: "Seeding",          icon: Syringe,      roles: WRITE },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications",  icon: Bell,     roles: ALL },
      { href: "/channels",      label: "Channels",       icon: Radio,    roles: ["admin"], badgeKey: "needsReauth" },
      { href: "/settings",      label: "Settings",       icon: Settings, roles: ["admin"] },
    ],
  },
];

export type NavCounts = Partial<Record<BadgeKey, number>>;
export const ALARM_BADGES: BadgeKey[] = ["needsReauth"];

export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function titleFor(pathname: string): string {
  for (const g of NAV_GROUPS) {
    for (const i of g.items) {
      if (isActive(pathname, i.href)) return i.label;
    }
  }
  return "Content Hub";
}
