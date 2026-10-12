create role anon; create role authenticated; create role service_role;
create table scout_sessions(id uuid primary key, verification boolean default false, status text default 'pending', runtime_version int, lease_until timestamptz, warnings jsonb default '[]',kind text,params jsonb,result jsonb,created_at timestamptz default now());
create table scout_provider_runs(id uuid primary key);
create table communities(id uuid primary key);
create table scouted_posts(id uuid primary key,community_id uuid, published_at timestamptz,post_url text,scout_identity text,likes bigint,comments bigint,scout_missing_metrics jsonb,scout_provenance jsonb);
