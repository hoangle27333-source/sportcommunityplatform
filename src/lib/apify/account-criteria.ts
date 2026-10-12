export type AccountSizeCriteria = {
  sizeMetric?: 'followers' | 'members';
  minFollowers?: number;
  maxFollowers?: number;
  minMembers?: number;
  maxMembers?: number;
};

export function sizeRange(criteria: AccountSizeCriteria) {
  const metric = criteria.sizeMetric || 'followers';
  return { metric, minimum: metric === 'members' ? criteria.minMembers : criteria.minFollowers,
    maximum: metric === 'members' ? criteria.maxMembers : criteria.maxFollowers };
}

/** Search synonyms are hints; qualification always examines observed account evidence. */
const TOPICS = [
  ['running', 'chạy bộ', 'runner', 'marathon'], ['badminton', 'cầu lông'],
  ['football', 'bóng đá', 'soccer'], ['basketball', 'bóng rổ'],
  ['cycling', 'đạp xe'], ['swimming', 'bơi lội'], ['fitness', 'gym', 'workout'],
  ['pickleball'], ['tennis'], ['golf'], ['hyrox'],
];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export function topicQueries(topic: string): string[] {
  const text = normalize(topic).replace(/^#/, '').trim();
  const group = TOPICS.find(group => group.some(alias => new RegExp(`(^|\\s)${normalize(alias)}($|\\s)`).test(text)));
  const matched=group?.find(alias=>new RegExp(`(^|\\s)${normalize(alias)}($|\\s)`).test(text));
  if(!group || !matched)return [topic.trim()];
  const pattern=new RegExp(`(^|\\s)${normalize(matched)}(?=$|\\s)`);
  return [...new Set([topic.trim(),...group.map(alias=>text.replace(pattern,(_,prefix)=>`${prefix}${alias}`))])];
}
