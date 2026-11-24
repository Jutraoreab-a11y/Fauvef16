-- Studio 3D Multi-Produits & Tech Pack : schema initial.
-- Projet Supabase partage : tout ce qui est cree ici porte le prefixe famal_
-- (tables, buckets, politiques RLS, fonctions, triggers).
-- NE PAS EXECUTER avant validation.

-- ---------------------------------------------------------------------------
-- Fonction utilitaire : mise a jour automatique de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.famal_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- famal_base_models : catalogue des bases 3D modulaires (partage, lecture seule
-- pour les utilisateurs authentifies ; ecriture reservee au service role)
-- ---------------------------------------------------------------------------
create table if not exists public.famal_base_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type text not null check (product_type in ('apparel', 'gear')),
  category text not null,
  glb_url text not null,
  zones_schema_json jsonb not null default '[]'::jsonb,
  default_specs_table_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.famal_base_models enable row level security;

create policy famal_base_models_read_authenticated
  on public.famal_base_models
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- famal_projects : un projet = une marque / gamme + un produit deconstruit
-- ---------------------------------------------------------------------------
create table if not exists public.famal_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_name text not null,
  project_name text not null,
  product_type text not null check (product_type in ('apparel', 'gear')),
  category text not null,
  source_image_url text,
  cleaned_image_url text,
  product_spec_json jsonb not null default '{}'::jsonb,
  specs_table_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists famal_projects_user_id_idx on public.famal_projects (user_id);

create trigger famal_projects_set_updated_at
  before update on public.famal_projects
  for each row
  execute function public.famal_set_updated_at();

alter table public.famal_projects enable row level security;

create policy famal_projects_owner_select
  on public.famal_projects for select
  to authenticated
  using (user_id = auth.uid());

create policy famal_projects_owner_insert
  on public.famal_projects for insert
  to authenticated
  with check (user_id = auth.uid());

create policy famal_projects_owner_update
  on public.famal_projects for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy famal_projects_owner_delete
  on public.famal_projects for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- famal_assets : logos, patchs, etiquettes, textures, rendus d'un projet
-- ---------------------------------------------------------------------------
create table if not exists public.famal_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.famal_projects (id) on delete cascade,
  asset_type text not null check (asset_type in ('logo', 'patch', 'label', 'texture', 'render')),
  file_url text not null,
  placement_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists famal_assets_project_id_idx on public.famal_assets (project_id);

alter table public.famal_assets enable row level security;

-- Un asset n'est visible / modifiable que par le proprietaire du projet parent.
create policy famal_assets_owner_select
  on public.famal_assets for select
  to authenticated
  using (exists (
    select 1 from public.famal_projects p
    where p.id = famal_assets.project_id and p.user_id = auth.uid()
  ));

create policy famal_assets_owner_insert
  on public.famal_assets for insert
  to authenticated
  with check (exists (
    select 1 from public.famal_projects p
    where p.id = famal_assets.project_id and p.user_id = auth.uid()
  ));

create policy famal_assets_owner_update
  on public.famal_assets for update
  to authenticated
  using (exists (
    select 1 from public.famal_projects p
    where p.id = famal_assets.project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.famal_projects p
    where p.id = famal_assets.project_id and p.user_id = auth.uid()
  ));

create policy famal_assets_owner_delete
  on public.famal_assets for delete
  to authenticated
  using (exists (
    select 1 from public.famal_projects p
    where p.id = famal_assets.project_id and p.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Storage : buckets famal-uploads, famal-models, famal-exports
-- Convention : chaque fichier utilisateur est range sous <auth.uid()>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('famal-uploads', 'famal-uploads', false),
  ('famal-models', 'famal-models', false),
  ('famal-exports', 'famal-exports', false)
on conflict (id) do nothing;

-- Uploads et exports : chaque utilisateur ne voit que son dossier.
create policy famal_uploads_owner_all
  on storage.objects for all
  to authenticated
  using (bucket_id = 'famal-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'famal-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy famal_exports_owner_all
  on storage.objects for all
  to authenticated
  using (bucket_id = 'famal-exports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'famal-exports' and (storage.foldername(name))[1] = auth.uid()::text);

-- Modeles 3D : lecture seule pour les utilisateurs authentifies.
create policy famal_models_read_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'famal-models');
