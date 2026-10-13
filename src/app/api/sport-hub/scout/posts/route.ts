import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoutReadAccess, scoutFailure } from '@/lib/apify/sessions';
import { readWorkspacePosts } from '@/lib/apify/post-suggestions';
import { postDto, suggestedPostAccounts, assertPostWorkspaceSchema } from '@/lib/apify/post-metadata';
import { loadPostAccounts, matchPostAuthor } from '@/lib/apify/post-accounts';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    await scoutReadAccess(); await assertPostWorkspaceSchema();
    const workspace = z.enum(['account', 'topic', 'legacy']).optional().parse(req.nextUrl.searchParams.get('workspace') || undefined);
    const [rows, registry] = await Promise.all([readWorkspacePosts(), loadPostAccounts()]);
    const posts = rows.map(row => {
      const dto = postDto(row), match = matchPostAuthor(registry, String(row.platform).split(' ')[0], row.author_profile_url);
      if (match && !dto.accountLinks.some(l => l.role === 'author')) { dto.accountLinks.push({ ...match, role: 'author' }); dto.accountSuggestionState = 'existing'; if (!dto.workspaces.includes('account')) dto.workspaces.push('account'); }
      return dto;
    }).filter(post => !workspace || post.workspaces.includes(workspace));
    return NextResponse.json({ success: true, posts, suggestedAccounts: suggestedPostAccounts(rows).filter(s => !matchPostAuthor(registry, s.platform, s.profileUrl)) });
  } catch (error) { return scoutFailure(error); }
}
