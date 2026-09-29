import test from "node:test";
import assert from "node:assert/strict";
import { RoomError, RoomManager } from "./room-manager.js";
import { exampleGame } from "./example-game.js";

const manager = options => new RoomManager({ game: exampleGame, ...options });
const create = (rooms, connectionId = "host", clientKey = "host-ip") =>
  rooms.create({ name: "Host", connectionId, clientKey });
const join = (rooms, code, connectionId = "guest", clientKey = "guest-ip") =>
  rooms.join({ code, name: "Guest", connectionId, clientKey });
const isCode = code => error => error instanceof RoomError && error.code === code;

test("room has two to four seats and only host can start", () => {
  const rooms = manager();
  const host = create(rooms);
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.match(host.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(host.state.players.length, 1);
  assert.equal(JSON.stringify(host.state).includes(host.token), false);
  assert.throws(() => rooms.start({ connectionId: "host", requestId: "start-0001", expectedRevision: 0 }), isCode("NOT_READY"));
  const guest = join(rooms, host.code);
  assert.equal(guest.state.revision, 1);
  assert.throws(() => rooms.start({ connectionId: "guest", requestId: "start-0002", expectedRevision: 1 }), isCode("FORBIDDEN"));
  const started = rooms.start({ connectionId: "host", requestId: "start-0003", expectedRevision: 1 });
  assert.equal(started.revision, 2);
  assert.equal(rooms.snapshotForConnection("guest").phase, "playing");
  assert.throws(() => join(rooms, host.code, "late"), isCode("ROOM_UNAVAILABLE"));
  assert.throws(() => rooms.leaveLobby("guest"), isCode("ACTIVE_GAME"));
  assert.equal(rooms.snapshotForConnection("host").phase, "playing");
});

test("four-player cap, host transfer, and token revocation", () => {
  const rooms = manager();
  const host = create(rooms);
  const second = join(rooms, host.code, "two", "ip2");
  join(rooms, host.code, "three", "ip3");
  join(rooms, host.code, "four", "ip4");
  assert.throws(() => join(rooms, host.code, "five", "ip5"), isCode("ROOM_UNAVAILABLE"));
  rooms.leaveLobby("host");
  const state = rooms.snapshotForConnection("two");
  assert.equal(state.hostId, second.playerId);
  assert.equal(state.players.length, 3);
  assert.throws(() => rooms.resume({ token: host.token, connectionId: "old-host", clientKey: "ip1" }), isCode("UNAUTHORIZED"));
  join(rooms, host.code, "replacement", "ip5");
  assert.equal(rooms.snapshotForConnection("two").players.length, 4);
});

test("commands are server-authorized, revision checked, and idempotent", () => {
  const rooms = manager();
  const host = create(rooms);
  join(rooms, host.code);
  rooms.start({ connectionId: "host", requestId: "start-0001", expectedRevision: 1 });
  const move = { connectionId: "host", requestId: "move-0001", expectedRevision: 2, command: { type: "take", amount: 2 } };
  assert.throws(() => rooms.command({ ...move, connectionId: "intruder" }), isCode("UNAUTHORIZED"));
  assert.throws(() => rooms.command({ ...move, connectionId: "guest" }), isCode("NOT_YOUR_TURN"));
  assert.equal(rooms.snapshotForConnection("host").revision, 2);
  assert.deepEqual(rooms.command(move), { revision: 3 });
  assert.deepEqual(rooms.command(move), { revision: 3, replay: true });
  assert.equal(rooms.snapshotForConnection("guest").game.count, 2);
  assert.throws(() => rooms.command({ ...move, command: { type: "take", amount: 1 } }), isCode("REQUEST_ID_REUSED"));
  assert.throws(() => rooms.command({ ...move, requestId: "move-0002" }), isCode("STALE_REVISION"));
  assert.deepEqual(rooms.command({ connectionId: "guest", requestId: "move-0003", expectedRevision: 3,
    command: { type: "take", amount: 1 } }), { revision: 4 });
});

test("failed or malicious commands cannot mutate stored state", () => {
  const rooms = manager();
  const host = create(rooms);
  join(rooms, host.code);
  rooms.start({ connectionId: "host", requestId: "start-0001", expectedRevision: 1 });
  const badKey = JSON.parse('{"type":"take","__proto__":{"admin":true}}');
  assert.throws(() => rooms.command({ connectionId: "host", requestId: "move-0001", expectedRevision: 2, command: badKey }), isCode("INVALID_PAYLOAD"));
  assert.throws(() => rooms.command({ connectionId: "host", requestId: "move-0002", expectedRevision: 2,
    command: { type: "take", amount: 99 } }), isCode("INVALID_MOVE"));
  assert.deepEqual(rooms.snapshotForConnection("host").game, { target: 5, count: 0, currentSeat: 0, winnerSeat: null });
  assert.equal(rooms.snapshotForConnection("host").revision, 2);
});

test("resume replaces the old connection; a late disconnect cannot evict the new one", () => {
  const rooms = manager();
  const host = create(rooms);
  const resumed = rooms.resume({ token: host.token, clientKey: "new-ip", connectionId: "new-host" });
  assert.equal(resumed.previousConnectionId, "host");
  assert.equal(resumed.playerId, host.playerId);
  assert.equal(rooms.disconnect("host"), false);
  assert.equal(rooms.snapshotForConnection("new-host").players[0].connected, true);
  assert.throws(() => rooms.snapshotForConnection("host"), isCode("UNAUTHORIZED"));
  rooms.disconnect("new-host");
  assert.equal(rooms.connectedViews(host.code).length, 0);
  rooms.resume({ token: host.token, clientKey: "new-ip", connectionId: "again" });
  assert.equal(rooms.snapshotForConnection("again").players[0].connected, true);
});

test("capacity, per-client rate limits and expiry bound resource use", () => {
  let time = 0;
  const rooms = manager({ now: () => time, limits: { maxRooms: 1, disconnectedIdleMs: 100, maxRoomAgeMs: 1000 } });
  const host = create(rooms);
  assert.throws(() => create(rooms, "second", "second-ip"), isCode("CAPACITY"));
  for (let attempt = 0; attempt < 20; attempt++) {
    assert.throws(() => join(rooms, "AAAAAAAAAA", `probe-${attempt}`, "attacker-ip"), isCode(attempt < 19 ? "ROOM_UNAVAILABLE" : "ROOM_UNAVAILABLE"));
  }
  assert.throws(() => join(rooms, "AAAAAAAAAA", "probe-21", "attacker-ip"), isCode("RATE_LIMITED"));
  rooms.disconnect("host");
  time = 101;
  assert.equal(rooms.sweep(), 1);
  assert.equal(rooms.stats().rooms, 0);
  assert.throws(() => rooms.resume({ token: host.token, clientKey: "host-ip", connectionId: "return" }), isCode("UNAUTHORIZED"));
});

test("private state can be filtered differently for each viewer", () => {
  const secretGame = {
    create: () => ({ secret: "hidden", moves: 0 }),
    apply: state => { state.moves++; },
    publicState: (state, { seat }) => ({ moves: state.moves, secret: seat === 0 ? state.secret : null })
  };
  const rooms = new RoomManager({ game: secretGame });
  const host = create(rooms);
  join(rooms, host.code);
  const views = rooms.connectedViews(host.code);
  assert.equal(views.find(view => view.connectionId === "host").state.game.secret, "hidden");
  assert.equal(views.find(view => view.connectionId === "guest").state.game.secret, null);
  assert.equal(JSON.stringify(views).includes(host.token), false);
});

