import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { io as client } from "socket.io-client";
import { RoomManager } from "./room-manager.js";
import { createSecureRoomSocketServer } from "./socketio-adapter.js";
import { exampleGame } from "./example-game.js";

function connect(url, origin = url) {
  const socket = client(url, { transports: ["websocket"], reconnection: false, timeout: 3000,
    extraHeaders: { Origin: origin } });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", error => { socket.disconnect(); reject(error); });
  });
}

function ack(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const callback = (error, response) => error ? reject(error) : resolve(response);
    if (payload === undefined) socket.timeout(3000).emit(event, callback);
    else socket.timeout(3000).emit(event, payload, callback);
  });
}

test("Socket.IO adapter shares links, scopes seats, rejects stale moves and locks origins", { timeout: 15_000 }, async () => {
  const server = http.createServer((_, response) => response.writeHead(404).end());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rooms = new RoomManager({ game: exampleGame });
  const io = createSecureRoomSocketServer(server, rooms, { allowedOrigins: [base], publicUrl: base });
  const sockets = [];
  try {
    const host = await connect(base);
    sockets.push(host);
    const created = await ack(host, "room:create", { name: "Host" });
    assert.equal(created.ok, true);
    assert.equal(created.inviteUrl, `${base}/?room=${created.code}`);
    assert.equal(JSON.stringify(created.state).includes(created.token), false);

    const guest = await connect(base);
    sockets.push(guest);
    const joined = await ack(guest, "room:join", { code: created.code, name: "Guest" });
    assert.equal(joined.ok, true);
    assert.equal(joined.state.players.length, 2);

    const wrongHost = await ack(guest, "room:start", { requestId: "start-0001", expectedRevision: 1 });
    assert.equal(wrongHost.error.code, "FORBIDDEN");
    const started = await ack(host, "room:start", { requestId: "start-0002", expectedRevision: 1 });
    assert.equal(started.revision, 2);

    const outOfTurn = await ack(guest, "room:command", { requestId: "move-0001", expectedRevision: 2,
      command: { type: "take", amount: 1 } });
    assert.equal(outOfTurn.error.code, "NOT_YOUR_TURN");
    const move = { requestId: "move-0002", expectedRevision: 2, command: { type: "take", amount: 2 } };
    assert.equal((await ack(host, "room:command", move)).revision, 3);
    assert.equal((await ack(host, "room:command", move)).replay, true);
    assert.equal((await ack(host, "room:sync")).state.game.count, 2);

    const resumedSocket = await connect(base);
    sockets.push(resumedSocket);
    const resumed = await ack(resumedSocket, "room:resume", { token: created.token });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.playerId, created.playerId);
    assert.equal((await ack(resumedSocket, "room:leave")).error.code, "ACTIVE_GAME");
    assert.equal((await ack(resumedSocket, "room:sync")).state.phase, "playing");

    await assert.rejects(connect(base, "https://not-allowed.example"));
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

