import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindBrandDie } from "../shared/brand-die.js";
import { resolveLanguage, applyTranslations } from "../shared/language.js";
import { copy } from "../shared/messages.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const file = name => readFile(path.join(root, name), "utf8");
function button() {
  const handlers = new Map(), attributes = new Map();
  return {
    innerHTML: "",
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
    addEventListener(key, handler) { handlers.set(key, handler); },
    removeEventListener(key, handler) { if (handlers.get(key) === handler) handlers.delete(key); },
    click() { handlers.get("click")?.(); }
  };
}
test("language uses explicit entry, then saved preference, then first supported locale", () => {
  assert.equal(resolveLanguage({ preferred: ["en-US","sr-RS"] }), "en");
  assert.equal(resolveLanguage({ preferred: ["de-DE","sr-Latn-RS","en"] }), "sr");
  assert.equal(resolveLanguage({ preferred: ["sr-RS"], saved: "en" }), "en");
  assert.equal(resolveLanguage({ preferred: ["en-US"], saved: "sr", requested: "en" }), "en");
  assert.equal(resolveLanguage({ preferred: ["de-DE"], saved: "bad", requested: "bad" }), "sr");
  assert.equal(resolveLanguage({ preferred: "en_US" }), "en");
});
test("both static entries have complete Serbian and English dictionaries", async () => {
  assert.deepEqual(Object.keys(copy.sr).sort(), Object.keys(copy.en).sort());
  const pages = await Promise.all(["index.html","en.html"].map(file));
  for (const [index, html] of pages.entries()) {
    const dictionary = index === 0 ? copy.sr : copy.en;
    const matches = [...html.matchAll(/<([a-z0-9]+)\b[^>]*data-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g)];
    assert.ok(matches.length > 20);
    for (const [, , key, text] of matches) {
      assert.equal(text, dictionary[key], "initial translation for " + key);
      assert.ok(copy.sr[key] && copy.en[key]);
    }
    assert.match(html, /type="module" src="\.\/shared\/arena-ui\.js"/);
    assert.match(html, /href="\.\/shared\/arena\.css"/);
  }
  assert.match(pages[1], /<html lang="en">/);
  assert.match(pages[1], /<title>Arena Games — Choose a game<\/title>/);
});
test("the decorative die has correct pips, changes face and shows a star every tenth click", () => {
  const element = button();
  const component = bindBrandDie(element, { random: () => 0 });
  assert.equal((element.innerHTML.match(/class="brand-pip"/g) || []).length, 5);
  let last = 5;
  for (let i=1; i<10; i++) {
    element.click();
    const state = component.readState();
    assert.notEqual(state.value, last);
    assert.equal((element.innerHTML.match(/class="brand-pip"/g) || []).length, state.value);
    last = state.value;
  }
  element.click(); assert.match(element.innerHTML, /★/);
  element.click(); assert.doesNotMatch(element.innerHTML, /★/);
  for (let i=12; i<=20; i++) element.click();
  assert.match(element.innerHTML, /★/);
  const previous = component.readState();
  component.dispose(); element.click();
  assert.deepEqual(component.readState(), previous);
});
test("changing die language preserves face, click count and star state", () => {
  const element = button(); let language = "sr";
  const component = bindBrandDie(element, { getLanguage: () => language });
  element.click();
  const state = component.readState();
  language = "en"; component.render();
  assert.deepEqual(component.readState(), state);
  assert.match(element.getAttribute("aria-label"), /^Die shows/);
  assert.equal(element.getAttribute("title"), "Roll the die");
  for (let i=2; i<=10; i++) element.click();
  assert.match(element.getAttribute("aria-label"), /^A star/);
  language = "sr"; component.render();
  assert.match(element.getAttribute("aria-label"), /^Zvezdica/);
});
test("translation updates labels and placeholders without overwriting player input", () => {
  const elements = [
    { "data-i18n": "home" },
    { "data-i18n-placeholder": "name" },
    { "data-i18n-aria": "action" },
    { "data-i18n-title": "action" }
  ].map(attributes => ({
    value: "Ana",
    getAttribute(key) { return attributes[key]; },
    setAttribute(key, value) { attributes[key] = value; },
    attributes
  }));
  const root = { querySelectorAll(selector) {
    const key = selector.slice(1, -1);
    return elements.filter(element => Object.hasOwn(element.attributes, key));
  } };
  applyTranslations(root, { home: "Choose a game", name: "Player name", action: "Roll the die" });
  assert.equal(elements[0].textContent, "Choose a game");
  assert.equal(elements[1].attributes.placeholder, "Player name");
  assert.equal(elements[1].value, "Ana");
  assert.equal(elements[2].attributes["aria-label"], "Roll the die");
  assert.equal(elements[3].attributes.title, "Roll the die");
  assert.throws(() => applyTranslations(root, {}), /Missing translation/);
});
test("page navigation links only to the two games and shared code makes no background game requests", async () => {
  for (const name of ["index.html","en.html"]) {
    const html = await file(name);
    const links = [...html.matchAll(/href="(https:[^"]+)"/g)].map(match => match[1]);
    assert.equal(links.length, 4);
    assert.ok(links.every(link => ["https://dice-jumbo-2.onrender.com/","https://ne-ljuti-se-covece-2.onrender.com/"].includes(link)));
    assert.doesNotMatch(html, /<(?:script|img|link)\b[^>]*(?:src|href)="https?:/);
  }
  for (const name of ["arena-ui.js","brand-die.js","language.js","messages.js"]) {
    assert.doesNotMatch(await file("shared/" + name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|setInterval/);
  }
});
test("every browser module import and stylesheet is available over HTTP", async t => {
  const allowed = new Set(["index.html","en.html","shared/arena.css","shared/arena-ui.js","shared/brand-die.js","shared/language.js","shared/messages.js"]);
  const server = createServer(async (request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    if (!allowed.has(name)) { response.writeHead(404); response.end(); return; }
    const source = await file(name);
    response.setHeader("content-type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
    response.end(source);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = "http://127.0.0.1:" + server.address().port;
  const seen = new Set();
  async function visit(url) {
    if (seen.has(url)) return; seen.add(url);
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
    const source = await response.text();
    if (url.endsWith(".js")) {
      assert.match(response.headers.get("content-type"), /javascript/);
      for (const match of source.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)) await visit(new URL(match[1], url).href);
    } else if (url.endsWith(".html")) {
      for (const match of source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) await visit(new URL(match[1], url).href);
    }
  }
  await visit(origin + "/index.html"); await visit(origin + "/en.html");
  assert.equal(seen.size, allowed.size);
});
