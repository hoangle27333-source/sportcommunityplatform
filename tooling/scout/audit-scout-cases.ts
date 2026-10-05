// Read-only regression probes. No provider calls or database writes.
import { assessProfile } from '../../src/lib/apify/discovery-quality';
import { parseProfile } from '../../src/lib/apify/providers';
import { writeFileSync } from 'node:fs';
const person = { name: 'Nguyen Runner', bio: 'Athlete and coach, member of Hanoi running club Vietnam', category: 'Digital creator', entityType: 'person', location: 'Hanoi', url: 'https://instagram.com/nguyenrunner' };
const hanoi = { name: 'Hanoi Running Club', bio: 'Running club Hanoi Vietnam', category: 'Community', entityType: 'group', location: 'Hanoi Vietnam', url: 'https://facebook.com/groups/hanoirun' };
const hcm = { name: 'Marathon Runner HCM', bio: 'Athlete runner Ho Chi Minh City Vietnam', category: 'Athlete', entityType: 'person', location: 'Ho Chi Minh City', url: 'https://instagram.com/runnerhcm' };
const results = [
  { case: 'Individual mentioning club membership', expected: 'Individual / Matched', actual: assessProfile(person, 'run', 'Nationwide', 'Individual KOLs') },
  { case: 'Sai Gon query with Hanoi club', expected: 'Excluded or explicit location conflict', actual: assessProfile(hanoi, 'Sai Gon Run Club', 'Nationwide', 'Communities & Clubs') },
  { case: 'HCMC preset with HCM profile', expected: 'Matched', actual: assessProfile(hcm, 'Marathon Runner HCMC', 'Nationwide', 'Individual KOLs') },
  { case: 'Facebook story is not a profile', expected: null, actual: parseProfile({ name: 'Hanoi Running Club', description: 'Running club Vietnam', url: 'https://facebook.com/story.php?story_fbid=123&id=456' }, 'Facebook') },
  { case: 'Zero saved posts notification', expected: 0, actual: ({ insertedCount: 0 }).insertedCount || 10 },
];
const output = JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'read-only synthetic regression probes', results }, null, 2);
writeFileSync('artifacts/influencer-audit/regression-probes.json', output + '\n');
console.log(output);
