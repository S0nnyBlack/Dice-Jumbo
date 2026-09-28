# jamb.arena

jamb.arena je veb aplikacija za Jamb sa lokalnom solo partijom i online partijama za 2–4 igrača. Interfejs je na srpskom, prilagođen je telefonu, tabletu i desktopu, a rezultat se unosi direktno u tabelu. Tamni izgled i raspored oslanjaju se na brif Jamb Arena; postojeća pravila, šest kockica i online režim ostaju dostupni.

## Mogućnosti

- Šest kockica; za bodovanje se bira od jedne do pet kockica.
- Do tri bacanja po potezu; do pet bacanja kada je ostalo samo jedno polje za bodovanje.
- Izabrane kockice zadržavaju se pri sledećem bacanju.
- Upis sa manje od pet izabranih kockica je dozvoljen uz potvrdu. Triling traži najmanje tri iste, Poker najmanje četiri iste; Kenta, Ful i Jamb zahtevaju pet kockica.
- Dostupna polja su istaknuta u tabeli. Polje se može precrtati.
- Igrač vidi pravila i ograničenja kolona tokom partije.
- Solo partija se automatski čuva u pregledaču i nastavlja posle osvežavanja; može se vratiti poslednji upis ili precrtavanje. Sa svakim novim Render buildom briše se prethodna solo partija i stari online token, dok se podešavanja tabele čuvaju.
- U online partiji domaćin može da vrati poslednji potez za celu sobu.
- Status poteza, bacanja i obaveznih najava prikazuje se iznad table; aktivna pravila otvaraju se bez napuštanja igre.
- Veličina tabele može se menjati tokom igre i pamti se u pregledaču.
- Pre izlaska iz aktivne partije prikazuje se potvrda; pri prekidu veze online unos se zaključava do sinhronizacije i dostupan je ručni pokušaj povezivanja.
- Konačan zbir se prikazuje tek po završetku partije.
- Kada je uključeno svih devet kolona, listić koristi raspoloživu širinu desktop ekrana, a Brzi izbor i Aktivnost stoje levo od njega na širokim ekranima. Na telefonu se tabela pomera unutar svog okvira.
- Mobilni prikaz stavlja kockice i kontrole iznad tabele, uz veće dodirne površine, podršku za bezbedne margine ekrana i landscape orijentaciju.

## Režimi igre

### Solo

Partija se igra lokalno u pregledaču, bez protivnika kojim upravlja računar. Pre početka su uključene tri osnovne kolone: **Dole**, **Slobodna** i **Gore**. Ostale kolone mogu se uključiti pojedinačno ili dugmetom **Izaberi sve**.

### Online

- Kreiranje sobe i pridruživanje putem koda sobe. Čekaonica prikazuje veliki kod sa dugmetom za kopiranje i četiri mesta sa statusom igrača.
- Igra za 2–4 igrača; domaćin pokreće partiju i bira aktivne kolone.
- Server upravlja bacanjima, redosledom poteza, unosom rezultata i proverom pravila.
- Tabele drugih igrača mogu se pregledati; ukupni rezultat ostaje sakriven do završetka partije.
- Aplikacija podržava povratak igrača u postojeću sesiju nakon prekida veze.
- Izlazak iz sobe pre početka uklanja igrača i oslobađa sesiju. Ako igrač napusti započetu partiju, soba se zatvara za sve učesnike. Potpuno napuštene sobe se brišu posle 30 minuta.

## Kolone

Tri osnovne kolone su uvek uključene:

- **Dole** — popunjava se od reda 1 naniže.
- **Slobodna** — bira se bilo koje dostupno polje.
- **Gore** — popunjava se od Jamba naviše.

Dodatne kolone su opcione:

- **Najava** — bira se posle prvog bacanja i obavezuje igrača na najavljeni red.
- **Dirigovano (D)** — prati polje koje je protivnik najavio u prethodnom potezu. Ako nema najave, slobodan unos je moguć kada je kolona Najava popunjena.
- **R** — ručna kolona; može se igrati samo posle prvog bacanja. Ručna Kenta vredi 66.
- **N (↓↑)** — popunjava se od jedinica naniže i od Jamba naviše.
- **O** — otključava se kada su popunjene sve prethodne uključene kolone.
- **M** — automatski upisuje najveći rezultat iz prethodnih uključenih kolona. Precrtavanja u odgovarajućim poljima prvih šest kolona prenose se u M.

Kolone se prikazuju u standardnom redosledu bez obzira na redosled kojim su uključene u podešavanjima.

## Bodovanje

- **1–6** — zbir izabranih kockica odgovarajuće vrednosti.
- **MAX / MIN** — zbir svih pet izabranih kockica; polja su dostupna samo kada je izabrano tačno pet.
- **Kenta** — niz 1–5 ili 2–6: 66 posle prvog bacanja, 56 posle drugog i 46 posle trećeg. U koloni R vredi 66.
- **Triling** — najmanje tri iste među izabranim kockicama: zbir tačno tri iste +20. Ostale izabrane kockice ne ulaze u rezultat. Može se upisati sa 3, 4 ili 5 kockica.
- **Ful** — tri iste i par u pet izabranih kockica: zbir +30.
- **Poker** — najmanje četiri iste među izabranim kockicama: vrednost četiri iste +40. Može se upisati sa 4 ili 5 kockica.
- **Jamb** — pet istih: zbir +50.
- **Bonus gornjeg dela** — 30 poena kada je zbir redova 1–6 najmanje 60.
- **Prva suma (Σ)** — zbir rezultata redova 1–6, uz bonus od 30 poena kada zbir dostigne 60.
- **Druga suma (Σ)** — (MAX − MIN) × broj jedinica upisanih u redu 1 te kolone.
- **Treća suma (Σ)** — zbir rezultata od Kente do Jamba.
- **UKUPNO** — zbir prve, druge i treće sume kroz sve aktivne kolone.

## Pokretanje lokalno

Potrebni su Node.js 20 ili noviji i npm.

```sh
npm install
npm start
```

Zatim otvori [http://localhost:3000](http://localhost:3000). Za razvojni režim sa automatskim restartom servera koristi `npm run dev`.

Pokreni testove pravilima igre:

```sh
npm test
```

## Tehnologije i provere

- JavaScript ES modules i CSS za klijentsku aplikaciju.
- Express i Socket.IO za online server.
- GitHub Actions proverava sintaksu klijenta i servera i pokreće testove pravilnika.
- `/health` endpoint vraća status servera.
- `render.yaml` sadrži podešavanja za Render.

Online sobe i njihove partije čuvaju se samo u memoriji servera. Pri gašenju server briše sve sobe i sesije, a novi Render build dobija jedinstven identifikator koji pregledač koristi da obriše sačuvane partije i nevažeće online tokene. Partije se ne obnavljaju posle deploya.

