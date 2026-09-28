import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { io as createClient } from "socket.io-client";

const timeoutMs = 5000;

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(value);
    };
    socket.on(event, onEvent);
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", error => error ? reject(error) : resolve()));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Server did not become healthy");
}

function connect(url) {
  const socket = createClient(url, { reconnection: false, timeout: timeoutMs });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

test("Socket.IO game flow enforces turns, preserves held dice, rejects duplicate entries, and resumes sessions", async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  const sockets = [];

  try {
    const healthResponse = await waitForHealth(`${baseUrl}/health`, child);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.service, "jumbo-dice-server");

    const host = await connect(baseUrl);
    sockets.push(host);
    const createdWait = waitFor(host, "room:created");
    host.emit("room:create", { name: "Host" });
    const created = await createdWait;

    const guest = await connect(baseUrl);
    sockets.push(guest);
    const joinedWait = waitFor(guest, "room:joined");
    guest.emit("room:join", { roomCode: created.roomCode, name: "Gost" });
    const joined = await joinedWait;

    const startedWait = waitFor(host, "state", state => state.started);
    host.emit("room:start");
    const started = await startedWait;
    assert.equal(started.currentPlayerId, created.playerId);
    assert.deepEqual(started.config.columns, ["down", "free", "up"]);

    const firstRollWait = waitFor(host, "state", state => state.rolls === 1 && state.dice.length === 6);
    host.emit("turn:roll");
    const firstRoll = await firstRollWait;
    const heldIndex = 0;

    const selectionWait = waitFor(host, "state", state => state.selection.includes(heldIndex));
    host.emit("turn:select", { indices: [heldIndex] });
    await selectionWait;

    const rerollWait = waitFor(host, "state", state => state.rolls === 2);
    host.emit("turn:roll");
    const reroll = await rerollWait;
    assert.equal(reroll.dice[heldIndex], firstRoll.dice[heldIndex]);

    const selectedAgain = waitFor(host, "state", state => state.selection.includes(heldIndex));
    host.emit("turn:select", { indices: [heldIndex] });
    await selectedAgain;

    const face = firstRoll.dice[heldIndex];
    const commitWait = waitFor(host, "state", state =>
      state.currentPlayerId === joined.playerId && state.players[0].cells[`free::${face}`] === face
    );
    host.emit("turn:commit", { columnId: "free", row: String(face) });
    const afterCommit = await commitWait;
    assert.equal(afterCommit.rolls, 0);

    const nonTurnError = waitFor(host, "game:error", error => error.message === "Nije vaš potez.");
    host.emit("turn:roll");
    await nonTurnError;

    const duplicateError = waitFor(host, "game:error", error => error.message === "Nije vaš potez.");
    host.emit("turn:commit", { columnId: "free", row: String(face) });
    await duplicateError;
    assert.equal(afterCommit.players[0].cells[`free::${face}`], face);

    const guestRollWait = waitFor(guest, "state", state => state.currentPlayerId === joined.playerId && state.rolls === 1);
    guest.emit("turn:roll");
    await guestRollWait;

    const token = joined.sessionToken;
    guest.disconnect();
    const resumedSocket = await connect(baseUrl);
    sockets.push(resumedSocket);
    const resumedWait = waitFor(resumedSocket, "room:resumed");
    resumedSocket.emit("room:resume", { sessionToken: token });
    const resumed = await resumedWait;
    assert.equal(resumed.playerId, joined.playerId);
    const resumedState = await waitFor(resumedSocket, "state", state => state.currentPlayerId === joined.playerId);
    assert.equal(resumedState.rolls, 1);

    const index = resumedState.dice.findIndex((_, i) => i === 0);
    const chooseWait = waitFor(resumedSocket, "state", state => state.selection.includes(index));
    resumedSocket.emit("turn:select", { indices: [index] });
    await chooseWait;

    const guestFace = resumedState.dice[index];
    const finishGuestTurn = waitFor(resumedSocket, "state", state =>
      state.currentPlayerId === created.playerId && state.players[1].cells[`free::${guestFace}`] === guestFace
    );
    resumedSocket.emit("turn:commit", { columnId: "free", row: String(guestFace) });
    await finishGuestTurn;

    const occupiedError = waitFor(host, "game:error", error => error.message === "Polje je već iskorišćeno.");
    const hostRollWait = waitFor(host, "state", state => state.currentPlayerId === created.playerId && state.rolls === 1);
    host.emit("turn:roll");
    const hostTurn = await hostRollWait;
    const selectHostDie = waitFor(host, "state", state => state.selection.length === 1);
    host.emit("turn:select", { indices: [0] });
    await selectHostDie;
    host.emit("turn:commit", { columnId: "free", row: String(face) });
    await occupiedError;
    assert.equal(hostTurn.currentPlayerId, created.playerId);
  } finally {
    for (const socket of sockets) socket.disconnect();
    child.kill("SIGTERM");
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
});
