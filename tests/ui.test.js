import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

test("UI exposes keyboard-operable score cells and status announcements", () => {
  assert.match(html, /<main id="app"/);
  assert.match(app, /role="status"/);
  assert.match(app, /role="button" tabindex="0"/);
  assert.match(app, /event\.key==="Enter"\|\|event\.key===" "/);
  assert.match(app, /aria-label="Dostupno polje:/);
  assert.match(app, /aria-label="Šest kockica/);
});

test("score sheet can scroll horizontally and the layout has narrow-screen rules", () => {
  assert.match(app, /class="sheet-wrap"/);
  assert.match(css, /\.sheet-wrap\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*\d+px\)/);
  assert.match(css, /\.sheet-wrap\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s);
});

test("UI disables roll controls after the configured roll limit", () => {
  assert.match(app, /roll\.disabled=state\.gameOver\|\|state\.rolls>=maxRollsForLocal\(\)/);
  assert.match(app, /roll\.disabled=!canAct\|\|state\.gameOver\|\|state\.rolls>=\(state\.maxRolls\|\|3\)/);
});
