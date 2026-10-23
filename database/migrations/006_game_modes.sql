begin;

create table if not exists public.game_modes (
  id text primary key default gen_random_uuid()::text,
  game_id text not null references public.games(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  active boolean not null default true,
  unique (game_id, id)
);
create unique index if not exists game_modes_name_idx on public.game_modes (game_id, lower(trim(name)));

-- Standard is editable. Historical plays keep NULL rather than guessing a mode.
insert into public.game_modes (id, game_id, name)
select gen_random_uuid()::text, g.id, 'Standard' from public.games g
where not exists (select 1 from public.game_modes m where m.game_id = g.id);

alter table public.plays add column if not exists mode_id text;
alter table public.plays add constraint plays_game_mode_fk
  foreign key (game_id, mode_id) references public.game_modes (game_id, id);
create index if not exists plays_game_mode_idx on public.plays (game_id, mode_id, played_at);

create table public.player_mode_ratings (
  player_id uuid not null references public.players(id) on delete cascade,
  game_id text not null,
  mode_id text not null,
  rating integer not null default 1000,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  last_played_at timestamptz,
  primary key (player_id, mode_id),
  foreign key (game_id, mode_id) references public.game_modes (game_id, id) on delete cascade
);

create table public.mode_elo_history (
  play_id uuid not null references public.plays(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id text not null,
  mode_id text not null,
  rating integer not null,
  rating_change integer not null,
  played_at timestamptz not null,
  primary key (play_id, player_id),
  foreign key (game_id, mode_id) references public.game_modes (game_id, id) on delete cascade
);
create index mode_elo_history_mode_time_idx on public.mode_elo_history (mode_id, played_at);
commit;
