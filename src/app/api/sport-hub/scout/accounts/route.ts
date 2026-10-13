import { NextResponse } from 'next/server';
import { scoutReadAccess, scoutFailure } from '@/lib/apify/sessions';
import { loadPostAccounts } from '@/lib/apify/post-accounts';
import { platformMatches } from '@/lib/apify/discovery-quality';
import { workspaceCapabilities } from '@/lib/apify/workspace-capabilities';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await scoutReadAccess();
    const [accounts, capabilities] = await Promise.all([loadPostAccounts(), workspaceCapabilities()]);
    return NextResponse.json({ success: true, accounts: accounts.map(account => ({ ...account, channels: account.urls.map(url => { const platform = (['Instagram', 'Facebook', 'TikTok'] as const).find(p => platformMatches(p, url)); const availability = platform ? capabilities[platform][url.includes('/groups/') ? 'group-posts' : 'profile-posts'] : { available: false, reason: 'This platform is not supported.' }; return { url, platform: platform || 'Unsupported', ...availability }; }) })) });
  } catch (error) { return scoutFailure(error); }
}
