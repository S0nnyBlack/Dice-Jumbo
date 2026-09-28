# Testovi i zaštita deploya

## Lokalno pokretanje

Instaliraj zavisnosti i pokreni ceo skup testova:

```sh
npm install
npm test
```

GitHub Actions pokreće isti skup na svakom push-u i pull request-u. Workflow nema path filtere, tako da se provera ne preskače kada se promeni konfiguracija ili deployment fajl.

## Pokrivenost

- **Pravila i bodovanje** — `tests/game.test.js`: gornji deo listića i bonus, Kenta po broju bacanja i ručna Kenta, Triling/Full/Poker/Yamb, nevažeće kombinacije, kratki izbori, precrtavanje, minimum/maksimum, kolone, najava/dirigovano, zbirovi i privatnost zbirova.
- **Tok poteza i server API** — `tests/server.integration.test.js`: stvarni Socket.IO server odbija potez pogrešnog igrača i dupli/stari upis, ne menja sačuvanu kockicu, prosleđuje potez nakon upisa, prihvata povratak preko session tokena i odbija već popunjeno polje.
- **UI pristupačnost i responsivnost** — `tests/ui.test.js`: tastaturna aktivacija polja, ARIA oznake i statusi, ograničenje bacanja, horizontalno pomeranje listića na uskom ekranu i touch scroll stil.
- **End-to-end** — integracioni test pokreće server, kreira sobu, priključuje dva igrača, odigrava i precrtava sva obavezna polja do kraja partije i proverava završne zbirove.

## Deploy gate

Render Blueprint koristi `autoDeployTrigger: checksPass`. Render zato čeka da GitHub Actions provere za commit na povezanoj grani uspeju. Ako test padne ili nijedna provera nije prijavljena, novi automatski deploy se ne pokreće. Workflow status se takođe vidi na GitHub pull request-u.
