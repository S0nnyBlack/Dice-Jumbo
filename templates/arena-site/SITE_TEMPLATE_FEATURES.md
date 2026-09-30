# Site Template Features — Arena Games

Pripremljeno 30. septembra 2026. Referenca je Jamb main commit **c268c1bdacb36e55287514450419a8abd54a0f1d**. Uživo je pregledana početna stranica na https://dice-jumbo-2.onrender.com/; kod i tačne vrednosti provereni su preko GitHub-a. Identitet aktivnog Render deploy-a nije potvrđen. Ovaj dokument je uputstvo za ponovnu upotrebu UI komponenti.

## Instrukcija za sledeći projekat

Koristi postojeći Arena izgled: tamne tople površine, zelene akcije, krem kockice, diskretne ivice i sistemski font. Počni od ovog foldera i zajedničkih modula. Prilagodi naziv, opise, linkove i pravila nove igre. Održi SR/EN verzije, interaktivnu brend kockicu, dugme jezika, jasno dostupna pravila i pristupačnu navigaciju. Izdvoji specifično stanje igre iz zajedničkog UI-a. Provere radi na GitHub Actions-u; ovu template granu čuvaj odvojeno od produkcijskog main-a.

Sadržaj iz ref. Jamba služi kao dokaz postojećeg ponašanja. Izdvojeni moduli ispod predstavljaju prilagođen, ponovo upotrebljiv kod; nisu neizmenjena kopija celog app.js.

## Popis karakteristika i primena

| Stavka | Kako radi u Jambu | Pravilo za buduće sajtove |
|---|---|---|
| Brend kockica | Početno lice 5; klik bira drugo lice 1–6 | Isti raspored tačkica i lokalna dekorativna interakcija |
| Zvezdica | Svaki deseti klik prikaže ★ | Zadržati mali detalj; sledeći klik vraća kockicu |
| Odvojeno dugme za početnu | Tekst brenda vodi na početni ekran | Klik na kockicu ne sme da napusti igru ili otvori sobu |
| Jezik | 🌐 i naziv ciljnog jezika English/Srpski | Dugme prikazuje jezik na koji prelazi; preveden aria-label |
| Početni jezik | Prvi podržani sr/en iz preferencija pregledača; fallback sr | Ručni sačuvani izbor ima prednost; ne menjati jezik po lokaciji/IP-u |
| Pamćenje jezika | localStorage, nezavisno od partije | Za nove projekte arena.ui.language.v1; ne brisati uz wipe igre |
| Dinamični prevodi | Prevod teksta, novih DOM čvorova, aria-label, title i placeholder | Nova UI poruka mora imati SR i EN; ne prevoditi ID-jeve, kodove soba i ime igrača |
| Naslov dokumenta | Srpski i engleski document.title i html lang | U template-u prevoditi i opis stranice |
| Paleta | #262522 / #211f1c / #302e2b, zeleno #81b64c | Koristiti centralne tokene, bez nove konkurentske palete |
| Navigacija | Aktivna stavka aria-current; ikona + tekst | Dostupno tastaturi; ikonice imaju čitljiv naziv i u skraćenom meniju |
| Prilagođen meni | 224 px na širokom; 72 px do 1579 px; gornji meni do 640 px | Uvažiti ove Jamb dimenzije pri adaptaciji; hub zadržava svoj odobreni raspored |
| Kartice / CTA | Tamna kartica 14 px; glavna akcija zelena | Jedna glavna akcija po kartici, sporedna diskretna |
| Pravila | Otvaraju se u dialog-u; teme podržavaju strelice, Home/End | Pravila dostupna pre igre i u toku; Esc i vidljivo zatvaranje |
| Vizuelna pomoć | Jasna pravila, saveti, tekst uz dostupne akcije | Ne oslanjati se samo na boju ili skrivenu logiku |
| Focus i kretanje | Zlatni focus outline; reduced-motion pravila | Vidljiv fokus i male opcione animacije bez stalnih petlji |
| Igračke kockice | Kvadrati sa tačkicama; izabrane zelene; aria-pressed | Preuzeti izgled samo za igre kojima je potreban |
| Telefon | Horizontalno pomeranje listića; manje ćelije; kvadratne kockice | Nikada ne pretvarati kockice u pravougaonike radi uklapanja |
| Veličina listića | compact/normal/large, sačuvano lokalno | Opciona osobina specifična za gust prikaz podataka |
| Soba / pozivnica | Jedno dugme kopira pun URL; unos koda ili linka | Link sadrži room kod, nikada privatni token |
| Veza / istorija | Status veze, ponovno povezivanje i potezi | Primena samo u online igri; početni hub ne otvara game konekcije |
| Završni rezultat | Konačni zbir zaključan do kraja partije | Pravilo Jamba; ne nametati drugim igrama bez dogovora |

Kockica u logotipu nije izvor rezultata igre. Math.random u njenom modulu koristi se isključivo za dekoraciju. Serverska pravila, bezbednost soba, bodovanje, zabrana online undo-a i Jamb kolone ostaju u konkretnom projektu.

## Struktura template-a

~~~text
templates/arena-site/
  index.html                 kanonski ulaz sa SR/EN izborom
  en.html                    engleski ulaz, isti CSS i JS
  shared/
    arena.css                zajednički izgled
    brand-die.js             kockica i zvezdica
    language.js              izbor jezika i DOM binding prevoda
    messages.js              jedinstveni SR/EN rečnik
    arena-ui.js               povezivanje prototipa
  SITE_TEMPLATE_FEATURES.md  ovaj vodič
  UPUTSTVO_RENDER.md          hosting uz ograničene resurse
  render.yaml                konfiguracija za ovu granu
  package.json               samo ESM oznaka, bez zavisnosti
  tests/template.test.js     GitHub provere
~~~

Nema dva seta CSS-a/JS-a za SR i EN. Oba ulaza koriste shared/. Pri izmeni teksta ažurirati rečnik i početni HTML oba ulaza. Jezik je lokalni izbor za svaki origin: različiti onrender.com sajtovi ne dele localStorage. Za zajedničko prenošenje jezika koristiti javni lang parametar tek kada ga odredišna igra podržava.

## 1. CSS — paleta i osnova

Preuzeto iz [arena.css](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/arena.css#L2-L23), uz neutralne nazive komponenti za novi sajt.

~~~css
:root {
  color-scheme: dark;
  --canvas: #262522;
  --nav-dark: #211f1c;
  --paper: #302e2b;
  --line: #48443f;
  --ink: #f2f0ec;
  --muted-ink: #aaa69e;
  --green: #81b64c;
  --green-dark: #5d8d30;
  --green-soft: #dceac9;
  --gold: #f2c869;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
button, input { font: inherit; }
button, a { touch-action: manipulation; }
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 3px solid var(--gold);
  outline-offset: 3px;
}
.panel {
  border: 1px solid #ffffff0b;
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 20px 60px #0003;
}
~~~

Font stack je lokalni fallback; nema obaveznog preuzimanja Inter fonta. Ne kopirati sve stare CSS slojeve Jamba naslepo: styles.css sadrži ranije stilove, a arena.css ima kasnije override-e. Izdvojiti aktivne komponente i jedan skup tokena.

## 2. HTML / CSS — brend kockica

Referenca: [brend logika](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/app.js#L28-L55) i [brend izgled](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/arena.css#L37-L46).

~~~html
<div class="site-brand">
  <button type="button" class="brand-mark" id="brandDie"
    aria-label="Kockica pokazuje 5. Klikni za novo bacanje."
    title="Baci kockicu"></button>
  <a class="brand-home" href="./index.html">Arena Games</a>
</div>
~~~

~~~css
.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 4px;
  border: 1px solid #a9d876;
  border-radius: 9px;
  background: linear-gradient(145deg,#9bcc5d,#70a33d);
  box-shadow: 0 3px 0 #456b2b, inset 0 1px #ffffff77;
}
.brand-face {
  display: grid;
  grid-template: repeat(3,6px) / repeat(3,6px);
  place-content: center;
  gap: 2px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #f8f7ef;
  box-shadow: 0 2px 0 #bdc9b0;
}
.brand-pip { width: 6px; height: 6px; border-radius: 50%; background: #41642d; }
.brand-star { color: #fff5b6; font-size: 26px; line-height: 1; text-shadow: 0 0 8px #fff4a6; }
@media (prefers-reduced-motion: no-preference) {
  .brand-mark { transition: transform 150ms ease; }
  .brand-mark:hover { transform: translateY(-2px); }
  .brand-mark:active { transform: translateY(1px); }
}
@media (max-width: 640px) {
  .brand-mark { width: 44px; height: 44px; }
}
~~~

## 3. JavaScript — izolovana dekorativna kockica

Kompletan kod zajedničkog modula shared/brand-die.js:

~~~js
export const PIP_POSITIONS = {1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
export function bindBrandDie(button, { getLanguage = () => "sr", random = Math.random } = {}) {
  let value = 5, clicks = 0;
  function render() {
    const star = clicks > 0 && clicks % 10 === 0;
    const en = getLanguage() === "en";
    button.innerHTML = star ? '<span class="brand-star" aria-hidden="true">★</span>' :
      '<span class="brand-face" aria-hidden="true">' + PIP_POSITIONS[value].map(pos =>
        '<i class="brand-pip" style="grid-area:' + Math.ceil(pos / 3) + '/' + ((pos - 1) % 3 + 1) + '"></i>'
      ).join("") + "</span>";
    button.setAttribute("title", en ? "Roll the die" : "Baci kockicu");
    button.setAttribute("aria-label", star ?
      (en ? "A star! Click to roll again." : "Zvezdica! Klikni za novo bacanje.") :
      (en ? "Die shows " + value + ". Click to roll again." : "Kockica pokazuje " + value + ". Klikni za novo bacanje."));
  }
  function click() {
    clicks++;
    if (clicks % 10 !== 0) {
      const others = [1,2,3,4,5,6].filter(candidate => candidate !== value);
      value = others[Math.floor(random() * others.length)];
    }
    render();
  }
  button.addEventListener("click", click);
  render();
  return { render, dispose() { button.removeEventListener("click", click); }, readState() { return { value, clicks }; } };
}
~~~

getLanguage se poziva pri renderu, tako da promena jezika ažurira pristupačan naziv bez resetovanja lica ili broja klikova. dispose pozvati ako aplikacija trajno uklanja ovu komponentu. Ne vezivati isti element više puta.

## 4. JavaScript — izbor jezika i prevodi

Jamb referenca: [detekcija](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/i18n.js#L1-L10), [promena jezika](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/app.js#L12-L26), [dinamični translator](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/i18n.js#L393-L439). Postojeći Jamb ima rečnik zamena i MutationObserver. Za nove stranice template koristi eksplicitne ključeve, što olakšava potpunost SR/EN rečnika.

Kompletan kod shared/language.js:

~~~js
export const LANGUAGE_KEY = "arena.ui.language.v1";
export function detectLanguage(preferred = []) {
  const locales = Array.isArray(preferred) ? preferred : [preferred];
  for (const locale of locales) {
    const code = String(locale || "").toLowerCase().split(/[-_]/, 1)[0];
    if (code === "sr" || code === "en") return code;
  }
  return "sr";
}
export function resolveLanguage({ preferred = [], saved, requested } = {}) {
  if (requested === "sr" || requested === "en") return requested;
  if (saved === "sr" || saved === "en") return saved;
  return detectLanguage(preferred);
}
export function applyTranslations(root, messages) {
  const bindings = [
    ["data-i18n", null],
    ["data-i18n-aria", "aria-label"],
    ["data-i18n-title", "title"],
    ["data-i18n-placeholder", "placeholder"]
  ];
  for (const [keyAttribute, targetAttribute] of bindings) {
    for (const element of root.querySelectorAll("[" + keyAttribute + "]")) {
      const key = element.getAttribute(keyAttribute);
      if (!Object.hasOwn(messages, key)) throw new Error("Missing translation: " + key);
      if (targetAttribute) element.setAttribute(targetAttribute, messages[key]);
      else element.textContent = messages[key];
    }
  }
}
~~~

~~~html
<button type="button" id="language" aria-label="Promeni jezik na engleski">
  <span aria-hidden="true">🌐</span><span id="languageTarget">English</span>
</button>
<h1 data-i18n="homeTitle">Izaberi igru</h1>
<input data-i18n-placeholder="playerName" placeholder="Ime igrača">
~~~

~~~js
import { resolveLanguage, LANGUAGE_KEY, applyTranslations } from "./shared/language.js";
import { bindBrandDie } from "./shared/brand-die.js";

const messages = {
  sr: { homeTitle: "Izaberi igru", playerName: "Ime igrača" },
  en: { homeTitle: "Choose a game", playerName: "Player name" }
};
let saved;
try { saved = localStorage.getItem(LANGUAGE_KEY); } catch {}
let language = resolveLanguage({ preferred: navigator.languages, saved });
const die = bindBrandDie(document.getElementById("brandDie"), { getLanguage: () => language });

function render() {
  document.documentElement.lang = language;
  applyTranslations(document, messages[language]);
  const toggle = document.getElementById("language");
  document.getElementById("languageTarget").textContent = language === "sr" ? "English" : "Srpski";
  toggle.setAttribute("aria-label", language === "sr" ? "Promeni jezik na engleski" : "Switch language to Serbian");
  die.render();
}
document.getElementById("language").addEventListener("click", () => {
  language = language === "sr" ? "en" : "sr";
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch {}
  render();
});
render();
~~~

Primer pokazuje samo UI binding. U punoj stranici promeniti i title, meta opis, tekst u otvorenom dijalogu, poruke greške i sve novododate komponente. Posle njihovog renderovanja pozvati applyTranslations ili koristiti rečnik pre izrade markup-a. Ne prevoditi ceo input.value, sačuvani rezultat ili podatke igrača. Izbor jezika ne sme da ponovo kreira partiju.

U ovom prototipu en.html otvara engleski prikaz, a ?lang=en / ?lang=sr može izričito zadati jezik. Na običnom index.html prioritet je sačuvani izbor → prvi podržani jezik pregledača → srpski. Jambov postojeći storage ključ ne menjati bez migracije.

## 5. HTML — navigacija i pravila

~~~html
<nav class="main-nav" aria-label="Glavna navigacija">
  <a href="./index.html" aria-current="page">Sve igre</a>
  <a href="https://dice-jumbo-2.onrender.com/">Jamb</a>
  <a href="https://ne-ljuti-se-covece-2.onrender.com/">Ne ljuti se</a>
  <button type="button" id="openRules">Pravila igre</button>
</nav>
<dialog id="rulesDialog" aria-labelledby="rulesTitle">
  <h2 id="rulesTitle">Kako se igra?</h2>
  <p data-i18n="rulesSummary">Opis pravila ove igre.</p>
  <form method="dialog"><button>Zatvori</button></form>
</dialog>
~~~

~~~js
const rules = document.getElementById("rulesDialog");
document.getElementById("openRules").addEventListener("click", () => rules.showModal());
~~~

Za više tema preuzeti Jambov tablist obrazac sa aria-selected, aria-controls, roving tabindex i strelicama iz [bindRulesGuide](https://github.com/S0nnyBlack/Dice-Jumbo/blob/c268c1bdacb36e55287514450419a8abd54a0f1d/app.js#L286-L303). Za jednostavan opis dovoljan je native dialog. Ne skrivati pravila samo iza hover-a.

Pri navigaciji iz aktivne igre integrisati postojeću potvrdu napuštanja. Ne kopirati Jambov room:leave handler kao zajedničku komponentu: svaka igra ima svoju politiku izlaska i sesija.

## 6. Reuse granice i resursi

- Zajedničko: boje, ivice, tipografija, fokus, kockica logotipa, jezik, nav i obrasci kartica/dijaloga.
- Specifično: broj i značenje kolona, dopušteni upisi, izbor 5 kockica za MIN/MAX, skrivanje protivničkih zbirnih rezultata, bacanje, score i tok poteza.
- Na hubu ne koristiti Socket.IO, SSE, bazu, polling, prefetch ili health ping obe igre. Klik otvara samo izabrani sajt.
- Kod se deli lokalnim fajlovima iz template-a; ne dodavati runtime zavisnost od ovog GitHub branch URL-a.
- Privatni sesijski tokeni ne ulaze u URL, MD, screenshot ili kopirani link.
- Wipe partije čisti samo podatke konkretne igre. Jezik i pristupačne korisničke postavke čuvaju se odvojeno.
- Ne dodavati novi framework ili CDN font za ove komponente. Inline SVG i mali JS dovoljni su za početni hub.

## GitHub provere i status

Workflow Arena site template proverava jezički prioritet i potpunost rečnika, ponašanje i prevode kockice, desetokliknu zvezdicu, opise, linkove, HTTP dostupnost modula i sintaksu JS-a. Radi u GitHub Actions-u, bez lokalnog testiranja. Stvarni izgled na telefonu i Render deploy ostaju posebna provera; Node testovi nisu dokaz vizuelne ispravnosti.

Grana template/arena-site-features je paket za buduće projekte. Nije migracija produkcijskog Jamba i ne treba je spajati u main samo radi čuvanja template-a.
