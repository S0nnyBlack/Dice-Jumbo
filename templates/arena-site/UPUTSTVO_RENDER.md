# Arena hub — Render Free uputstvo
Pripremljeno 30. septembra 2026. Template se čuva na GitHub grani **template/arena-site-features** u Dice-Jumbo. Nije objavljen kao Render sajt.

## Plan uz ograničene resurse
Početna stranica je **Static Site**: mali HTML, lokalni CSS/JS i SVG ilustracije. Jamb i Ne ljuti se zadržavaju postojeće servere. Hub koristi obične linkove i ne otvara njihove konekcije pre klika. Engleski ulaz je en.html, a oba ulaza dele iste fajlove iz shared/.

~~~text
Arena hub (CDN)
  ├── klik → dice-jumbo-2.onrender.com
  └── klik → ne-ljuti-se-covece-2.onrender.com
~~~

Workspace deli **750 besplatnih sati mesečno** između aktivnih Free web servisa. Servis se uspavljuje posle 15 minuta bez dolaznog saobraćaja; buđenje traje oko minut. Promene lokalnih fajlova nestaju pri redeploy-u, restartu ili uspavljivanju. Free Postgres ističe za 30 dana. Static Site koristi CDN i kvote bandwidth-a i build minuta; ne dodaje vreme aktivnog web servera. [Render Free](https://render.com/docs/free), [Static Sites](https://render.com/docs/static-sites).

Račun za 30 dana: dva servera koja rade stalno troše oko 1440 sati; po četiri sata dnevno svaki troše oko 240 sati. Primeri uključuju samo pretpostavljeno aktivno vreme; stvarna potrošnja zavisi i od čekanja uspavljivanja, poseta i otvorenih veza. Stanje naloga proveriti u Render Dashboard → Billing → Monthly Included Usage.

Ne dodavati treći Node server za hub, automatske health pingove, stalne statistike ili prefetch obe igre. JSON zapis soba u Čoveče može preživeti običan restart procesa u nekim okruženjima, ali nije garancija trajnog čuvanja na Render Free. Igrač treba da dobije jasnu poruku kada soba više ne postoji.

## Najjednostavniji deploy iz ove grane
U Renderu izabrati **New → Static Site** i povezati Dice-Jumbo:

| Podešavanje | Vrednost |
|---|---|
| Branch | template/arena-site-features |
| Root Directory | templates/arena-site |
| Build Command | echo 'Static files ready' |
| Publish Directory | . |
| Environment | SKIP_INSTALL_DEPS=true |
| Auto-Deploy | Off za prvi pregled |
| Name | arena-games-hub ili dostupno drugo ime |

Po objavi ukloniti oznaku PROTOTIP iz HTML-a i obe stavke prevoda. Render će dodeliti onrender.com adresu; naziv/adresa nisu rezervisani. Za početak nije potreban kupljen domen.

Priloženi render.yaml opisuje baš ovu granu i rootDir. Ako koristiš Blueprint, navesti njegov put templates/arena-site/render.yaml u toku kreiranja. Ne kreirati istovremeno ručni Static Site i Blueprint za isti hub.

## Korišćenje u zasebnom repozitorijumu
Kopirati sadržaj templates/arena-site u koren novog repo-a. U render.yaml ukloniti rootDir, promeniti branch u main i izabrati odgovarajuće ime. GitHub workflow prilagoditi novoj putanji: shared/*.js i tests/template.test.js. Dokumentacija i testovi su javni primeri; ne stavljati tajne u publish direktorijum.

Ne zahteva se npm install ili framework build. package.json samo označava ESM module. Za redovan deploy posle dodavanja CI koristiti After CI Checks Pass / autoDeployTrigger: checksPass. Za najmanji broj buildova zadržati ručno objavljivanje posle uspešnih provera. [Blueprint konfiguracija](https://render.com/docs/blueprint-spec).

## Povezivanje igara
Posle odobrenja i objave huba, kroz odvojene PR-ove u menije igara dodati Sve igre / All games sa stvarnom hub adresom. Linkovi soba i dalje vode direktno u svoju igru:

~~~text
https://dice-jumbo-2.onrender.com/?room=ABCDE
https://ne-ljuti-se-covece-2.onrender.com/?room=ABCDE
~~~

Ne dodavati CORS konfiguraciju, proxy, iframe ili zajedničku bazu samo radi ovih linkova. Izbor jezika se čuva po origin-u; ako kasnije bude potrebno prenošenje jezika između igara, obe aplikacije moraju podržati isti javni lang parametar.

## Provere pre objavljivanja
GitHub Actions proverava komponentne testove i HTTP dostupnost svih uvezenih modula. Lokalni testovi nisu deo ovog postupka.

Posle deploy-a proveriti telefon/računar, SR i EN, klikove kockice, desetokliknu zvezdicu, opise, fokus tastature i odredišta linkova. U Network panelu hub ne sme kontaktirati servere igara dok nije kliknuta igra. Testirati i prvi ulazak posle uspavljivanja i po jednu pozivnicu. Deploy igara zakazati između partija.

Dashboard kvote, stvarni Render deploy i vizuelni mobilni prikaz nisu potvrđeni ovim paketom. Početni cilj je lagan ulaz i zajednički izgled; naloge, globalni chat i statistiku uvoditi tek uz plan za resurse.
