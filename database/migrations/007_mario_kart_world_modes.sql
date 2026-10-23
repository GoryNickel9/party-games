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
