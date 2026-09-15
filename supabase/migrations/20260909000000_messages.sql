-- Milestone 3: history and ownership policies; no application sending/realtime.
-- Earlier applied migrations are intentionally unchanged.
begin;

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.game_rooms(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete restrict,
    content text not null,
    created_at timestamptz not null default now(),
    constraint messages_content_length check (char_length(content) <= 1000),
    -- Match JavaScript trim's whitespace, including tabs/newlines and Unicode
    -- spaces, without changing legitimate multiline message formatting.
    constraint messages_content_not_blank check (
        char_length(btrim(content,
            U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
        )) > 0
    )
);

create index messages_room_created_at_idx on public.messages(room_id, created_at);

alter table public.messages enable row level security;
revoke all on table public.messages from public, anon, authenticated;
grant select on table public.messages to authenticated;
-- Clients cannot choose message IDs or forge chronology with created_at.
grant insert (room_id, user_id, content) on public.messages to authenticated;

create policy messages_authenticated_read on public.messages
    for select to authenticated
    using (exists (select 1 from public.game_rooms r where r.id = room_id));

create policy messages_insert_own on public.messages
    for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (select 1 from public.game_rooms r where r.id = room_id)
    );

-- No UPDATE or DELETE grants/policies. Profile deletion is restricted while
-- authored messages exist; account/content deletion needs a deliberate later flow.
commit;
