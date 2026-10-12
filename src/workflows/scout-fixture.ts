import { sleep } from 'workflow';
import { communityEngagement } from '@/lib/sport-hub/community-engagement';

async function measureFixture() {
  'use step';
  const posts = Array.from({ length: 35 }, (_, index) => ({
    id: `fixture-${index}`, post_url: `https://facebook.com/posts/${index}`,
    published_at: new Date(Date.UTC(2026, 0, 1, 0, 35 - index)).toISOString(),
    likes: index, comments: index === 0 ? 0 : 1,
    scout_missing_metrics: index === 1 ? ['comments'] : [],
  }));
  return communityEngagement(posts);
}
async function finishFixture(summary: Awaited<ReturnType<typeof measureFixture>>) {
  'use step';
  return { fixture: true, providerStarts: 0, ...summary };
}
/** No network collection or production writes. Preview-only durable restart probe. */
export async function scoutFixtureWorkflow(delaySeconds = 5) {
  'use workflow';
  const summary = await measureFixture();
  await sleep(`${delaySeconds}s`);
  return finishFixture(summary);
}
