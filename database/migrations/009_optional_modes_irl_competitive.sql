begin;

-- Remove the extra default from Mario Kart World without deleting any plays.
update public.plays set mode_id=null
where mode_id in (
  select m.id from public.game_modes m join public.games g on g.id=m.game_id
  where lower(trim(g.name))='mario kart world' and lower(trim(m.name))='standard'
);
delete from public.game_modes m using public.games g
where g.id=m.game_id and lower(trim(g.name))='mario kart world' and lower(trim(m.name))='standard';

-- PartyScore records competitive games played in person.
update public.plays set source='offline',is_cooperative=false,team_won=null;
alter table public.plays alter column source set default 'offline';
alter table public.plays add constraint plays_irl_competitive_check
  check (source='offline' and is_cooperative=false and team_won is null);
commit;
