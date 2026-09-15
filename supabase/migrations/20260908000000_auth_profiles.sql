-- Milestone 1 only. The older lib/supabase/migrations files are conflicting
-- drafts, not prerequisites. This also accepts the profiles table from draft 001
-- or 002 if it was already created with the documented columns and constraints.
begin;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null,
    display_name text,
    avatar_url text,
    created_at timestamptz not null default now()
);

-- Existing invalid usernames deliberately fail migration validation; do not
-- silently rename existing users. Resolve such data before applying this file.
alter table public.profiles
    add constraint profiles_username_format
    check (username ~ '^[A-Za-z0-9_]{3,30}$');

alter table public.profiles enable row level security;

-- Clients cannot insert/delete profiles, move their IDs, or change created_at.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url)
    on table public.profiles to authenticated;

create policy profiles_public_read
    on public.profiles for select to anon, authenticated
    using (true);

create policy profiles_update_own
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- NEW.id comes from Auth, never from client-supplied metadata.
    -- Constraints reject missing/invalid/duplicate usernames and roll back the
    -- Auth insert too. Never swallow a conflict and leave a user without a profile.
    insert into public.profiles (id, username)
    values (new.id, btrim(new.raw_user_meta_data ->> 'username'));
    return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user()
    from public, anon, authenticated;

create trigger on_auth_user_created_create_profile
    after insert on auth.users
    for each row execute function public.create_profile_for_auth_user();

commit;
