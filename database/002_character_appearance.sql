begin;

alter table public.tokens
  add column if not exists silhouette text not null default 'masculine'
  check (silhouette in ('masculine', 'feminine'));

create or replace function public.add_token(
  p_room uuid,
  p_name text,
  p_color text,
  p_silhouette text
) returns public.tokens
language plpgsql security definer set search_path = '' as $$
declare t public.tokens;
begin
 if not public.is_room_member(p_room) then raise exception 'Sem acesso à sala.'; end if;
 if p_silhouette not in ('masculine', 'feminine') then raise exception 'Aparência inválida.'; end if;
 perform 1 from public.rooms where id=p_room for update;
 if (select count(*) from public.tokens where room_id=p_room)>=100 then raise exception 'Limite de 100 tokens por sala.'; end if;
 insert into public.tokens(room_id,owner_id,name,color,silhouette)
 values(p_room,auth.uid(),trim(p_name),p_color,p_silhouette) returning * into t;
 return t;
end;
$$;

revoke all on function public.add_token(uuid,text,text,text) from public,anon;
grant execute on function public.add_token(uuid,text,text,text) to authenticated;

commit;