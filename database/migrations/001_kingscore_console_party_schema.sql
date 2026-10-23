-- Allineamento additivo al modello KingScore; i dati delle vecchie tabelle vengono rinominati, non copiati/eliminati.
create extension if not exists pgcrypto;

do $$ begin
  if to_regclass('public.plays') is null and to_regclass('public.matches') is not null then
    alter table public.matches rename to plays;
  end if;
  if to_regclass('public.play_scores') is null and to_regclass('public.match_results') is not null then
    alter table public.match_results rename to play_scores;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='plays' and column_name='duration') then
    alter table public.plays rename column duration to duration_minutes;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='play_scores' and column_name='match_id') then
    alter table public.play_scores rename column match_id to play_id;
  end if;
end $$;

alter table public.games add column if not exists image_url text;
alter table public.games add column if not exists description text;
alter table public.games add column if not exists min_players integer;
alter table public.games add column if not exists max_players integer;
alter table public.players add column if not exists alias text;
alter table public.players add column if not exists is_me boolean not null default false;
alter table public.players add column if not exists avatar_url text;
alter table public.plays add column if not exists location text;
alter table public.plays add column if not exists notes text;
alter table public.plays add column if not exists source text not null default 'manual';
alter table public.plays add column if not exists is_cooperative boolean not null default false;
alter table public.plays add column if not exists team_won boolean;
alter table public.play_scores alter column score drop not null;
alter table public.play_scores add column if not exists winner boolean not null default false;
alter table public.play_scores add column if not exists position integer;
alter table public.play_scores add column if not exists draw boolean not null default false;
alter table public.play_scores add column if not exists role text;
alter table public.play_scores add column if not exists color text;

with ranked as (
  select play_id, player_id,
    rank() over (partition by play_id order by score desc) as placement,
    max(score) over (partition by play_id) as top_score
  from public.play_scores
)
update public.play_scores ps
set winner = (r.placement = 1), position = r.placement, draw = false
from ranked r
where ps.play_id = r.play_id and ps.player_id = r.player_id and ps.position is null;

create table if not exists public.player_ratings (
  player_id uuid not null references public.players(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  rating integer not null default 1000, games_played integer not null default 0,
  wins integer not null default 0, losses integer not null default 0, draws integer not null default 0,
  last_played_at timestamptz, primary key (player_id, game_id)
);
create table if not exists public.player_general_ratings (
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null default 1000, games_played integer not null default 0,
  wins integer not null default 0, losses integer not null default 0, draws integer not null default 0,
  last_played_at timestamptz, primary key (player_id, user_id)
);
create table if not exists public.elo_history (
  id bigserial primary key,
  play_id uuid not null references public.plays(id) on delete cascade,
  game_id text references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null,
  rating integer not null,
  rating_change integer not null,
  played_at timestamptz not null,
  is_general boolean not null default false,
  games_played integer not null
);
create table if not exists public.elo_recalc_runs (
  id bigserial primary key, started_at timestamptz not null default now(),
  finished_at timestamptz, processed_plays integer not null default 0,
  status text not null default 'running', error text
);
alter table public.elo_history add column if not exists user_id uuid references public.users(id) on delete cascade;
update public.elo_history h set user_id = p.user_id from public.plays p where p.id = h.play_id and h.user_id is null;
alter table public.elo_history alter column user_id set not null;

update public.games set min_players = 1, max_players = case id
  when 'mk8' then 12 when 'smash' then 8 when 'marioparty' then 4 when 'overcooked' then 4
  when 'rocket' then 8 when 'switchsports' then 4 when 'gangbeasts' then 8 when 'justdance' then 6 else max_players end
where id in ('mk8','smash','marioparty','overcooked','rocket','switchsports','gangbeasts','justdance') and min_players is null;

create index if not exists plays_user_played_idx on public.plays(user_id, played_at desc);
create index if not exists play_scores_player_idx on public.play_scores(player_id);
create index if not exists elo_history_player_time_idx on public.elo_history(player_id, played_at desc);
create index if not exists elo_history_play_idx on public.elo_history(play_id);
