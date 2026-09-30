import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { makeRoomCode, makeSessionToken, tokenHash, RateLimiter, allowedOrigin, securityHeaders, readLimit } from "../server/security.js";

test("room credentials use cryptographic randomness and validated hashed bearer tokens", () => {
  const tokens = new Set(Array.from({ length: 128 }, makeSessionToken));
  assert.equal(tokens.size, 128);
  for (const token of tokens) { assert.match(token, /^[a-f0-9]{64}$/); assert.notEqual(tokenHash(token), token); }
  for (let i = 0; i < 128; i++) assert.match(makeRoomCode(), /^[A-HJ-NP-Z2-9]{5}$/);
  for (const token of [null, {}, [], "guess", "a".repeat(10000)]) assert.equal(tokenHash(token), null);
});
test("limits reset after their window and the limiter stays bounded", () => {
  let time = 0;
  const limiter = new RateLimiter(() => time);
  assert.equal(limiter.consume("actor", 2), true);
  assert.equal(limiter.consume("actor", 2), true);
  assert.equal(limiter.consume("actor", 2), false);
  time = 60000;
  assert.equal(limiter.consume("actor", 2), true);
  assert.throws(() => readLimit("-1", 10));
  assert.throws(() => readLimit("bad", 10));
  assert.equal(readLimit(undefined, 10), 10);
});
test("origin policy rejects foreign browsers and opaque origins for both transports", () => {
  const req = headers => ({ headers });
  assert.equal(allowedOrigin(req({origin:"https://game.example"}), "https://game.example/path"), true);
  assert.equal(allowedOrigin(req({origin:"https://evil.example"}), "https://game.example"), false);
  assert.equal(allowedOrigin(req({origin:"null"}), "https://game.example"), false);
  assert.equal(allowedOrigin(req({"sec-fetch-site":"cross-site"}), "https://game.example"), false);
  assert.equal(allowedOrigin(req({}), "https://game.example"), true);
  assert.equal(securityHeaders("https://game.example")["Content-Security-Policy"].includes("wss://game.example"), true);
  assert.throws(() => securityHeaders("javascript:alert(1)"));
});
test("the real Jamb lobby renderer escapes hostile player names before HTML insertion", () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const escape = source.split("\n").find(line => line.startsWith("const escapeHtml="));
  const renderer = source.match(/function renderLobbyState\(s\)\{[\s\S]*?\n\}/)[0];
  const app = { innerHTML: "", querySelector: () => ({}) };
  const state = {players:[{id:"host",name:'<img src=x onerror="alert(1)">',connected:true}],hostId:"host",roomCode:"ABCDE"};
  runInNewContext(escape + "\n" + renderer + "\nrenderLobbyState(state);", {
    app, state, appNavMarkup: () => "", net:{playerId:"host"}, leaveOnlineRoom: () => {}
  });
  assert.doesNotMatch(app.innerHTML, /<img|onerror="alert/);
  assert.match(app.innerHTML, /&lt;img/);
});
