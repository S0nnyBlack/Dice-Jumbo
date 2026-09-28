# Jumbo Dice

Jumbo Dice je veb aplikacija za Jamb sa lokalnom solo partijom i online partijama za 2–4 igrača. Interfejs je na srpskom, prilagođen je telefonu, tabletu i desktopu, a rezultat se unosi direktno u tabelu.

## Mogućnosti

- Šest kockica; za bodovanje se bira od jedne do pet kockica.
- Do tri bacanja po potezu; do pet bacanja kada je ostalo samo jedno polje za bodovanje.
- Izabrane kockice zadržavaju se pri sledećem bacanju.
- Upis sa manje od pet izabranih kockica je dozvoljen uz potvrdu; kombinacije i dalje zahtevaju pet kockica.
- Dostupna polja su istaknuta u tabeli. Polje se može precrtati.
- Igrač vidi pravila i ograničenja kolona tokom partije.
- Solo partija se automatski čuva u pregledaču i nastavlja posle osvežavanja; može se vratiti poslednji upis ili precrtavanje.
- U online partiji domaćin može da vrati poslednji potez za celu sobu.
- Status poteza, bacanja i obaveznih najava prikazuje se iznad table; aktivna pravila otvaraju se bez napuštanja igre.
- Veličina tabele može se menjati tokom igre i pamti se u pregledaču.
- Pre izlaska iz aktivne partije prikazuje se potvrda; pri prekidu veze online unos se zaključava do sinhronizacije i dostupan je ručni pokušaj povezivanja.
- Konačan zbir se prikazuje tek po završetku partije.
- Mobilni prikaz stavlja tabelu ispred kockica i kontrola, uz veće dodirne površine, podršku za bezbedne margine ekrana i landscape orijentaciju. Široka tabela može da se pomera horizontalno kako bi polja ostala čitljiva.

## Režimi igre

### Solo

Partija se igra lokalno u pregledaču, bez protivnika kojim upravlja računar. Pre početka su uključene tri osnovne kolone: **Dole**, **Slobodna** i **Gore**. Ostale kolone mogu se uključiti pojedinačno ili dugmetom **Izaberi sve**.

### Online

- Kreiranje sobe i pridruživanje putem koda sobe.
- Igra za 2–4 igrača; domaćin pokreće partiju i bira aktivne kolone.
- Server upravlja bacanjima, redosledom poteza, unosom rezultata i proverom pravila.
- Tabele drugih igrača mogu se pregledati; ukupni rezultat ostaje sakriven do završetka partije.
- Aplikacija podržava povratak igrača u postojeću sesiju nakon prekida veze.

## Kolone

Tri osnovne kolone su uvek uključene:

- **Dole** — popunjava se od reda 1 naniže.
- **Slobodna** — bira se bilo koje dostupno polje.
- **Gore** — popunjava se od Jamba naviše.

Dodatne kolone su opcione:

- **Najava** — bira se posle prvog bacanja i obavezuje igrača na najavljeni red.
- **Kontra najava** — prati polje koje je protivnik najavio u prethodnom potezu. Ako nema najave, slobodan unos je moguć kada je kolona Najava popunjena.
- **R** — od MAX-a naniže i od MIN-a naviše.
- **N** — od jedinice naniže i od Jamba naviše.
- **D** — ručna kolona; igra se nakon prvog bacanja. Ručna Kenta vredi 66.
- **O** — otključava se kada su popunjene sve prethodne uključene kolone.
- **M** — automatski upisuje najveći rezultat iz prethodnih uključenih kolona. Precrtavanja u odgovarajućim poljima prvih šest kolona prenose se u M.

Kolone se prikazuju u standardnom redosledu bez obzira na redosled kojim su uključene u podešavanjima.

## Bodovanje

- **1–6** — zbir izabranih kockica odgovarajuće vrednosti.
- **MAX / MIN** — zbir izabranih kockica.
- **Kenta** — niz 1–5 ili 2–6: 66 posle prvog bacanja, 56 posle drugog i 46 posle trećeg. U koloni D vredi 66.
- **Triling** — najmanje tri iste kockice: zbir svih izabranih kockica +20.
- **Ful** — tri iste i dve iste: zbir +30.
- **Poker** — četiri iste: vrednost te četiri kockice +40.
- **Jamb** — pet istih: zbir +50.
- **Bonus gornjeg dela** — 30 poena kada je zbir redova 1–6 najmanje 60.
- **Zbir kolone** — gornji deo sa bonusom, kombinacije, MAX i MIN.

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

Online sobe i njihove partije čuvaju se u memoriji servera. Ako se server ponovo pokrene, aktivne sobe se ne obnavljaju.
