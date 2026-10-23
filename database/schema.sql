create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key,
  display_name text not null check (char_length(trim(display_name)) between 2 and 32),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table public.games (
  id text primary key,
  name text not null,
  platform text not null,
  category text not null,
  emoji text not null default '🎮',
  accent text not null default '#10b981',
  image_url text,
  description text,
  min_players integer not null default 2 constraint games_min_players_two_check check (min_players = 2),
  max_players integer not null default 4 constraint games_max_players_minimum_check check (max_players >= 2)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 32),
  alias text,
  is_me boolean not null default false,
  avatar_url text,
  color text not null,
  created_at timestamptz not null default now()
);

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id text not null references public.games(id),
  played_at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  location text,
  notes text,
  source text not null default 'manual',
  is_cooperative boolean not null default false,
  team_won boolean,
  created_at timestamptz not null default now(),
  check (team_won is null or is_cooperative)
);

create table public.play_scores (
  play_id uuid not null references public.plays(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score numeric check (score is null or (score >= 0 and score <= 100000)),
  winner boolean not null default false,
  position integer check (position is null or position > 0),
  draw boolean not null default false,
  role text,
  color text,
  primary key (play_id, player_id)
);

create table public.player_ratings (
  player_id uuid not null references public.players(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  rating integer not null default 1000,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  last_played_at timestamptz,
  primary key (player_id, game_id)
);

create table public.player_general_ratings (
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null default 1000,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  last_played_at timestamptz,
  primary key (player_id, user_id)
);

create table public.elo_history (
  id bigserial primary key,
  play_id uuid not null references public.plays(id) on delete cascade,
  game_id text references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null,
  rating integer not null,
  rating_change integer not null,
  played_at timestamptz not null,
  is_general boolean not null default false,
  games_played integer not null,
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.elo_recalc_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_plays integer not null default 0,
  status text not null default 'running',
  error text
);

insert into public.games (id, name, platform, category, emoji, accent, min_players, max_players) values
  ('mk8', 'Mario Kart 8 Deluxe', 'Nintendo Switch', 'Corse', '🏁', '#f06450', 2, 12),
  ('smash', 'Super Smash Bros. Ultimate', 'Nintendo Switch', 'Picchiaduro', '🥊', '#9580fa', 2, 8),
  ('marioparty', 'Super Mario Party Jamboree', 'Nintendo Switch', 'Party', '⭐', '#e9aa45', 2, 4),
  ('overcooked', 'Overcooked! 2', 'PlayStation 5', 'Co-op', '🍳', '#ff826b', 2, 4),
  ('rocket', 'Rocket League', 'PlayStation 5', 'Sport', '🚘', '#5da9ee', 2, 8),
  ('switchsports', 'Nintendo Switch Sports', 'Nintendo Switch', 'Sport', '🎳', '#5cd2ab', 2, 4),
  ('gangbeasts', 'Gang Beasts', 'Xbox Series X', 'Party', '🧸', '#c5a1ed', 2, 8),
  ('justdance', 'Just Dance 2025', 'PlayStation 5', 'Musica', '🪩', '#ec71b7', 2, 6)
on conflict (id) do nothing;

create index players_user_id_idx on public.players(user_id);
create index plays_user_played_idx on public.plays(user_id, played_at desc);
create index play_scores_player_idx on public.play_scores(player_id);
create index elo_history_player_time_idx on public.elo_history(player_id, played_at desc);
create index elo_history_play_idx on public.elo_history(play_id);

-- Shared public views, role-based management and account settings.
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

begin;
alter table public.games alter column emoji set default '🎮';
alter table public.games alter column accent set default '#10b981';
commit;

begin;
alter table public.plays alter column duration_minutes drop not null;
commit;

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

begin;

-- Modes requested for the existing Mario Kart World catalog entry.
insert into public.game_modes (game_id, name)
select g.id, modes.name
from public.games g cross join (values ('Gran Premio'), ('Sopravvivenza')) as modes(name)
where lower(trim(g.name)) = 'mario kart world'
  and not exists (select 1 from public.game_modes m where m.game_id = g.id and lower(trim(m.name)) = lower(modes.name));

-- Preserve Standard's ID and any linked history; offer only the requested modes.
update public.game_modes m set active = false
from public.games g
where m.game_id = g.id and lower(trim(g.name)) = 'mario kart world' and lower(trim(m.name)) = 'standard';

commit;

begin;
create table public.play_comments (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  author_name text not null,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index play_comments_play_time_idx on public.play_comments (play_id, created_at, id);
commit;

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
