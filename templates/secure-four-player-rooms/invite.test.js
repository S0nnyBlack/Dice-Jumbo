import test from "node:test";
import assert from "node:assert/strict";
import { buildRoomLink, readRoomCode } from "./invite.js";

test("a new room gets a shareable link containing only the invite code", () => {
  const link = buildRoomLink("https://games.example/yamb#rules", "ABCDEFGHJK");
  assert.equal(link, "https://games.example/yamb?room=ABCDEFGHJK");
  assert.equal(readRoomCode(new URL(link).search), "ABCDEFGHJK");
  assert.equal(readRoomCode("?room=invalid"), "");
  assert.equal(link.includes("token"), false);
});

test("links reject invalid codes and credential-bearing URLs", () => {
  assert.throws(() => buildRoomLink("https://games.example/", "SHORT"));
  assert.throws(() => buildRoomLink("https://user:password@games.example/", "ABCDEFGHJK"));
});

