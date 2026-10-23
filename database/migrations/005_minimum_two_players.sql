begin;

update public.games
set min_players = 2,
    max_players = greatest(coalesce(max_players, 4), 2)
where min_players is distinct from 2 or max_players is null or max_players < 2;

alter table public.games
  alter column min_players set default 2,
  alter column min_players set not null,
  alter column max_players set default 4,
  alter column max_players set not null,
  add constraint games_min_players_two_check check (min_players = 2),
  add constraint games_max_players_minimum_check check (max_players >= 2);

commit;
