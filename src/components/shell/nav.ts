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
  Syringe,
  Bell,
  Sliders,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation model, shared by the desktop rail and the mobile drawer.
 *
 * Role filtering here is UX only — hard authorization lives in RLS (R1.4) and
 * the route handlers. Hiding a link never substitutes for a policy.
 *
 * This module is imported by client components only: `icon` holds component
 * references, which are not serializable across the server/client boundary.
 */

export type Role = "admin" | "editor" | "viewer";

/** Keys of the badge-count map the server layout supplies. */
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
    label: "Vận hành",
    items: [
      { href: "/", label: "Tổng quan", icon: LayoutDashboard, roles: ALL },
      { href: "/compose", label: "Tạo nội dung", icon: PenSquare, roles: WRITE },
      {
        href: "/posts",
        label: "Bài đăng",
        icon: Images,
        roles: ALL,
        badgeKey: "drafts",
      },
      { href: "/calendar", label: "Lịch đăng", icon: CalendarDays, roles: ALL },
      { href: "/campaigns", label: "Chiến dịch", icon: Sparkles, roles: WRITE },
    ],
  },
  {
    label: "Nội dung",
    items: [
      {
        href: "/remix",
        label: "Remix Studio",
        icon: Wand2,
        roles: WRITE,
        badgeKey: "remixReview",
      },
      {
        href: "/remix/presets",
        label: "Cấu hình Remix",
        icon: Sliders,
        roles: WRITE,
      },
      { href: "/media", label: "Thư viện media", icon: Images, roles: ALL },
    ],
  },
  {
    label: "Tăng trưởng",
    items: [
      { href: "/analytics", label: "Phân tích", icon: BarChart3, roles: ALL },
      {
        href: "/engagement",
        label: "Tương tác",
        icon: MessageSquare,
        roles: WRITE,
        badgeKey: "pendingEngagement",
      },
      {
        href: "/seeding",
        label: "Seeding",
        icon: Syringe,
        roles: ["admin", "editor"],
      },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      {
        href: "/notifications",
        label: "Thông báo",
        icon: Bell,
        roles: ALL,
      },
      {
        href: "/channels",
        label: "Kênh",
        icon: Radio,
        roles: ["admin"],
        badgeKey: "needsReauth",
      },
      { href: "/settings", label: "Cài đặt", icon: Settings, roles: ["admin"] },
    ],
  },
];

/** Counts rendered as nav badges; all optional so the layout can omit any. */
export type NavCounts = Partial<Record<BadgeKey, number>>;

/** Badges that mean "something is broken" rather than "something is waiting". */
export const ALARM_BADGES: BadgeKey[] = ["needsReauth"];

export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

/**
 * Active-state test. `/` matches only itself; every other route also matches
 * its nested paths (e.g. /posts/123 keeps "Bài đăng" highlighted).
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Page title used by the topbar, derived from the same source. */
export function titleFor(pathname: string): string {
  for (const g of NAV_GROUPS) {
    for (const i of g.items) {
      if (isActive(pathname, i.href)) return i.label;
    }
  }
  return "Content Hub";
}
