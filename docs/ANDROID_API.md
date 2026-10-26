# API Android PartyScore

Il client Android legge `GET /api/mobile` dopo il login esistente con cookie
`partyscore_session`. L'endpoint richiede una sessione valida anche se le pagine
web restano pubbliche. Non permette scritture e risponde con `Cache-Control:
private, no-store`.

| `resource` | Risposta |
| --- | --- |
| `dashboard` | Totale partite, ultimi 12 mesi, top 3 giochi, top 3 giocatori del mese, ultime 5 partite, catalogo giochi/modalità e anni disponibili |
| `matches` | Partite ordinate, risultati e vincitori già risolti, 20 elementi per pagina |
| `elo` | Classifica generale, per gioco oppure per modalità; ELO, livello e win rate già calcolati |
| `wrapped` | Riepilogo annuale generale o personale, con autorizzazione sul giocatore |
| `update` | Metadati dell'APK e URL GitHub temporaneo, senza token |
| `download` | APK in streaming; alias web `/api/download` |

Ogni risposta dati ha `version: 1` e `generatedAt` ISO 8601. Date e filtri
mensili usano `Europe/Rome`. `matches` accetta `search`, `game`, `mode`, `year`,
`month` (1–12), `page` (intero positivo). `elo` accetta `game` e `mode`;
assenza di `game` significa classifica generale. Modalità archiviate restano
consultabili. Vincitori, pareggi e Golf usano le funzioni esistenti della web app.
Gli ELO riutilizzano `simulateKingElo`; non dipendono dalla cache del database.

Ogni risultato di `dashboard.recent` e `matches.items` include inoltre
`elo: { mode, game, general }`. Ogni ambito contiene `{ rating, ratingChange }`
dopo quella partita, oppure `null` se non disponibile. `mode` è nullo per le
partite senza modalità. Il calcolo usa `getPlaysElo`, condiviso con il dettaglio
web, sull'intero storico prima dei filtri e della paginazione; nessun rating
attuale sostituisce quello storico. Le variazioni possono essere positive,
negative o zero. Il formato resta versione 1 e i client precedenti ignorano i
nuovi campi. Occorre distribuire il backend aggiornato per mostrarli su Android.

Il server restituisce 401 per sessione assente/scaduta, 400 per filtri non validi,
405 per metodi diversi da GET e 500 per errori di lettura. Il client non ricalcola
statistiche, classifiche o regole di gioco. L'aggregazione mensile del nuovo
endpoint è esplicita; la web app continua a usare il fuso del browser.

## Release GitHub pubbliche o private

Impostare nell'ambiente del backend:

```text
ANDROID_RELEASE_REPOSITORY=GoryNickel9/PartyScore-Android
ANDROID_RELEASE_GITHUB_TOKEN=<fine-grained token con Contents: Read sul solo repository Android>
```

Il token è obbligatorio per una repo privata e facoltativo per una pubblica.
Conservarlo solo nelle variabili server, senza prefisso `VITE_`. Gli utenti
usano il proprio account PartyScore: non devono avere accesso alla repo GitHub.
Il cambio di visibilità della repo rimane un'operazione separata: prima
configurare il token sul backend e verificare download e aggiornamenti.

La release stabile più recente deve contenere `PartyScore.apk` e `update.json`
generati dal workflow Android. `update.json` contiene `versionCode`,
`versionName`, `sha256` e `size`. Gli asset vengono letti dalle API GitHub
tramite ID, con `Accept: application/octet-stream`. I redirect sono ammessi
solo verso HTTPS su `release-assets.githubusercontent.com` o
`objects.githubusercontent.com`, senza credenziali o porte personalizzate.
Il token viene inviato solo a `api.github.com` e non inoltrato ai redirect.
Manifest e APK sono limitati rispettivamente a 16 KiB e 150 MiB.

### Download dalla webapp

`GET /api/download` richiede una sessione valida, anche per un utente non admin.
Una rewrite lo indirizza a `/api/mobile?resource=download`, riutilizzando la
funzione autenticata esistente senza aggiungere una funzione Vercel.
Il menu account mostra «Scarica APK Android» solo dopo il login e fuori dalla
demo. Il browser usa il download nativo, senza caricare l'intero APK nella RAM
della pagina.

Il backend verifica la sessione prima di contattare GitHub e risponde con
`Cache-Control: private, no-store`. Legge gli asset pubblici o privati e invia
l'APK in streaming con `Content-Disposition: attachment`, nome `PartyScore.apk`
e MIME Android. Gestisce sia contenuto binario diretto (200) sia redirect
GitHub (302), con backpressure e interruzione della sorgente se il client si
disconnette. Verifica dimensione e SHA-256 durante il trasferimento: un file
corrotto interrompe la risposta, che il browser deve trattare come incompleta.
Non restituisce al browser URL GitHub temporanei né token.

L'endpoint restituisce 401 per sessione assente/scaduta, 405 per metodi diversi
da GET, 404 senza release stabile e 502 per errori GitHub o metadati non validi.
Un repository configurato con formato non valido restituisce 503. Un errore
nella verifica della sessione restituisce 500. Il trasferimento APK ha un
timeout di 120 secondi; le richieste dei metadati condividono 15 secondi.
`vercel.json` assegna alla funzione mobile una durata massima di 180 secondi.
Lo streaming usa le Vercel Functions Node.js: verificare il trasferimento sul
deployment prima di distribuire APK più grandi.

Finché la repo rimane pubblica, l'APK resta scaricabile anche direttamente da
GitHub senza login PartyScore. Il gate protegge il percorso della webapp;
per limitare anche l'accesso diretto occorre rendere privata la repo.

### Aggiornamenti dell'app Android

`GET /api/mobile?resource=update` mantiene il formato versione 1. Il backend
valida il manifest e restituisce l'URL temporaneo GitHub atteso dai client già
installati. L'app verifica dimensione, hash e firma prima dell'installazione.
Il token non viene mai incluso nella risposta o nell'APK.

L'URL temporaneo resta utilizzabile da chi lo possiede fino alla scadenza.
Questo comportamento del canale aggiornamenti rimane distinto dal proxy web.
Se GitHub restituisce direttamente i byte APK anziché il redirect richiesto
dal client esistente, il controllo aggiornamenti restituisce 502; il download
web gestisce entrambe le risposte. Senza release stabile il controllo risponde
204; una repo non accessibile al token restituisce 502. Ruotare il token prima
della sua scadenza.

## Verifica

```bash
npm test
npm run build
```

`mobile.test.ts` verifica aggregazioni, fuso orario, Golf, pareggi e parità con
il simulatore web. `mobile-api.test.ts` verifica sessione, filtri, sola lettura
e isolamento delle credenziali del canale aggiornamenti.
`android-download.test.ts` verifica il proxy con risposte HTTP reali locali:
sessione, utenti standard, repo pubblica/privata, redirect, isolamento del
token, manifest troppo grandi e trasferimenti corrotti o incompleti.
`mobile-node.test.ts` verifica che il grafo ELO compilato si carichi con Node ESM,
senza risoluzione degli import fornita da Vite o Vitest.

### Verifica locale del download — 24 ottobre 2026

Suite completa: 262 test superati e 2 opzionali saltati.

Il proxy ha trasferito l'APK reale della release `1.0.2` da GitHub:
1.910.552 byte, SHA-256
`2638895cff2133bf5ec609b638756a64e7a06f8835141b6b3aa992f2ce6631ff`,
coerente con `update.json`. Il controllo aggiornamenti ha restituito il
formato versione 1 atteso. Nel browser, con sessioni simulate locali, il
menu mostra il link per un utente standard loggato e lo nasconde da anonimo.

Gli accessi a repo private sono verificati tramite risposte GitHub simulate:
la repo Android è rimasta pubblica. Il trasferimento sul deployment Vercel e
l'accesso con un token reale a una repo privata restano da verificare.

### Passaggio alla repo privata e deploy — 24 ottobre 2026

La webapp è stata distribuita su `https://partyscore.baldeddu.cc` con deploy
Vercel `dpl_58e3FaCAQkxxannNnUG3zgFooxhF`, stato `Ready`.
`/api/download` e il controllo aggiornamenti restituiscono 401 senza sessione,
con `Cache-Control: private, no-store`. La repo `PartyScore-Android` è stata
resa privata e verificata tramite GitHub CLI.

Il backend locale ha letto le release private reali usando la sessione GitHub
CLI esistente, senza copiarne il token su Vercel. Controllo aggiornamenti,
URL temporaneo e proxy APK hanno restituito 200; dimensione e SHA-256 della
release `1.0.2` coincidono con i valori riportati sopra.

Su richiesta esplicita dell'utente, `ANDROID_RELEASE_GITHUB_TOKEN` è stata
configurata in Production usando la credenziale della CLI GitHub autenticata.
Vercel la conserva come variabile Sensitive; il valore è stato trasferito
tramite stdin, senza inserirlo nel codice, nei file del progetto o nei log.
La credenziale mantiene i permessi della CLI e non è un token limitato alla
sola repo Android. La sua revoca richiede di aggiornare anche il secret su
Vercel e ridistribuire la webapp.

L'autoupdater attuale controlla la versione all'apertura se l'ultimo controllo
risale a oltre 6 ore prima. WorkManager pianifica inoltre un controllo ogni
12 ore su rete non a consumo, con spazio disponibile; Android può differirlo.
Il menu account → Aggiornamenti permette un controllo manuale e il download
anche su rete a consumo. La nuova release deve avere un `versionCode`
maggiore e mantenere package e firma dell'app installata. L'app verifica
metadati, dimensione, SHA-256 e firma; Android richiede la conferma di
installazione. Non serve ricompilare l'APK per il solo cambio di visibilità.

### Verifica in produzione completata — 24 ottobre 2026

Deploy con token configurato: `dpl_DSVu2Em6SiLAisV6CskFB67RerYM`, alias
`https://partyscore.baldeddu.cc`. Build Vercel completata.

Una verifica temporanea protetta ha usato l'ambiente Vercel Production per
creare una sessione breve di un account esistente, senza scritture nel database
né restituzione del cookie. Sul dominio pubblico sono stati verificati:

- download anonimo: 401, `Cache-Control: private, no-store`;
- controllo aggiornamenti autenticato: 200, formato versione 1;
- download dall'URL temporaneo della release privata: 200;
- proxy web autenticato `/api/download`: 200, nome `PartyScore.apk`;
- release `1.0.2`, `versionCode` 3, 1.910.552 byte e SHA-256 coerente con il
  manifest per entrambi i download.

La verifica ha confermato anche che il token configurato su Vercel legge la
repo privata. Il deployment temporaneo di verifica è stato rimosso dopo i test; la sua
chiave di accesso locale è stata eliminata.
Quel primo controllo non includeva l'installazione Android. La prova completa
sull'emulatore è descritta nella sezione seguente.

### Autoupdater Android verificato — 24 ottobre 2026

Su un AVD Android 12 / API 31 isolato è stata preparata la baseline originale
firmata 1.0.1. Con la repo già privata, l’app ha scaricato automaticamente la
1.0.2 dal backend di produzione su Wi-Fi e ha aperto l’installer Android.
Dopo la conferma «Update», Android ha installato versionCode 3 senza
disinstallazione: `firstInstallTime` è invariato.

L’APK installato è identico alla release privata: 1.910.552 byte e SHA-256
`2638895cff2133bf5ec609b638756a64e7a06f8835141b6b3aa992f2ce6631ff`.
La sessione cifrata e un marker nei dati privati sono rimasti validi;
`/api/auth/me` ha restituito 200 dopo l’aggiornamento. La preparazione della
sessione ha usato una funzione Vercel temporanea protetta, poi rimossa, e una
instrumentation firmata con la chiave della release. Nessuna password è stata
usata e non sono stati modificati dati di gioco.

La prova copre download e installazione reali sull’emulatore, non un telefono
fisico o il login con password. Dettagli e artefatti sono documentati nella
repo Android, `docs/VALIDATION.md`, sezione «Autoupdater con repo privata».
# Wrapped Android

`GET /api/mobile?resource=wrapped&year=2026&player=<id>` restituisce un
riepilogo annuale versione 1. `player` vuoto indica le statistiche generali.
L’anno omesso usa quello corrente nel fuso `Europe/Rome`.

L’utente autenticato può richiedere soltanto il giocatore collegato tramite
`players.account_user_id`; un admin può richiedere qualsiasi giocatore esistente.
Un account senza collegamento dispone del solo riepilogo generale. Richieste
personali non consentite ricevono 403, anche quando il filtro è inviato a mano.
`players` contiene solo le opzioni autorizzate, `personalId` il collegamento
risolto dal server o null. Nessun collegamento viene dedotto da nome o email.

La risposta include `year`, `playerId`, `years`, `matches`, `minutes`, `games`,
`topGame`, `topMonth`, `wins`, `bestGame`, `longest`, `busiest` e `ratings`.
I record assenti sono null; `wins` e `bestGame` sono null nel riepilogo generale.
`ratings` contiene nome, id, ELO iniziale e finale dei partecipanti dell’anno
o del solo giocatore selezionato. La simulazione usa l’intero storico, poi
estrae i valori annuali. Le date di aggregazione usano `Europe/Rome`.
Le vittorie cooperative seguono `teamWon`; le altre usano `rankedMatchResults`.
Non sono inclusi i grafici di andamento ELO e attività mensile.

## Modalità preferite — Android 1.0.8

La risorsa `dashboard` aggiunge `favoriteModes`, le prime tre coppie
`gameId`/`modeId` per numero di partite nell’intero storico. Ogni elemento
contiene `game` (metadati del gioco, inclusi nome e piattaforma), `modeId`
(stringa o null), `modeName` e `count`. I pari merito si ordinano per nome
del gioco, nome modalità e identificatori. Non si sommano modalità omonime
di giochi diversi; `modeId` assente o null indica «Senza modalità» per quel gioco.
Le modalità archiviate includono «(archiviata)» nel nome; un riferimento
non risolto mostra «Modalità non disponibile». Un database vuoto restituisce `[]`.
Il campo `favorites` precedente resta disponibile; contratto versione 1 e
client precedenti compatibili. Nessuna migrazione del database.
