-- Shares are observations: historical/missing values remain unknown.
alter table public.scouted_posts add column if not exists shares bigint check (shares >= 0);
notify pgrst, 'reload schema';
