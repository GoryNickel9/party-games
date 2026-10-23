# PartyScore

Tracker dei party game su console, con pagine e flussi ripresi da KingScore. Vercel ospita frontend e API; PostgreSQL su Neon conserva account, giochi, player, partite e rating.

Sito: [partyscore.baldeddu.cc](https://partyscore.baldeddu.cc/).

## Accesso e permessi

| Pagine e operazioni | Accesso |
| --- | --- |
| Dashboard, Partite, Statistiche, Rating ELO, Wrapped | Pubblico |
| Dettaglio di una partita o di un gioco | Pubblico |
| Impostazioni e dettaglio giocatore | Utenti registrati |
| Giochi, Giocatori, aggiunta giocatore, Admin | Admin |
| Aggiunta, modifica ed eliminazione partite | Admin, come nelle rotte di KingScore |
| Lettura commenti | Pubblico |
| Scrittura commenti | Utenti registrati; modifica ed eliminazione solo per l’autore |

Il ruolo è salvato in `users.role` e controllato nelle API. La migrazione 002 assegna il ruolo admin all’account già esistente `lucabaldino10@proton.me`. La registrazione crea sempre utenti normali.

## Pagine

1. L’aggiunta partita apre `/plays/new`. Il modulo contiene gioco, eventuale modalità, data, luogo, durata, punteggi, vincitori e note. Le partite si svolgono sempre dal vivo e hanno esiti competitivi.
2. Rating ELO contiene classifica generale, selezione gioco e modalità, classifica per gioco e per modalità, e spiegazione del calcolo. Il simulatore e l’assegnazione delle posizioni provengono da KingScore.
3. Wrapped filtra per anno e giocatore. Mostra totale partite/ore/giochi, gioco dell’anno, mese più giocato, vittorie, record, classifica e andamento ELO, attività mensile.
4. Admin contiene Panoramica, Giocatori e Registrazioni. Permette di collegare un player a un account e di aprire o chiudere le registrazioni.
5. Giochi gestisce nome, console, categoria, numero di giocatori, copertina e modalità; Impostazioni gestisce profilo, email e password.

La dashboard mostra le copertine nel gioco preferito, nelle liste dei giochi e nelle ultime partite. Come in KingScore, le liste usano immagini da 64 pixel e «Ultime Partite» da 48 pixel. «Vittorie del mese» mostra le foto dei player da 64 pixel. Se un’immagine manca o non si carica, mostra l’icona del gioco o le iniziali del player.

La sezione «Ultime Partite» permette di aprire il dettaglio e lo storico completo. Non mostra pulsanti per modificare o eliminare le partite, anche agli admin.

Partite riprende lo storico di KingScore: pannello dei filtri separato, schede con copertina da 80 pixel, data, luogo, durata, punteggi, vincitore e note. La ricerca considera gioco, note e giocatori; i filtri includono gioco, eventuale modalità, anno e mese. Ogni pagina contiene al massimo 20 partite e mostra il numero dei commenti accanto al titolo.

Le date delle partite mostrano soltanto il giorno, senza l’ora. Le schede e le liste dei giochi non mostrano l’intervallo dei giocatori supportati; questo resta configurabile nella gestione Giochi.

Il menu Statistiche contiene un solo collegamento alla pagina generale.

Il menu a tendina dell’admin contiene Giochi, Giocatori, Pannello admin, Impostazioni ed Esci. I pulsanti per aggiungere partite e giocatori si trovano nelle rispettive pagine.

Il menu principale contiene «KingScore» subito dopo «Wrapped», sia su desktop sia su mobile. Il collegamento apre [KingScore](https://kingscore.baldeddu.cc/) nella stessa scheda; da quel sito la voce «PartyScore» permette di tornare qui.

Il dettaglio partita riprende il layout di KingScore: copertina, data, luogo e durata, eventuale modalità, note, commenti e tabella dei punteggi. La tabella mostra posizione, giocatore, punteggio, vincitore, ELO del gioco ed ELO generale, con le variazioni prodotte da quella partita.

L’admin apre «Modifica» dalla riga dello storico o dal dettaglio, nella rotta `/plays/:id/edit`. Il modulo precompilato aggiorna la stessa partita e sostituisce i punteggi in una transazione: se una scrittura fallisce, restano i dati precedenti. ID, autore e data di creazione restano invariati; cambiare solo i punteggi conserva anche l’orario originale. Il gioco è fisso: ricerca, cambio del gioco e aggiunta di un nuovo gioco sono disponibili solo quando si crea una partita. La modalità è obbligatoria se il gioco ne ha almeno una, anche quando si modifica una partita storica senza modalità. Una modalità già archiviata può essere mantenuta, mentre una nuova selezione deve essere attiva. Se sono tutte archiviate e la partita non ne ha una associata, occorre attivarne una nella gestione giochi. Il salvataggio ricalcola gli ELO, compresi quelli delle partite successive.

I commenti accettano da 1 a 1000 caratteri e mostrano autore, data e indicazione delle modifiche. Il server assegna l’autore dalla sessione. Anche gli admin possono modificare o eliminare solo i propri commenti.

La pagina Statistiche contiene ELO Generale e Statistiche per Gioco, con la struttura di KingScore. Il grafico generale mostra tutti i giocatori e tutto lo storico. Ogni gioco mostra partite totali, punteggio medio e durata media; “Statistiche giocatori” apre le medie individuali e lo storico ELO di quel gioco. Le medie dei punteggi conteggiano ogni risultato individuale, quelle della durata ogni partita.

## Database e immagini

Lo schema completo è in `database/schema.sql`; gli aggiornamenti sono in `database/migrations`.

- `001_kingscore_console_party_schema.sql`: tabelle `plays`, `play_scores`, rating e storico ELO.
- `002_public_pages_admin_settings.sql`: ruolo account, avatar, versione sessione, account collegati ai player e apertura delle registrazioni.
- `003_game_defaults.sql`: valori predefiniti per icona e colore dei giochi.
- `004_optional_duration.sql`: durata facoltativa delle partite, come in KingScore.
- `005_minimum_two_players.sql`: minimo fisso di 2 giocatori; aggiorna i giochi esistenti e aggiunge i vincoli al database.
- `006_game_modes.sql`: catalogo delle modalità, collegamento alle partite, cache e storico ELO per modalità.
- `007_mario_kart_world_modes.sql`: aggiunge Gran Premio e Sopravvivenza a Mario Kart World e archivia la modalità Standard.
- `008_play_comments.sql`: commenti delle partite, con collegamento ad autore e partita; l’eliminazione della partita rimuove anche i suoi commenti.
- `009_optional_modes_irl_competitive.sql`: elimina Standard da Mario Kart World e impone partite dal vivo senza cooperazione. Mantiene partite e punteggi.
- `010_restore_player_avatars.sql`: recupera le foto pubbliche di Ale, Luca, Silvia e Il Fattone da KingScore e aggiorna gli account collegati. Modifica soltanto i campi delle immagini vuoti.

Le immagini possono essere URL HTTPS o file JPEG, PNG e WebP. Il browser ridimensiona i file a un massimo di 640 pixel e li salva come WebP in Neon. Il server limita ogni immagine a 500.000 caratteri base64. Le eliminazioni di giochi o player con partite vengono rifiutate per conservare lo storico.

Le foto recuperate da KingScore usano gli URL pubblici del suo bucket `player-images`. I file restano nello storage originale; nome, alias e risultati dei player di PartyScore restano invariati.

Il salvataggio o l’eliminazione di una partita aggiorna la cache ELO sul server. Il pulsante admin “Ricalcola Tutti gli ELO” ricostruisce `player_ratings`, `player_general_ratings` ed `elo_history`. Le scritture della cache sono atomiche; le pagine calcolano i valori dallo storico delle partite, così restano leggibili anche se un aggiornamento della cache fallisce.

## Modalità di gioco

Ogni gioco può avere da 0 a 30 modalità. Un nuovo gioco parte senza modalità. In Giochi → Modifica l’admin può aggiungerle, rinominarle, archiviarle o eliminarle, anche tutte. Mario Kart World ha soltanto Gran Premio e Sopravvivenza.

Il salvataggio richiede una modalità quando il gioco ne ha almeno una. Per i giochi senza modalità, `mode_id = NULL` resta valido e il selettore non compare. Le partite storiche senza modalità restano leggibili; se il gioco ora ne prevede, bisogna sceglierne una prima di salvare una modifica. Il database verifica il collegamento con una chiave esterna composta da gioco e modalità.

Il cestino rimuove una modalità dal modulo; «Salva modifiche» applica l’eliminazione. Il server azzera il collegamento delle partite interessate e cancella la modalità nella stessa transazione, poi ricostruisce gli ELO. Partite, punteggi, ELO per gioco ed ELO generale restano disponibili. La classifica specifica della modalità eliminata viene rimossa.

Rating ELO, storico partite, dettaglio gioco e statistiche permettono di selezionare la modalità. Ogni rating per modalità parte da 1000 e considera soltanto le partite di quella modalità. I rating complessivi per gioco e l’ELO generale conservano il calcolo esistente. Il ricalcolo ricostruisce anche `player_mode_ratings` e `mode_elo_history` nella stessa transazione delle cache precedenti. Le partite senza modalità partecipano alle classifiche complessive del gioco e generali.

Nel dettaglio partita gli ELO compaiono nell’ordine: **ELO modalità** (se la partita ha una modalità), **ELO gioco**, **ELO Generale**. Per i giochi senza modalità, la colonna del gioco si chiama **ELO**. Ogni valore e variazione si riferisce a quella partita, prima delle partite successive.

Golf (3, 9 e 18 buche) usa punteggi crescenti: 5 precede 6, che precede 10. La stessa regola vale per le posizioni, lo storico e tutti gli ELO. I vincitori selezionati restano al primo posto. Per salvare una partita è obbligatorio selezionare almeno un vincitore tra i partecipanti; per un pareggio se ne possono selezionare più di uno. Il modulo e le API applicano gli stessi controlli e rifiutano anche i flag vincitore assenti: il salvataggio non li ricava dal punteggio. Solo la lettura delle partite storiche prive di questi flag continua a ricavare il vincitore dal punteggio minimo. Le posizioni storiche di Golf vengono ricalcolate durante la lettura e la simulazione; non occorre modificare le partite esistenti. Dopo la pubblicazione usa «Ricalcola Tutti gli ELO» per aggiornare anche le cache nel database.

La regola riconosce la parola «Golf» nel nome del gioco o della modalità, comprese quelle archiviate. Rinominare o eliminare una modalità può cambiarne la regola applicata alle partite storiche: conserva «Golf» nel nome finché queste devono usare il punteggio crescente. Gli altri giochi mantengono il punteggio decrescente.

Applica le migrazioni 006, 007, 008 e 009 prima di pubblicare le nuove API. I giochi e le partite esistenti restano leggibili dalle API precedenti. Per un database nuovo usa lo schema completo, che include queste migrazioni.

## Sviluppo

```powershell
npm install
npm run dev
```

Il server Vite inoltra `/api` al sito pubblicato. Per eseguire anche le API in locale usa `vercel dev` con `DATABASE_URL` e `SESSION_SECRET` configurati.

La demo richiede un’attivazione esplicita:

```powershell
$env:VITE_DEMO_MODE = 'true'
node node_modules/vite/bin/vite.js --port 5175
```

Non impostare `VITE_DEMO_MODE` in produzione. Le variabili del database e della sessione devono restare sul server, senza prefisso `VITE_`.

## Verifiche

```powershell
npm run test
npm run build
```

I test comprendono quelli originali di KingScore per formule ELO e posizioni, più controlli per permessi, dati pubblici, immagini e modalità. Il test `src/neon.integration.test.ts` viene eseguito solo con `NEON_TEST_DATABASE_URL` e accetta esclusivamente il ramo di prova indicato nel file. Crea dati temporanei nel ramo e li rimuove al termine. Verifica anche creazione delle modalità tramite API, salvataggio e lettura della modalità della partita, rating indipendenti, archiviazione e rifiuto di nuove selezioni archiviate o appartenenti a un altro gioco.

`src/play-edit.test.ts` verifica dati precompilati, conservazione dell’orario, gioco fisso, rimozione dei controlli fonte e cooperazione, modalità archiviate, vincitori e pareggi, ELO storico e struttura del dettaglio. Il test Neon verifica anche modifica dei partecipanti e della modalità, ricalcolo delle cache, rollback di una sostituzione fallita, eliminazione di tutte le modalità senza perdere partite o punteggi, creazione di giochi senza modalità, vincoli sulle partite dal vivo e permessi dei commenti.

`src/play-history.test.ts` verifica filtri combinati, ordine delle partite, data senza ora, schede dello storico, pareggi, conteggio commenti e limite di 20 partite per pagina. Il test Neon verifica anche il conteggio pubblico dei commenti per una pagina e il rifiuto di richieste superiori a 20 partite.

`src/golf.test.ts` verifica le tre lunghezze di Golf, le posizioni storiche, i pareggi, le vittorie manuali, i tre ELO storici e le colonne condizionali del dettaglio. `src/golf-api.test.ts` verifica creazione e modifica delle partite con un database simulato, mantenendo il punteggio decrescente per Bowling e rifiutando vincitori o modalità mancanti. `src/play-selection.test.ts` verifica i controlli condivisi, il selettore obbligatorio, i pareggi, i vincitori rimossi dai partecipanti e le modalità archiviate. Il test Neon verifica anche il salvataggio delle posizioni crescenti tramite API e i rating di modalità dopo il ricalcolo.

## Limiti attuali

Email e password si modificano dopo la verifica della password attuale. Non sono ancora presenti verifica dell’email e recupero password. Il modello della libreria è condiviso: i dati di gioco sono pubblici; i dati degli account sono accessibili al proprietario e al pannello admin.
