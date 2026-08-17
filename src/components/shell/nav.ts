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
    label: "Vận hành",
    items: [
      { href: "/",          label: "Tổng quan",      icon: LayoutDashboard, roles: ALL },
      { href: "/compose",   label: "Tạo nội dung",   icon: PenSquare,       roles: WRITE },
      { href: "/posts",     label: "Bài đăng",        icon: Images,          roles: ALL, badgeKey: "drafts" },
      { href: "/calendar",  label: "Lịch đăng",       icon: CalendarDays,    roles: ALL },
      { href: "/campaigns", label: "Chiến dịch",      icon: Sparkles,        roles: WRITE },
    ],
  },
  {
    label: "Nội dung",
    items: [
      { href: "/remix",         label: "Remix Studio",     icon: Wand2,   roles: WRITE, badgeKey: "remixReview" },
      { href: "/remix/presets", label: "Cấu hình Remix",   icon: Sliders, roles: WRITE },
      { href: "/media",         label: "Thư viện media",   icon: Images,  roles: ALL },
    ],
  },
  {
    label: "Tăng trưởng",
    items: [
      { href: "/analytics",         label: "Phân tích",        icon: BarChart3,    roles: ALL },
      { href: "/engagement",        label: "Tương tác",        icon: MessageSquare, roles: WRITE, badgeKey: "pendingEngagement" },
      { href: "/seeding",           label: "Seeding",          icon: Syringe,      roles: WRITE },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/notifications", label: "Thông báo",  icon: Bell,     roles: ALL },
      { href: "/channels",      label: "Kênh",       icon: Radio,    roles: ["admin"], badgeKey: "needsReauth" },
      { href: "/settings",      label: "Cài đặt",    icon: Settings, roles: ["admin"] },
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
