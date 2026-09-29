import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, normalizeLanguage, translateText } from "../i18n.js";

test("language defaults to Serbian and preserves Serbian copy", () => {
  assert.equal(normalizeLanguage(null), "sr");
  assert.equal(normalizeLanguage("en"), "en");
  assert.equal(translateText("Vreme je za jamb.", "sr"), "Vreme je za jamb.");
});

test("browser language chooses English or Serbian on first visit", () => {
  assert.equal(detectLanguage(["en-US", "sr-RS"]), "en");
  assert.equal(detectLanguage(["sr-Latn-RS", "en-US"]), "sr");
  assert.equal(detectLanguage(["fr-FR", "en-GB"]), "en");
  assert.equal(detectLanguage(["de-DE"]), "sr");
});

test("English covers navigation, rules, score sheet and dynamic turns", () => {
  assert.equal(translateText("Vreme je za jamb.", "en"), "Time for Yamb.");
  assert.equal(translateText("Kolone listića", "en"), "Score sheet columns");
  assert.equal(translateText("KENTA", "en"), "STRAIGHT");
  assert.equal(translateText("2 od 3", "en"), "2 of 3");
  assert.equal(translateText("Dostupno polje: Dole, Jedinice, 5 poena", "en"), "Available cell: Down, Ones, 5 points");
  assert.equal(translateText("Nije vaš potez.", "en"), "It is not your turn.");
});

