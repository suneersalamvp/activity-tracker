-- Flowboard board extensions: project statuses, checklists, time-based due dates.
-- Run this after 202611150001_initial_schema.sql.

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add column if not exists due_time time;

create table if not exists public.project_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  position integer not null default 0,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

create index if not exists project_statuses_project_position_idx on public.project_statuses(project_id, position);
alter table public.project_statuses enable row level security;
grant select, insert, update, delete on public.project_statuses to authenticated;
drop policy if exists "statuses_access_project" on public.project_statuses;
create policy "statuses_access_project" on public.project_statuses for all to authenticated
  using ((select authz.can_access_project(project_id)))
  with check ((select authz.can_access_project(project_id)));

create or replace function public.protect_resolved_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_resolved and tg_op = 'DELETE' then
    raise exception 'The Resolved column is permanent.';
  end if;
  if old.is_resolved and tg_op = 'UPDATE' and new.name <> old.name then
    raise exception 'The Resolved column name is permanent.';
  end if;
  if old.is_resolved and tg_op = 'UPDATE' and not (select authz.is_admin()) then
    raise exception 'Only an admin can edit the Resolved column.';
  end if;
  if tg_op = 'UPDATE' and old.is_resolved then new.is_resolved := true; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_resolved_status() from public, anon, authenticated;
drop trigger if exists project_statuses_protect_resolved on public.project_statuses;
create trigger project_statuses_protect_resolved before update or delete on public.project_statuses
  for each row execute function public.protect_resolved_status();

insert into public.project_statuses(project_id, name, position, is_resolved)
select p.id, s.name, s.position, s.name = 'Resolved'
from public.projects p
cross join (values
  ('Note started', 0), ('In progress', 1), ('Processing', 2), ('Under review', 3),
  ('Blocked', 4), ('On hold', 5), ('Completed', 6), ('Delivered', 7),
  ('Final check', 8), ('Closed', 9), ('Resolved', 10)
) as s(name, position)
on conflict (project_id, name) do nothing;

create or replace function public.seed_project_statuses()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_statuses(project_id, name, position, is_resolved) values
    (new.id, 'Note started', 0, false), (new.id, 'In progress', 1, false),
    (new.id, 'Processing', 2, false), (new.id, 'Under review', 3, false),
    (new.id, 'Blocked', 4, false), (new.id, 'On hold', 5, false),
    (new.id, 'Completed', 6, false), (new.id, 'Delivered', 7, false),
    (new.id, 'Final check', 8, false), (new.id, 'Closed', 9, false),
    (new.id, 'Resolved', 10, true);
  return new;
end;
$$;
revoke all on function public.seed_project_statuses() from public, anon, authenticated;
drop trigger if exists projects_seed_statuses on public.projects;
create trigger projects_seed_statuses after insert on public.projects
  for each row execute function public.seed_project_statuses();

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_task_position_idx on public.checklist_items(task_id, position);
alter table public.checklist_items enable row level security;
grant select, insert, update, delete on public.checklist_items to authenticated;
drop policy if exists "checklist_access_task" on public.checklist_items;
create policy "checklist_access_task" on public.checklist_items for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = (select auth.uid()) or (select authz.is_admin()))))
  with check (exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = (select auth.uid()) or (select authz.is_admin()))));

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('day_before','three_hours')),
  message text not null,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(task_id, reminder_kind)
);
alter table public.user_notifications enable row level security;
grant select, update on public.user_notifications to authenticated;
drop policy if exists "notifications_own_read_update" on public.user_notifications;
create policy "notifications_own_read_update" on public.user_notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_own_update" on public.user_notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

