-- Harden remix preset RLS: viewers may read presets, but only editor/admin
-- users may mutate them. Editors are scoped to their own org_id; admins can
-- manage all presets.

drop policy if exists remix_presets_all on public.remix_presets;

create policy remix_presets_select on public.remix_presets
  for select using (auth.uid() is not null);

create policy remix_presets_insert on public.remix_presets
  for insert with check (
    public.is_admin()
    or (public.is_editor_or_admin() and org_id = auth.uid())
  );

create policy remix_presets_update on public.remix_presets
  for update using (
    public.is_admin()
    or (public.is_editor_or_admin() and org_id = auth.uid())
  )
  with check (
    public.is_admin()
    or (public.is_editor_or_admin() and org_id = auth.uid())
  );

create policy remix_presets_delete on public.remix_presets
  for delete using (
    public.is_admin()
    or (public.is_editor_or_admin() and org_id = auth.uid())
  );
