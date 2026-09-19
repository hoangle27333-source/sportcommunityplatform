"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Briefcase,
  Flame,
  UserCheck,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Shield,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth/auth-context";

export interface PlatformHeaderProps {
  onRefresh?: () => void;
  loading?: boolean;
}

export const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/kols",
    label: "KOLs Directory",
    icon: Users,
  },
  {
    href: "/community",
    label: "Community & Clubs",
    icon: ShieldCheck,
  },
  {
    href: "/projects",
    label: "Campaigns & Projects",
    icon: Briefcase,
  },
  {
    href: "/trending",
    label: "Trending Posts",
    icon: Flame,
  },
  {
    href: "/team",
    label: "Team & Roles",
    icon: UserCheck,
  },
];

export function PlatformHeader({ onRefresh, loading = false }: PlatformHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, profile, signOut } = useCurrentUser();

  const currentUser = user
    ? {
        id: user.id,
        name: profile?.name || user.user_metadata?.name || user.email?.split("@")[0] || "Member",
        email: user.email || "",
        role: (profile?.role as any) || "viewer",
      }
    : null;

  useEffect(() => {
    // Close dropdown on click outside
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  const getRoleBadgeStyle = (role?: string) => {
    if (role === "admin") {
      return "bg-rose-50 text-rose-700 border-rose-200/80";
    }
    if (role === "editor") {
      return "bg-blue-50 text-blue-700 border-blue-200/80";
    }
    return "bg-slate-100 text-slate-600 border-slate-200";
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md bg-white/95 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-14 flex items-center justify-between gap-4">
          {/* Logo & Brand Identity (Strictly Single Line) */}
          <div className="flex items-center space-x-3 shrink-0">
            <Link
              href="/"
              className="flex items-center space-x-2.5 group"
              title="Sports Creator CRM & 360° Panoramic Evaluation"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-base font-bold shadow-xs shadow-blue-500/20 group-hover:scale-105 transition">
                ⚡
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none whitespace-nowrap">
                  SPORT INFLUENCER HUB
                </span>
                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Menu (Single Line) */}
          <nav className="hidden lg:flex items-center space-x-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 whitespace-nowrap ${
                    active
                      ? "text-blue-600 bg-blue-50/80 font-bold border border-blue-200/60 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? "text-blue-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Action & Controls (Single Line) */}
          <div className="flex items-center space-x-2.5">
            {/* User Account Menu */}
            {currentUser ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 transition text-left focus:outline-none cursor-pointer"
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-slate-800 max-w-[110px] truncate leading-none">
                      {currentUser.name}
                    </span>
                    <span className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border leading-none ${getRoleBadgeStyle(currentUser.role)}`}>
                      {currentUser.role}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {/* Dropdown Card */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {currentUser.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {currentUser.email}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${getRoleBadgeStyle(currentUser.role)}`}>
                          {currentUser.role} Role
                        </span>
                      </div>
                    </div>

                    <div className="py-1 border-b border-slate-100">
                      <Link
                        href="/team"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                      >
                        <Shield className="w-3.5 h-3.5 text-slate-400" />
                        <span>Team & Roles Directory</span>
                      </Link>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 transition text-left"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs hover:bg-blue-700 transition"
              >
                Sign In
              </Link>
            )}

            {/* Mobile Hamburger Toggle */}
            <div className="lg:hidden flex items-center">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 py-3 space-y-1 bg-white animate-in slide-in-from-top-2 duration-150">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    active
                      ? "text-blue-600 bg-blue-50/80 font-bold"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-blue-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {currentUser && (
              <div className="pt-2 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign Out ({currentUser.name})</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
