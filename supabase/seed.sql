begin;

insert into public.leagues (id, name, abbreviation, sport, created_at)
values ('10000000-0000-4000-8000-000000000001', 'National Basketball Association', 'NBA', 'Basketball', '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.teams (id, league_id, name, city, abbreviation, created_at)
values
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Lakers', 'Los Angeles', 'LAL', '2026-01-01T00:00:00Z'),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Warriors', 'Golden State', 'GSW', '2026-01-01T00:00:00Z'),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Celtics', 'Boston', 'BOS', '2026-01-01T00:00:00Z'),
('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Knicks', 'New York', 'NYK', '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.games (id, league_id, home_team_id, away_team_id, starts_at, status, home_score, away_score, created_at)
values
('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
 '2026-10-20T23:00:00Z', 'scheduled', null, null, '2026-01-01T00:00:00Z'),
('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004',
 '2026-10-20T00:00:00Z', 'live', 72, 68, '2026-01-01T00:00:00Z'),
('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
 '2026-10-18T23:30:00Z', 'final', 104, 108, '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

-- The migration's AFTER INSERT trigger creates one room per newly seeded game.
-- Repair a missing room on reapplication without replacing any existing room.
insert into public.game_rooms (game_id)
select id from public.games where id in (
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003'
)
on conflict (game_id) do nothing;

-- Never create fake Auth users or silently attribute fixture text to real users.
-- In the same SQL session, set sports_talk.seed_author_ids to a comma-separated
-- list of 1-3 existing disposable development profile UUIDs to opt in.
do $$
declare
    author_setting text := current_setting('sports_talk.seed_author_ids', true);
    authors uuid[];
begin
    if to_regclass('public.messages') is null then
        raise notice 'Messages migration not applied; message fixtures skipped.';
        return;
    end if;
    if author_setting is null or btrim(author_setting) = '' then
        raise notice 'No development profile IDs supplied; message fixtures skipped.';
        return;
    end if;
    authors := string_to_array(author_setting, ',')::uuid[];
    if cardinality(authors) not between 1 and 3
       or (select count(*) from public.profiles where id = any(authors)) <> cardinality(authors) then
        raise exception 'Supply 1-3 distinct existing development profile IDs.';
    end if;

    insert into public.messages (id, room_id, user_id, content, created_at)
    select f.id::uuid, r.id, authors[(f.author_slot % cardinality(authors)) + 1],
           f.content, f.created_at::timestamptz
    from (values
        ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 0, 'The energy in this fourth quarter is unreal.', '2026-10-19T01:32:00Z'),
        ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 1, 'Knicks are still in this. Need one stop.', '2026-10-19T01:33:00Z'),
        ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 1, 'That rebound was huge!', '2026-10-19T01:33:30Z'),
        ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 2, 'Lakers have to take care of the ball here.', '2026-10-19T01:34:00Z'),
        ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 0, '108-104. That last possession decided it.', '2026-10-19T01:35:00Z'),
        ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', 2, 'Great game. The Knicks nearly pulled it back.', '2026-10-19T01:36:00Z'),
        ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000002', 0, 'Boston is moving the ball well tonight.', '2026-10-20T01:10:00Z'),
        ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000002', 1, 'Only a four-point game. Plenty of time left.', '2026-10-20T01:11:00Z'),
        ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000002', 2, 'That was a really good defensive rotation.', '2026-10-20T01:12:00Z')
    ) as f(id, game_id, author_slot, content, created_at)
    join public.game_rooms r on r.game_id = f.game_id::uuid
    on conflict (id) do nothing;
end;
$$;

commit;
