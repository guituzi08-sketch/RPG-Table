-- Run ONCE in a new Supabase project's SQL Editor.
begin;
create table public.rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
 title text not null check (length(title) between 1 and 80),
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.room_members (
 room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 32),
 last_seen timestamptz not null default now(),
 primary key(room_id,user_id)
);
create table public.tokens (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 name text not null check (length(name) between 1 and 32),
 color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),
 x integer not null default 4 check(x between 0 and 31),
 y integer not null default 4 check(y between 0 and 23)
);
create table public.rolls (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 player_name text not null,
 sides integer not null check(sides in (4,6,8,10,12,20,100)),
 modifier integer not null check(modifier between -100 and 100),
 result integer not null check(result between 1 and sides),
 created_at timestamptz not null default now()
);
create index on public.tokens(room_id);
create index on public.rolls(room_id,created_at desc);
create index on public.room_members(user_id);

-- SECURITY DEFINER avoids recursive membership policies; uses a fixed search path.
create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.room_members where room_id=p_room and user_id=auth.uid());
$$;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.tokens enable row level security;
alter table public.rolls enable row level security;
create policy member_read on public.rooms for select to authenticated using(public.is_room_member(id));
create policy member_read on public.room_members for select to authenticated using(public.is_room_member(room_id));
create policy member_read on public.tokens for select to authenticated using(public.is_room_member(room_id));
create policy member_read on public.rolls for select to authenticated using(public.is_room_member(room_id));
-- All mutations go through validated RPCs. No direct client INSERT/UPDATE/DELETE.
revoke all on public.rooms,public.room_members,public.tokens,public.rolls from anon,authenticated;
grant select on public.rooms,public.room_members,public.tokens,public.rolls to authenticated;

create function public.create_room(p_title text,p_name text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
 if auth.uid() is null then raise exception 'Entre novamente para continuar.'; end if;
 if (select count(*) from public.rooms where owner_id=auth.uid()) >= 10 then raise exception 'Limite de 10 salas por jogador.'; end if;
 insert into public.rooms(title,owner_id) values(trim(p_title),auth.uid()) returning * into r;
 insert into public.room_members(room_id,user_id,name) values(r.id,auth.uid(),trim(p_name));
 return r;
end;
$$;
create function public.join_room(p_code text,p_name text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
 if auth.uid() is null then raise exception 'Entre novamente para continuar.'; end if;
 select * into r from public.rooms where code=upper(trim(p_code));
 if r.id is null then raise exception 'Sala não encontrada. Confira o código.'; end if;
 insert into public.room_members(room_id,user_id,name) values(r.id,auth.uid(),trim(p_name))
 on conflict(room_id,user_id) do update set name=excluded.name,last_seen=now();
 return r;
end;
$$;
create function public.heartbeat(p_room uuid) returns void
language sql security definer set search_path = '' as $$
 update public.room_members set last_seen=now() where room_id=p_room and user_id=auth.uid();
$$;
create function public.add_token(p_room uuid,p_name text,p_color text) returns public.tokens
language plpgsql security definer set search_path = '' as $$
declare t public.tokens;
begin
 if not public.is_room_member(p_room) then raise exception 'Sem acesso à sala.'; end if;
 -- Serialize additions so the room limit holds for concurrent requests.
 perform 1 from public.rooms where id=p_room for update;
 if (select count(*) from public.tokens where room_id=p_room)>=100 then raise exception 'Limite de 100 tokens por sala.'; end if;
 insert into public.tokens(room_id,owner_id,name,color) values(p_room,auth.uid(),trim(p_name),p_color) returning * into t;
 return t;
end;
$$;
create function public.move_token(p_token uuid,p_x integer,p_y integer) returns public.tokens
language plpgsql security definer set search_path = '' as $$
declare t public.tokens;
begin
 select * into t from public.tokens where id=p_token for update;
 if t.id is null or not public.is_room_member(t.room_id) then raise exception 'Token indisponível.'; end if;
 if t.owner_id<>auth.uid() and not exists(select 1 from public.rooms where id=t.room_id and owner_id=auth.uid()) then raise exception 'Você só pode mover seus tokens.'; end if;
 update public.tokens set x=p_x,y=p_y where id=p_token returning * into t;
 return t;
end;
$$;
create function public.roll_die(p_room uuid,p_sides integer,p_modifier integer) returns public.rolls
language plpgsql security definer set search_path = '' as $$
declare r public.rolls; n text;
begin
 if not public.is_room_member(p_room) then raise exception 'Sem acesso à sala.'; end if;
 -- Serialize this player's rolls and keep accidental double-clicks out of the log.
 select name into n from public.room_members where room_id=p_room and user_id=auth.uid() for update;
 if exists(select 1 from public.rolls where room_id=p_room and user_id=auth.uid() and created_at > now()-interval '500 milliseconds') then raise exception 'Aguarde um instante entre rolagens.'; end if;
 insert into public.rolls(room_id,user_id,player_name,sides,modifier,result)
 values(p_room,auth.uid(),n,p_sides,p_modifier,1+floor(random()*p_sides)::integer) returning * into r;
 return r;
end;
$$;
revoke all on function public.is_room_member(uuid),public.create_room(text,text),public.join_room(text,text),public.heartbeat(uuid),public.add_token(uuid,text,text),public.move_token(uuid,integer,integer),public.roll_die(uuid,integer,integer) from public,anon;
grant execute on function public.is_room_member(uuid),public.create_room(text,text),public.join_room(text,text),public.heartbeat(uuid),public.add_token(uuid,text,text),public.move_token(uuid,integer,integer),public.roll_die(uuid,integer,integer) to authenticated;
alter publication supabase_realtime add table public.tokens,public.rolls,public.room_members;
commit;
