-- Milestone 2. Apply after 20260908000000_auth_profiles.sql.
-- Legacy lib/supabase/migrations drafts must not be applied.
-- Existing sports tables cause a transactional failure, not silent schema reuse.
begin;

create table public.leagues (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    abbreviation text not null unique,
    sport text not null,
    created_at timestamptz not null default now()
);

create table public.teams (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    name text not null,
    city text,
    abbreviation text not null,
    logo_url text,
    created_at timestamptz not null default now(),
    unique (league_id, abbreviation),
    -- Supports composite FKs so a game's teams must belong to its league.
    unique (id, league_id)
);

create table public.games (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    home_team_id uuid not null,
    away_team_id uuid not null,
    starts_at timestamptz not null,
    status text not null default 'scheduled'
        check (status in ('scheduled', 'live', 'final', 'postponed', 'cancelled')),
    home_score integer check (home_score >= 0),
    away_score integer check (away_score >= 0),
    created_at timestamptz not null default now(),
    constraint games_different_teams check (home_team_id <> away_team_id),
    constraint games_home_team_id_fkey foreign key (home_team_id, league_id)
        references public.teams(id, league_id),
    constraint games_away_team_id_fkey foreign key (away_team_id, league_id)
        references public.teams(id, league_id)
);

create index games_starts_at_idx on public.games(starts_at);

create table public.game_rooms (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null unique references public.games(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.game_rooms enable row level security;

revoke all on table public.leagues, public.teams, public.games, public.game_rooms
    from public, anon, authenticated;
grant select on table public.leagues, public.teams, public.games, public.game_rooms
    to authenticated;

create policy leagues_authenticated_read on public.leagues
    for select to authenticated using (true);
create policy teams_authenticated_read on public.teams
    for select to authenticated using (true);
create policy games_authenticated_read on public.games
    for select to authenticated using (true);
create policy game_rooms_authenticated_read on public.game_rooms
    for select to authenticated using (true);

-- Uniqueness prevents duplicate rooms; this trigger also ensures new games
-- receive a room without depending on a second browser/admin request.
create function public.create_room_for_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.game_rooms (game_id) values (new.id);
    return new;
end;
$$;

revoke all on function public.create_room_for_game() from public, anon, authenticated;

create trigger on_game_created_create_room
    after insert on public.games
    for each row execute function public.create_room_for_game();

commit;
