import { TeamPageView } from "@/components/sport-hub/pages/team-page-view";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team & Roles Directory · SPORT INFLUENCER HUB",
  description: "User directory, role management, PIC assignments, and platform audit trail.",
};

export default function TeamPage() {
  return <TeamPageView />;
}
