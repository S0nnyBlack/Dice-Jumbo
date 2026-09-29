# Pregled postojećih soba — 29. septembar 2026.

Opseg: čitanje serverskog koda i postojećih testova za `Dice-Jumbo` i `Ne-ljuti-se-covece-2`. Ovo je pregled implementacije, bez napada na javne instance. Prikazani rizici su mogućnosti koje proizlaze iz koda; nije utvrđeno da ih je neko iskoristio.

## Dice-Jumbo

| Prioritet | Nalaz | Posledica | Šta radi šablon |
| --- | --- | --- | --- |
| Visok | `sessionToken()` spaja približno 30 bita nasumičnosti sa vremenom, a `room:resume` nema ograničenje pokušaja. | Ako je vreme sesije poznato, napadač ima znatno manji prostor za pogađanje tokena nego kod 256-bitnog tokena; uspeh preuzima igračevu sesiju. | 256-bitni kriptografski token, samo hash u memoriji, ograničenje pokušaja povratka. |
| Visok | Nema gornje granice broja soba, pokušaja kreiranja/pridruživanja ni broja konekcija po klijentu. | Masovno otvaranje soba ili zahteva može potrošiti memoriju i konekcije. | Ograničenje soba, zahteva, konekcija i trajanja soba. |
| Srednji | Kod sobe nastaje preko `Math.random()` i ima samo pet znakova; pridruživanje nije ograničeno po izvoru. | Kod je lakše pogoditi ili sistematski isprobavati; kod ovde služi kao pozivnica. | Deset znakova iz kriptografskog generatora i ograničenje pokušaja. |
| Srednji | Svaki učesnik aktivne partije može pozvati `room:leave`, a server zatvara sobu svima. | Jedan igrač može namerno prekinuti tuđu partiju. | Napuštanje lobija je odvojeno; aktivna partija zahteva eksplicitno pravilo predaje/isteka. |
| Srednji | Komande nemaju ID zahteva ni očekivanu reviziju stanja. | Zakasnela komanda može biti obrađena u kasnijem potezu ako je tada opet legalna. | Jedinstven ID zahteva, povratak istog odgovora za duplikat i odbijanje zastarele revizije. |
| Nizak | Socket.IO i HTTP CORS su otvoreni za sve izvore. | Drugi sajtovi mogu pokušati da koriste javne događaje i troše resurse; ovo samo po sebi ne zaobilazi proveru igrača. | Izričit spisak dozvoljenih izvora i granica veličine poruke. |

Pozitivno: server određuje potez i rezultat; bira kockice na serveru; već popunjena polja odbija; tuđi međuzbirovi se skrivaju do kraja partije. Ti mehanizmi treba da ostanu u igri nakon eventualne migracije.

Relevantni kod: [`server/server.js`](../../server/server.js), [`tests/server.integration.test.js`](../../tests/server.integration.test.js).

## Ne-ljuti-se-covece-2

| Prioritet | Nalaz | Posledica | Šta radi šablon |
| --- | --- | --- | --- |
| Visok | Kreiranje partije nema granicu, a JSON fajlovi se zadržavaju bez roka uklanjanja. | Dovoljno zahteva može popuniti disk i memoriju. | Broj soba i rok trajanja su ograničeni; pri trajnom skladištenju dodati isti rok i čišćenje. |
| Srednji | `GET /api/games/:id` i `/events` ne traže igračev token. | Svako ko dođe do linka može pratiti stanje i otvoriti tok događaja; iako je ID nasumičan, prosleđen link daje pristup. Neograničen broj tokova troši konekcije. | Stanje se šalje samo povezanim igračima, posebno filtrirano za svakog; ograničen broj konekcija. |
| Srednji | Mutacija igre se radi pre `save(record)`. Ako upis na disk ne uspe, server vrati grešku, ali stanje u memoriji ostane izmenjeno. | Klijent i server mogu imati različito viđenje uspeha komande; posle restarta stanje se vraća na staru vrednost. | Mutacija se prvo proverava na kopiji; trajno skladište, ako se doda, mora potvrditi upis pre objave novog stanja. |
| Nizak | Nema ID zahteva/zaštite od ponovljenih zahteva ni revizije koju klijent mora navesti. | Ponavljanje ili zakasneli zahtev može napraviti neočekivan potez kada opet postane dozvoljen. | Idempotentne komande i revizije. |

Pozitivno: ID sobe ima 128 bita, pristupni token 256 bita, telo JSON zahteva je ograničeno, a pravila poteza se proveravaju na serveru. Ove dobre odluke treba zadržati.

Relevantni kod: [`server.js`](https://github.com/S0nnyBlack/Ne-ljuti-se-covece-2/blob/main/server.js), [`game.js`](https://github.com/S0nnyBlack/Ne-ljuti-se-covece-2/blob/main/game.js).

## Granica pregleda

Šablon u ovoj grani **nije automatski uključen u postojeće igre**. Njegovo povezivanje sa Jambom ili Čoveče zahteva zaseban rad na kompatibilnosti protokola, politici napuštanja aktivne partije i migraciji klijentskog toka. Ako kasnije bude potreban rad na više serverskih instanci, in-memory stanje treba zameniti transakcionim zajedničkim skladištem i sistemom za slanje događaja između instanci.

