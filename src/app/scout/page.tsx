import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { ScoutWorkspace } from '@/components/sport-hub/scout-workspace';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scout Workspace', description: 'Find profiles, collect content and refresh data in one workspace.' };
export default async function Page() {
  const { userId } = await getServerUserRole(); if (!userId) redirect('/login');
  return <ScoutWorkspace />;
}
