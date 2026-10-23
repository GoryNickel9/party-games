-- Recupera le foto pubbliche già presenti in KingScore, senza sovrascrivere immagini impostate in PartyScore.
-- I collegamenti provengono dal bucket pubblico player-images di KingScore (3 ottobre 2026).
with source_avatars (player_id, avatar_url) as (values
  ('09d86d9e-8101-489e-a06b-72617ec5c5ca'::uuid, 'https://rixivmeipbizoxyvrvaf.supabase.co/storage/v1/object/public/player-images/580130e9-2e27-4a52-8365-441b5d698eb0/avatars/1772662451847-0m0ywdvlpcce.png'), -- Ale: KetoGhost
  ('1587fa37-f25e-4270-95f1-8d41a4bfe11d'::uuid, 'https://rixivmeipbizoxyvrvaf.supabase.co/storage/v1/object/public/player-images/580130e9-2e27-4a52-8365-441b5d698eb0/avatars/1772649989992-slesoj32vy.jpg'), -- Il Fattone: lpiero95
  ('9d6f1199-a471-49d6-83f0-d6fc1c5d2bbf'::uuid, 'https://rixivmeipbizoxyvrvaf.supabase.co/storage/v1/object/public/player-images/580130e9-2e27-4a52-8365-441b5d698eb0/avatars/1772649973937-f8h8nrew5ca.jpg'), -- Luca: GoryNickel9
  ('ffaa6dd6-a69e-417f-b34a-3799997599f0'::uuid, 'https://rixivmeipbizoxyvrvaf.supabase.co/storage/v1/object/public/player-images/580130e9-2e27-4a52-8365-441b5d698eb0/avatars/1772649733285-5wu44mnhfa.jpg') -- Silvia: cryybaabyyyy
), restored_players as (
  update public.players p set avatar_url=s.avatar_url
  from source_avatars s
  where p.id=s.player_id and nullif(p.avatar_url, '') is null
  returning p.id,p.avatar_url,p.account_user_id
), restored_accounts as (
  update public.users u set avatar_url=p.avatar_url
  from restored_players p
  where u.id=p.account_user_id and nullif(u.avatar_url, '') is null
  returning u.id
)
select (select count(*) from restored_players) as restored_players,
       (select count(*) from restored_accounts) as restored_accounts;
