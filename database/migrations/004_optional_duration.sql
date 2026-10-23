begin;
alter table public.plays alter column duration_minutes drop not null;
commit;
