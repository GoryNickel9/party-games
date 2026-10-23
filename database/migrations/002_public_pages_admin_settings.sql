begin;
alter table public.users add column if not exists role text not null default 'user' check (role in ('user', 'admin'));
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists session_version integer not null default 0;
alter table public.players add column if not exists account_user_id uuid unique references public.users(id) on delete set null;
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  registrations_open boolean not null default true
);
insert into public.app_settings (id) values (true) on conflict do nothing;
update public.users set role = 'admin' where lower(email) = 'lucabaldino10@proton.me';
create index if not exists plays_public_date_idx on public.plays (played_at desc, id);
commit;
