"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { roleAccess } from "./role-policy";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "editor" | "viewer";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  avatar_url?: string;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  isAdmin: false,
  isEditor: false,
  isViewer: false,
  loading: true,
  refreshUser: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role")
        .eq("id", currentUser.id)
        .single();

      setUser(currentUser);
      if (data && !error && data.role) {
        setProfile(data as UserProfile);
      } else {
        // An unavailable profile never grants write or administrative access.
        const fallbackRole: AppRole = "viewer";

        setProfile({
          id: currentUser.id,
          name: currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "Member",
          email: currentUser.email || "",
          role: fallbackRole,
        });
      }
    } catch (err) {
      console.warn("Failed to fetch user profile:", err);
      setProfile({
        id: currentUser.id,
        name: currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "Member",
        email: currentUser.email || "",
        role: "viewer",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    await fetchProfile(currentUser);
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      fetchProfile(currentUser);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchProfile(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const role = profile?.role ?? null;
  const { isAdmin, isEditor, isViewer } = roleAccess(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin,
        isEditor,
        isViewer,
        loading,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(AuthContext);
  return context;
}
