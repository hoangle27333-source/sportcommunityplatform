/** Adapter contracts describe supported inputs; activation still requires a persisted build receipt. */
export const ACTOR_CONTRACTS:Record<string,{platform:string;tasks:string[];batchSize:number;dateFilter?:string;canExpand:boolean;outputAdapter:'profile-or-post'|'comment';numericFields:string[]}>={
 'apify~instagram-scraper':{platform:'Instagram',tasks:['profiles','communities','hashtag','profile-details','profile-posts','comments'],batchSize:10,dateFilter:'onlyPostsNewerThan',canExpand:true,outputAdapter:'profile-or-post',numericFields:['followersCount','likesCount','commentsCount','videoViewCount','videoPlayCount']},
 'clockworks~tiktok-scraper':{platform:'TikTok',tasks:['profiles','hashtag','keyword','profile-details','profile-posts'],batchSize:10,canExpand:true,outputAdapter:'profile-or-post',numericFields:['diggCount','commentCount','playCount','followers']},
 'apify~facebook-search-scraper':{platform:'Facebook',tasks:['profiles','communities','hashtag','keyword'],batchSize:1,canExpand:true,outputAdapter:'profile-or-post',numericFields:['followersCount','membersCount','likesCount','reactionsCount','commentsCount']},
 'apify~facebook-pages-scraper':{platform:'Facebook',tasks:['profile-details'],batchSize:10,canExpand:false,outputAdapter:'profile-or-post',numericFields:['followers','followersCount','membersCount']},
 'apify~facebook-posts-scraper':{platform:'Facebook',tasks:['profile-posts'],batchSize:1,dateFilter:'onlyPostsNewerThan',canExpand:true,outputAdapter:'profile-or-post',numericFields:['likes','comments','views','likesCount','commentsCount']},
 'apify~facebook-groups-scraper':{platform:'Facebook',tasks:['profile-posts'],batchSize:1,canExpand:true,outputAdapter:'profile-or-post',numericFields:['likesCount','commentsCount']},
 'parseforge~facebook-groups-search-scraper':{platform:'Facebook',tasks:['communities'],batchSize:1,canExpand:true,outputAdapter:'profile-or-post',numericFields:['membersCount']},
 'apify~facebook-comments-scraper':{platform:'Facebook',tasks:['comments'],batchSize:1,canExpand:true,outputAdapter:'comment',numericFields:[]},
 'clockworks~tiktok-comments-scraper':{platform:'TikTok',tasks:['comments'],batchSize:1,canExpand:true,outputAdapter:'comment',numericFields:[]},
};
