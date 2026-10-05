/** Platform/login boilerplate is not evidence of an entity's original name. */
export function metadataIdentity(name:string) {
 const value=name.trim();
 return /^(instagram|facebook|tiktok|youtube|strava|log\s?in|sign\s?in|sign\s?up|login\s*[-–|:].*|log in to .*|sign in to .*|instagram\s*[-–|:]\s*(log in|sign up).*|facebook\s*[-–|:]\s*(log in|sign up).*)$/i.test(value) ? '' : value;
}
