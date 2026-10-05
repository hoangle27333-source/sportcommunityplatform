const api=async(path:string)=> {const r=await fetch('https://api.apify.com/v2/'+path,{headers:{Authorization:`Bearer ${process.env.APIFY_TOKEN}`}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const runs=(await api('acts/apify~facebook-search-scraper/runs?limit=8&desc=true')).data.items;
for(const run of runs){const input=await api('key-value-stores/'+run.defaultKeyValueStoreId+'/records/INPUT'); console.log(JSON.stringify({id:run.id,startedAt:run.startedAt,status:run.status,buildId:run.buildId,input,datasetId:run.defaultDatasetId}));if(JSON.stringify(input).includes('badminton'))console.log(JSON.stringify({run:run.id,rows:await api('datasets/'+run.defaultDatasetId+'/items?clean=true&limit=100')}));}

export {};
