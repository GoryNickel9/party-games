begin;
alter table public.games alter column emoji set default '🎮';
alter table public.games alter column accent set default '#10b981';
commit;
