-- Flowboard: isolated, per-user projects with an administrator overview.
-- Run this entire file once in Supabase SQL Editor, or apply it as a migration.

create schema if not exists authz;
revoke all on schema authz from public;
grant usage on schema authz to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '',
  color text not null default '#5b67e8',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '',
  status text not null default 'Note started'
    check (status in ('Note started', 'In progress', 'Processing', 'Under review', 'Blocked', 'On hold', 'Completed', 'Delivered', 'Final check', 'Closed')),
  severity text not null default 'Medium'
    check (severity in ('Low', 'Medium', 'High', 'Critical')),
  size text not null default 'M'
    check (size in ('XS', 'S', 'M', 'L', 'XL')),
  due_date date,
  important boolean not null default false,
  image_path text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_created_by_idx on public.projects (created_by, updated_at desc);
create index if not exists tasks_project_status_position_idx on public.tasks (project_id, status, position);
create index if not exists tasks_owner_due_idx on public.tasks (owner_id, due_date);
create index if not exists tasks_updated_at_idx on public.tasks (updated_at desc);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('card_created', 'card_updated')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_events_project_created_idx
  on public.activity_events (project_id, created_at desc);

create or replace function authz.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function authz.is_admin() from public;
grant execute on function authz.is_admin() to authenticated;

create or replace function authz.can_access_project(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    authz.is_admin() or exists (
      select 1 from public.projects p
      where p.id = project_uuid and p.created_by = (select auth.uid())
    )
  );
$$;
revoke all on function authz.can_access_project(uuid) from public;
grant execute on function authz.can_access_project(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    'member'
  );
  return new;
end;
$$;

create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (project_id, task_id, actor_id, action, details)
    values (
      new.project_id,
      new.id,
      (select auth.uid()),
      'card_created',
      jsonb_build_object('title', new.title, 'status', new.status)
    );
  else
    insert into public.activity_events (project_id, task_id, actor_id, action, details)
    values (
      new.project_id,
      new.id,
      (select auth.uid()),
      'card_updated',
      jsonb_build_object(
        'title', new.title,
        'status', new.status,
        'previous_status', old.status,
        'severity', new.severity,
        'due_date', new.due_date
      )
    );
  end if;
  return new;
end;
$$;

-- Trigger-only SECURITY DEFINER functions must not be callable through the public API.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.log_task_activity() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
drop trigger if exists tasks_log_activity on public.tasks;
create trigger tasks_log_activity after insert or update on public.tasks
  for each row execute function public.log_task_activity();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_events enable row level security;

grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.activity_events to authenticated;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "profiles_update_self_name" on public.profiles;
create policy "profiles_update_self_name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "projects_read_owner_or_admin" on public.projects;
create policy "projects_read_owner_or_admin" on public.projects
  for select to authenticated
  using (created_by = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "projects_create_owner_or_admin" on public.projects;
create policy "projects_create_owner_or_admin" on public.projects
  for insert to authenticated
  with check (created_by = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "projects_update_owner_or_admin" on public.projects;
create policy "projects_update_owner_or_admin" on public.projects
  for update to authenticated
  using (created_by = (select auth.uid()) or (select authz.is_admin()))
  with check (created_by = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "projects_delete_owner_or_admin" on public.projects;
create policy "projects_delete_owner_or_admin" on public.projects
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "tasks_read_owner_or_admin" on public.tasks;
create policy "tasks_read_owner_or_admin" on public.tasks
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "tasks_create_owner_or_admin" on public.tasks;
create policy "tasks_create_owner_or_admin" on public.tasks
  for insert to authenticated
  with check (
    (owner_id = (select auth.uid()) and exists (
      select 1 from public.projects p where p.id = project_id and p.created_by = (select auth.uid())
    ))
    or (select authz.is_admin())
  );

drop policy if exists "tasks_update_owner_or_admin" on public.tasks;
create policy "tasks_update_owner_or_admin" on public.tasks
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select authz.is_admin()))
  with check (
    (owner_id = (select auth.uid()) and exists (
      select 1 from public.projects p where p.id = project_id and p.created_by = (select auth.uid())
    ))
    or (select authz.is_admin())
  );

drop policy if exists "tasks_delete_owner_or_admin" on public.tasks;
create policy "tasks_delete_owner_or_admin" on public.tasks
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select authz.is_admin()));

drop policy if exists "activity_read_owner_or_admin" on public.activity_events;
create policy "activity_read_owner_or_admin" on public.activity_events
  for select to authenticated
  using (
    (select authz.is_admin()) or exists (
      select 1 from public.tasks t
      where t.id = task_id and t.owner_id = (select auth.uid())
    )
  );

-- Enable live board refreshes for authorized clients.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
      execute 'alter publication supabase_realtime add table public.tasks';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects') then
      execute 'alter publication supabase_realtime add table public.projects';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
      execute 'alter publication supabase_realtime add table public.profiles';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events') then
      execute 'alter publication supabase_realtime add table public.activity_events';
    end if;
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-attachments',
  'activity-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "activity_images_read_project" on storage.objects;
create policy "activity_images_read_project" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'activity-attachments'
    and (select authz.can_access_project(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "activity_images_upload_project" on storage.objects;
create policy "activity_images_upload_project" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'activity-attachments'
    and (select authz.can_access_project(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "activity_images_update_project" on storage.objects;
create policy "activity_images_update_project" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'activity-attachments'
    and (select authz.can_access_project(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'activity-attachments'
    and (select authz.can_access_project(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "activity_images_delete_project" on storage.objects;
create policy "activity_images_delete_project" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'activity-attachments'
    and (select authz.can_access_project(((storage.foldername(name))[1])::uuid))
  );
