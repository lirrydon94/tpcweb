-- Run in the Supabase SQL editor. This app uses one shared workspace.
-- Authenticated users can read the published schedule. Only database admins edit.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'admin'))
);
alter table public.profiles enable row level security;
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.skift_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, role) values (new.id, 'viewer') on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.skift_new_user() from public, anon, authenticated;
drop trigger if exists skift_profile_created on auth.users;
create trigger skift_profile_created after insert on auth.users
for each row execute function public.skift_new_user();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

create table if not exists public.workspace (
  id integer primary key default 1 check (id = 1),
  draft jsonb not null,
  published jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.workspace enable row level security;
-- No direct table API access, including to the draft. Use the checked RPCs below.
revoke all on public.workspace from public, anon, authenticated;
insert into public.workspace(id, draft, published) values (
  1,
  '{"schemaVersion":1,"teams":[],"exceptions":[],"publishedAt":null}'::jsonb,
  '{"schemaVersion":1,"teams":[],"exceptions":[],"publishedAt":null}'::jsonb
) on conflict (id) do nothing;

create or replace function public.skift_role()
returns text language plpgsql stable security definer set search_path = '' as $$
declare result text;
begin
  if auth.uid() is null then raise exception 'Sign in to view the schedule.'; end if;
  select role into result from public.profiles where id = auth.uid();
  if result is null then raise exception 'Your account has no workspace profile.'; end if;
  return result;
end;
$$;
revoke all on function public.skift_role() from public, anon, authenticated;

create or replace function public.skift_validate_state(state jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare team jsonb; item jsonb; version jsonb; row_data jsonb; cell jsonb; member jsonb; shift record;
begin
  if state is null or jsonb_typeof(state) <> 'object'
    or state->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(state->'teams') is distinct from 'array'
    or jsonb_typeof(state->'exceptions') is distinct from 'array' then
    raise exception 'Invalid schedule structure. Expected schemaVersion 1, teams and exceptions.';
  end if;
  if octet_length(state::text) > 5000000 or jsonb_array_length(state->'teams') > 100
    or jsonb_array_length(state->'exceptions') > 25000 then
    raise exception 'The schedule exceeds the storage limit.';
  end if;
  for team in select value from jsonb_array_elements(state->'teams') loop
    if jsonb_typeof(team) <> 'object' or jsonb_typeof(team->'id') is distinct from 'string'
      or jsonb_typeof(team->'name') is distinct from 'string'
      or jsonb_typeof(team->'members') is distinct from 'array'
      or jsonb_typeof(team->'versions') is distinct from 'array' then
      raise exception 'Every team needs an id and name.';
    end if;
    if jsonb_array_length(team->'members') > 1000 or jsonb_array_length(team->'versions') > 1000 then
      raise exception 'A team exceeds the member or version limit.';
    end if;
    for member in select value from jsonb_array_elements(team->'members') loop
      if jsonb_typeof(member) <> 'object'
        or jsonb_typeof(member->'id') is distinct from 'string'
        or jsonb_typeof(member->'name') is distinct from 'string'
        or member->>'role' is null or member->>'role' not in ('member', 'part-time') then
        raise exception 'Every coworker needs an id, name and valid role.';
      end if;
    end loop;
    for version in select value from jsonb_array_elements(team->'versions') loop
      if jsonb_typeof(version) <> 'object'
        or jsonb_typeof(version->'id') is distinct from 'string'
        or jsonb_typeof(version->'rotation') is distinct from 'array'
        or jsonb_typeof(version->'positions') is distinct from 'object'
        or jsonb_typeof(version->'shifts') is distinct from 'object'
        or version->>'effectiveFrom' is null or not (version->>'effectiveFrom' ~ '^\d{4}-\d{2}-\d{2}$')
        or version->>'referenceMonday' is null or not (version->>'referenceMonday' ~ '^\d{4}-\d{2}-\d{2}$') then
        raise exception 'A rotation version has an invalid structure.';
      end if;
      if jsonb_array_length(version->'rotation') < 1 or jsonb_array_length(version->'rotation') > 104 then
        raise exception 'A rotation must contain between 1 and 104 weeks.';
      end if;
      for shift in select key, value as content from jsonb_each(version->'shifts') loop
        if jsonb_typeof(shift.content) <> 'object'
          or shift.content->>'start' is null or not (shift.content->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
          or shift.content->>'end' is null or not (shift.content->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
          or shift.content->>'start' = shift.content->>'end' then
          raise exception 'A shift has invalid working hours.';
        end if;
      end loop;
      for row_data in select value from jsonb_array_elements(version->'rotation') loop
        if jsonb_typeof(row_data) <> 'array' then raise exception 'A rotation week must have seven days.'; end if;
        if jsonb_array_length(row_data) <> 7 then raise exception 'A rotation week must have seven days.'; end if;
        for cell in select value from jsonb_array_elements(row_data) loop
          if jsonb_typeof(cell) <> 'string' then raise exception 'Shift codes must be text.'; end if;
          if cell #>> '{}' <> '' and not (version->'shifts' ? (cell #>> '{}')) then
            raise exception 'A rotation refers to an unknown shift code.';
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(state->'exceptions') loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'teamId') is distinct from 'string'
      or jsonb_typeof(item->'memberId') is distinct from 'string'
      or (item->>'date') is null or not (item->>'date' ~ '^\d{4}-\d{2}-\d{2}$')
      or (item->>'type') is null or item->>'type' not in ('vacation', 'sick', 'pension', 'custom', 'off') then
      raise exception 'An individual schedule change has an invalid structure.';
    end if;
  end loop;
end;
$$;
revoke all on function public.skift_validate_state(jsonb) from public, anon, authenticated;

-- Remove private fields recursively; never send these to a coworker's browser.
create or replace function public.skift_strip_private(value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb; item record;
begin
  if jsonb_typeof(value) = 'object' then
    result := '{}'::jsonb;
    for item in select fields.key, fields.value as content
      from jsonb_each(skift_strip_private.value) as fields loop
      if item.key not in ('note', 'reason', 'adminNote', 'medicalDetails') then
        result := result || jsonb_build_object(item.key, public.skift_strip_private(item.content));
      end if;
    end loop;
    return result;
  elsif jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(public.skift_strip_private(content) order by ordinal), '[]'::jsonb)
      into result from jsonb_array_elements(value) with ordinality as items(content, ordinal);
    return result;
  end if;
  return value;
end;
$$;
revoke all on function public.skift_strip_private(jsonb) from public, anon, authenticated;

create or replace function public.skift_public_state(state jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb; entries jsonb;
begin
  result := public.skift_strip_private(state);
  select coalesce(jsonb_agg(
    case when entry->>'type' in ('sick', 'vacation', 'pension') then
      jsonb_set(entry, '{type}', to_jsonb(case
        when entry->>'type' = 'pension' and nullif(entry->>'start', '') is not null
          and nullif(entry->>'end', '') is not null then 'custom'
        else 'off' end))
    else entry end order by ordinal), '[]'::jsonb)
  into entries from jsonb_array_elements(result->'exceptions') with ordinality as items(entry, ordinal);
  result := jsonb_set(result, '{exceptions}', entries);
  return jsonb_set(result, '{publishedAt}', to_jsonb(now()));
end;
$$;
revoke all on function public.skift_public_state(jsonb) from public, anon, authenticated;

create or replace function public.get_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare access_role text; current_workspace public.workspace%rowtype;
begin
  access_role := public.skift_role();
  select * into current_workspace from public.workspace where id = 1;
  if not found then raise exception 'The shared workspace has not been configured.'; end if;
  return jsonb_build_object(
    'role', access_role,
    'working', case when access_role = 'admin' then current_workspace.draft else current_workspace.published end,
    'published', current_workspace.published,
    'revision', current_workspace.revision
  );
end;
$$;
revoke all on function public.get_workspace() from public, anon;
grant execute on function public.get_workspace() to authenticated;

create or replace function public.save_draft(p_draft jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if public.skift_role() <> 'admin' then raise exception 'Administrator access required.'; end if;
  perform public.skift_validate_state(p_draft);
  select revision into current_revision from public.workspace where id = 1 for update;
  if not found then raise exception 'The shared workspace has not been configured.'; end if;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'Workspace revision changed. Reload before saving.';
  end if;
  update public.workspace set draft = p_draft, revision = revision + 1, updated_at = now() where id = 1;
  return public.get_workspace();
end;
$$;
revoke all on function public.save_draft(jsonb, bigint) from public, anon;
grant execute on function public.save_draft(jsonb, bigint) to authenticated;

create or replace function public.publish_workspace(p_draft jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; new_published jsonb;
begin
  if public.skift_role() <> 'admin' then raise exception 'Administrator access required.'; end if;
  perform public.skift_validate_state(p_draft);
  select revision into current_revision from public.workspace where id = 1 for update;
  if not found then raise exception 'The shared workspace has not been configured.'; end if;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'Workspace revision changed. Reload before publishing.';
  end if;
  new_published := public.skift_public_state(p_draft);
  update public.workspace set
    draft = jsonb_set(p_draft, '{publishedAt}', new_published->'publishedAt'),
    published = new_published, revision = revision + 1, updated_at = now() where id = 1;
  return public.get_workspace();
end;
$$;
revoke all on function public.publish_workspace(jsonb, bigint) from public, anon;
grant execute on function public.publish_workspace(jsonb, bigint) to authenticated;

-- First create your account under Authentication > Users, then promote it:
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'your@email.example');
-- New users stay viewers. Users cannot change their own role through the API.
