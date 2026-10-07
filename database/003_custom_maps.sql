begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maps',
  'maps',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.rooms
  add column if not exists map_path text,
  add column if not exists map_name text,
  add column if not exists map_width integer,
  add column if not exists map_height integer,
  add column if not exists grid_enabled boolean not null default false,
  add column if not exists grid_size integer not null default 64,
  add column if not exists grid_opacity double precision not null default 0.28;

alter table public.tokens
  add column if not exists map_x double precision not null default (4.0 / 31.0),
  add column if not exists map_y double precision not null default (4.0 / 23.0);

update public.tokens
set map_x = x::double precision / 31.0,
    map_y = y::double precision / 23.0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tokens_map_x_range') then
    alter table public.tokens add constraint tokens_map_x_range check (map_x between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tokens_map_y_range') then
    alter table public.tokens add constraint tokens_map_y_range check (map_y between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_map_dimensions') then
    alter table public.rooms add constraint rooms_map_dimensions check (
      (map_path is null and map_name is null and map_width is null and map_height is null)
      or (map_path is not null and map_name is not null and map_width between 1 and 4096 and map_height between 1 and 4096)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_grid_settings') then
    alter table public.rooms add constraint rooms_grid_settings check (
      grid_size between 16 and 512 and grid_opacity between 0.08 and 0.8
    );
  end if;
end;
$$;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists maps_room_read on storage.objects;
create policy maps_room_read on storage.objects
for select to authenticated
using (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_room_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists maps_master_insert on storage.objects;
create policy maps_master_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.rooms r
    where r.id = ((storage.foldername(name))[1])::uuid and r.owner_id = auth.uid()
  )
);

drop policy if exists maps_master_update on storage.objects;
create policy maps_master_update on storage.objects
for update to authenticated
using (
  bucket_id = 'maps'
  and exists (
    select 1 from public.rooms r
    where r.id = ((storage.foldername(name))[1])::uuid and r.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'maps'
  and exists (
    select 1 from public.rooms r
    where r.id = ((storage.foldername(name))[1])::uuid and r.owner_id = auth.uid()
  )
);

drop policy if exists maps_master_delete on storage.objects;
create policy maps_master_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'maps'
  and exists (
    select 1 from public.rooms r
    where r.id = ((storage.foldername(name))[1])::uuid and r.owner_id = auth.uid()
  )
);

create or replace function public.set_room_map(
  p_room uuid,
  p_map_path text,
  p_map_name text,
  p_map_width integer,
  p_map_height integer
) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null or not exists (
    select 1 from public.rooms where id = p_room and owner_id = auth.uid()
  ) then raise exception 'Somente o mestre pode alterar o mapa.'; end if;
  if p_map_path !~ ('^' || p_room::text || '/[A-Za-z0-9_-]+[.](png|jpe?g|webp)$') then
    raise exception 'Caminho de mapa inválido.';
  end if;
  if length(trim(p_map_name)) not between 1 and 160 then raise exception 'Nome de mapa inválido.'; end if;
  if p_map_width not between 1 and 4096 or p_map_height not between 1 and 4096
    or p_map_width::bigint * p_map_height::bigint > 16777216 then
    raise exception 'Dimensões de mapa excedem o limite permitido.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'maps' and name = p_map_path and owner_id = auth.uid()
  ) then raise exception 'Arquivo de mapa não encontrado ou sem permissão.'; end if;

  update public.rooms
  set map_path = p_map_path,
      map_name = trim(p_map_name),
      map_width = p_map_width,
      map_height = p_map_height
  where id = p_room
  returning * into r;
  return r;
end;
$$;

create or replace function public.clear_room_map(p_room uuid) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null or not exists (
    select 1 from public.rooms where id = p_room and owner_id = auth.uid()
  ) then raise exception 'Somente o mestre pode remover o mapa.'; end if;
  update public.rooms
  set map_path = null,
      map_name = null,
      map_width = null,
      map_height = null,
      grid_enabled = false
  where id = p_room
  returning * into r;
  return r;
end;
$$;

create or replace function public.set_room_grid(
  p_room uuid,
  p_enabled boolean,
  p_size integer,
  p_opacity double precision
) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null or not exists (
    select 1 from public.rooms where id = p_room and owner_id = auth.uid()
  ) then raise exception 'Somente o mestre pode ajustar o grid.'; end if;
  if p_size not between 16 and 512 or p_opacity not between 0.08 and 0.8 then
    raise exception 'Configuração de grid inválida.';
  end if;
  if p_enabled and not exists (
    select 1 from public.rooms where id = p_room and map_path is not null
  ) then raise exception 'Envie um mapa antes de ativar o grid.'; end if;
  update public.rooms
  set grid_enabled = p_enabled, grid_size = p_size, grid_opacity = p_opacity
  where id = p_room
  returning * into r;
  return r;
end;
$$;

create or replace function public.move_token(
  p_token uuid,
  p_x integer,
  p_y integer
) returns public.tokens
language plpgsql security definer set search_path = '' as $$
declare t public.tokens;
begin
  select * into t from public.tokens where id = p_token for update;
  if t.id is null or not public.is_room_member(t.room_id) then raise exception 'Token indisponível.'; end if;
  if t.owner_id <> auth.uid() and not exists (
    select 1 from public.rooms where id = t.room_id and owner_id = auth.uid()
  ) then raise exception 'Você só pode mover seus tokens.'; end if;
  if p_x not between 0 and 31 or p_y not between 0 and 23 then raise exception 'Posição fora do grid.'; end if;
  update public.tokens
  set x = p_x, y = p_y, map_x = p_x::double precision / 31.0, map_y = p_y::double precision / 23.0
  where id = p_token returning * into t;
  return t;
end;
$$;

create or replace function public.move_token_on_map(
  p_token uuid,
  p_x double precision,
  p_y double precision
) returns public.tokens
language plpgsql security definer set search_path = '' as $$
declare t public.tokens;
begin
  select * into t from public.tokens where id = p_token for update;
  if t.id is null or not public.is_room_member(t.room_id) then raise exception 'Token indisponível.'; end if;
  if t.owner_id <> auth.uid() and not exists (
    select 1 from public.rooms where id = t.room_id and owner_id = auth.uid()
  ) then raise exception 'Você só pode mover seus tokens.'; end if;
  if p_x is null or p_y is null or p_x not between 0 and 1 or p_y not between 0 and 1 then
    raise exception 'Posição fora do mapa.';
  end if;
  update public.tokens
  set map_x = p_x, map_y = p_y, x = round(p_x * 31)::integer, y = round(p_y * 23)::integer
  where id = p_token returning * into t;
  return t;
end;
$$;

revoke all on function public.set_room_map(uuid,text,text,integer,integer),
  public.clear_room_map(uuid), public.set_room_grid(uuid,boolean,integer,double precision),
  public.move_token_on_map(uuid,double precision,double precision)
from public, anon;
grant execute on function public.set_room_map(uuid,text,text,integer,integer),
  public.clear_room_map(uuid), public.set_room_grid(uuid,boolean,integer,double precision),
  public.move_token_on_map(uuid,double precision,double precision)
to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;

commit;