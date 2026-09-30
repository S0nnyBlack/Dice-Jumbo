import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { io as createClient } from "socket.io-client";

const timeoutMs = 15000;
let waitCount = 0;

function waitFor(socket, event, predicate = () => true) {
  const waitNumber = ++waitCount;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event} (wait #${waitNumber})`));
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
  let turnId;
  socket.on("state", value => { turnId = value.turnId; });
  const rawEmit = socket.emit.bind(socket);
  socket.emit = (event, payload, ...args) => event.startsWith("turn:")
    ? rawEmit(event, { ...payload, turnId: payload?.turnId ?? turnId, requestId: payload?.requestId ?? randomUUID() }, ...args)
    : rawEmit(event, payload, ...args);
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
    const arenaStyles = await fetch(`${baseUrl}/arena.css`);
    assert.equal(arenaStyles.status, 200);
    assert.match(await arenaStyles.text(), /--green: #81b64c/);
    const inviteModule = await fetch(`${baseUrl}/invite.js`);
    assert.equal(inviteModule.status, 200);
    assert.match(await inviteModule.text(), /export function readInviteCode/);
    const languageModule = await fetch(`${baseUrl}/i18n.js`);
    assert.equal(languageModule.status, 200);
    assert.match(await languageModule.text(), /export function translateText/);

    const host = await connect(baseUrl);
    sockets.push(host);
    const createdWait = waitFor(host, "room:created");
    host.emit("room:create", { name: "Host" });
    const created = await createdWait;

    const duplicateRoomError = waitFor(host, "game:error", error => error.message === "Već ste u sobi.");
    host.emit("room:create", { name: "Host again" });
    await duplicateRoomError;

    let guest = await connect(baseUrl);
    sockets.push(guest);
    const joinedWait = waitFor(guest, "room:joined");
    guest.emit("room:join", { roomCode: created.roomCode, name: "Gost" });
    const joined = await joinedWait;
    const duplicateJoinError = waitFor(guest, "game:error", error => error.message === "Već ste u sobi.");
    guest.emit("room:join", { roomCode: created.roomCode, name: "Gost again" });
    await duplicateJoinError;

    const offlineState = waitFor(host, "state", state => state.players.some(player => player.id === joined.playerId && !player.connected));
    guest.disconnect();
    await offlineState;
    const offlineStartError = waitFor(host, "game:error", error => error.message === "Svi igrači moraju biti povezani pre početka partije.");
    host.emit("room:start");
    await offlineStartError;
    guest = await connect(baseUrl);
    sockets.push(guest);
    const preStartResume = waitFor(guest, "room:resumed");
    guest.emit("room:resume", { sessionToken: joined.sessionToken });
    await preStartResume;

    const startedWait = waitFor(host, "state", state => state.started);
    host.emit("room:start");
    const started = await startedWait;
    assert.equal(started.currentPlayerId, created.playerId);
    assert.deepEqual(started.config.columns, ["down", "free", "up"]);
    assert.deepEqual(started.turnHistory, []);

    const firstRollWait = waitFor(host, "state", state => state.rolls === 1 && state.dice.length === 6);
    const guestSeesFirstRoll = waitFor(guest, "state", state => state.currentPlayerId === created.playerId && state.rolls === 1 && state.dice.length === 6);
    host.emit("turn:roll");
    const [firstRoll, observedFirstRoll] = await Promise.all([firstRollWait, guestSeesFirstRoll]);
    assert.deepEqual(observedFirstRoll.dice, firstRoll.dice, "opponents see the active player's dice");
    assert.equal(observedFirstRoll.maxRolls, firstRoll.maxRolls, "opponents see the active player's roll limit");
    const nonTurnRollError = waitFor(guest, "game:error", error => error.message === "Nije vaš potez.");
    guest.emit("turn:roll");
    await nonTurnRollError;
    const invalidSelectionError = waitFor(host, "game:error", error => error.message === "Izbor kockica mora biti lista indeksa.");
    host.emit("turn:select", { indices: null });
    await invalidSelectionError;
    const stillHealthy = await fetch(`${baseUrl}/health`);
    assert.equal(stillHealthy.ok, true);
    const heldIndex = 0;

    const selectionWait = waitFor(host, "state", state => state.selection.includes(heldIndex));
    const guestSeesSelection = waitFor(guest, "state", state => state.currentPlayerId === created.playerId && state.selection.includes(heldIndex));
    host.emit("turn:select", { indices: [heldIndex] });
    const [selectedState, observedSelection] = await Promise.all([selectionWait, guestSeesSelection]);
    assert.deepEqual(observedSelection.selection, selectedState.selection, "opponents see which dice the active player holds");

    const rerollWait = waitFor(host, "state", state => state.rolls === 2);
    const guestSeesReroll = waitFor(guest, "state", state => state.currentPlayerId === created.playerId && state.rolls === 2);
    host.emit("turn:roll");
    const [reroll, observedReroll] = await Promise.all([rerollWait, guestSeesReroll]);
    assert.deepEqual(observedReroll.dice, reroll.dice, "opponents see the active player's reroll");
    assert.deepEqual(observedReroll.selection, reroll.selection, "opponents see held dice after the reroll");
    assert.equal(reroll.dice[heldIndex], firstRoll.dice[heldIndex]);
    assert.deepEqual(reroll.selection, [heldIndex], "saved dice stay selected after reroll");

    const face = firstRoll.dice[heldIndex];
    const commitWait = waitFor(host, "state", state =>
      state.currentPlayerId === joined.playerId && state.players[0].cells[`free::${face}`] === face
    );
    const guestSeesHistory = waitFor(guest, "state", state => state.turnHistory?.length === 1);
    host.emit("turn:commit", { columnId: "free", row: String(face) });
    const [afterCommit, guestHistoryState] = await Promise.all([commitWait, guestSeesHistory]);
    assert.equal(afterCommit.rolls, 0);
    const expectedMove = { playerId: created.playerId, columnId: "free", row: String(face), value: face, crossOut: false };
    assert.deepEqual(afterCommit.turnHistory, [expectedMove]);
    assert.deepEqual(guestHistoryState.turnHistory, [expectedMove], "all players see committed moves");

    const undoUnavailableError = waitFor(host, "game:error", error => error.message === "Vraćanje poteza nije dostupno u online partiji.");
    host.emit("turn:undo");
    await undoUnavailableError;
    assert.equal(afterCommit.currentPlayerId, joined.playerId, "online undo cannot roll back a committed turn");
    assert.equal(afterCommit.players[0].cells[`free::${face}`], face, "the committed score remains in place");

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
    const resumedStateWait = waitFor(resumedSocket, "state", state => state.currentPlayerId === joined.playerId);
    resumedSocket.emit("room:resume", { sessionToken: token });
    const resumed = await resumedWait;
    assert.equal(resumed.playerId, joined.playerId);
    const resumedState = await resumedStateWait;
    assert.equal(resumedState.rolls, 1);
    assert.deepEqual(resumedState.turnHistory, [expectedMove], "history survives reconnection");

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

    const scoreRows = ["1", "2", "3", "4", "5", "6", "MAX", "MIN", "KENTA", "TRILING", "FUL", "POKER", "YAMB"];
    let turnState = hostTurn;
    for (let move = 0; move < 80 && !turnState.gameOver; move++) {
      const actorId = turnState.currentPlayerId;
      const actor = actorId === created.playerId ? host : resumedSocket;
      const ownPlayer = turnState.players.find(player => player.id === actorId);
      assert.ok(ownPlayer, "active player is included in each state");

      let readyState = turnState;
      if (readyState.rolls === 0) {
        const rollWait = waitFor(actor, "state", state => state.currentPlayerId === actorId && state.rolls === 1);
        actor.emit("turn:roll");
        readyState = await rollWait;
      }

      const nextCell = [
        ["down", scoreRows],
        ["free", scoreRows],
        ["up", [...scoreRows].reverse()]
      ].flatMap(([columnId, rows]) =>
        rows.filter(row => ownPlayer.cells[`${columnId}::${row}`] === undefined)
          .map(row => ({ columnId, row }))
      )[0];
      assert.ok(nextCell, "active player has an unfilled score cell");

      const turnComplete = waitFor(actor, "state", state => state.gameOver || state.currentPlayerId !== actorId);
      actor.emit("turn:commit", { ...nextCell, crossOut: true });
      turnState = await turnComplete;
    }

    assert.equal(turnState.gameOver, true, "the game ends after all required cells are filled");
    assert.ok(turnState.turnHistory.length <= 12, "recent turn history stays bounded");
    assert.ok(turnState.turnHistory.some(move => move.crossOut), "cross-outs appear in turn history");
    for (const player of turnState.players) {
      assert.notEqual(player.cells["free::SUM_TOP"], undefined);
      assert.notEqual(player.cells["free::SUM_MID"], undefined);
      assert.notEqual(player.cells["free::SUM_TOTAL"], undefined);
    }
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

test("malformed requests stay safe and players can leave lobby and active rooms", async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, PORT: String(port) }, stdio: "ignore"
  });
  const sockets = [];
  try {
    await waitForHealth(`${baseUrl}/health`, child);
    const host = await connect(baseUrl);
    const guest = await connect(baseUrl);
    sockets.push(host, guest);

    const invalidName = waitFor(host, "game:error", error => error.message === "Ime igrača mora biti tekst.");
    host.emit("room:create", { name: { toString: null } });
    await invalidName;
    const invalidCode = waitFor(guest, "game:error", error => error.message === "Kod sobe mora biti tekst.");
    guest.emit("room:join", { roomCode: { toString: null } });
    await invalidCode;

    const createdWait = waitFor(host, "room:created");
    host.emit("room:create", { name: "Host" });
    const created = await createdWait;
    const joinedWait = waitFor(guest, "room:joined");
    guest.emit("room:join", { roomCode: created.roomCode, name: "Gost" });
    await joinedWait;

    const hostAlone = waitFor(host, "state", state => state.players.length === 1);
    const guestLeft = waitFor(guest, "room:left");
    guest.emit("room:leave");
    await Promise.all([hostAlone, guestLeft]);

    const hostLeft = waitFor(host, "room:left");
    host.emit("room:leave");
    await hostLeft;
    const newRoomWait = waitFor(host, "room:created");
    host.emit("room:create", { name: "New host" });
    const newRoom = await newRoomWait;
    const rejoinedWait = waitFor(guest, "room:joined");
    guest.emit("room:join", { roomCode: newRoom.roomCode, name: "Gost" });
    const rejoined = await rejoinedWait;
    const transferredHost = waitFor(guest, "state", state => state.hostId === rejoined.playerId && state.players.length === 1);
    const originalHostLeft = waitFor(host, "room:left");
    host.emit("room:leave");
    await Promise.all([transferredHost, originalHostLeft]);
    const hostRejoined = waitFor(host, "room:joined");
    host.emit("room:join", { roomCode: newRoom.roomCode, name: "Host" });
    await hostRejoined;
    const startedWait = waitFor(host, "state", state => state.started);
    guest.emit("room:start");
    await startedWait;

    const closedHost = waitFor(host, "room:closed");
    const closedGuest = waitFor(guest, "room:closed");
    guest.emit("room:leave");
    await Promise.all([closedHost, closedGuest]);
    assert.equal((await (await fetch(`${baseUrl}/health`)).json()).ok, true);

    const afterClose = waitFor(host, "room:created");
    host.emit("room:create", { name: "Host again" });
    await afterClose;
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


test("online M requires a maximum score and remains manually playable", async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, PORT: String(port) }, stdio: "ignore"
  });
  const sockets = [];
  try {
    await waitForHealth(`${baseUrl}/health`, child);
    const host = await connect(baseUrl);
    const guest = await connect(baseUrl);
    sockets.push(host, guest);
    const createdWait = waitFor(host, "room:created");
    host.emit("room:create", { name: "Host", config: { columns: ["m"] } });
    const created = await createdWait;
    const joinedWait = waitFor(guest, "room:joined");
    guest.emit("room:join", { roomCode: created.roomCode, name: "Guest" });
    await joinedWait;
    const startedWait = waitFor(host, "state", state => state.started);
    host.emit("room:start");
    const started = await startedWait;
    assert.ok(started.config.columns.includes("m"));
    assert.equal(started.players[0].cells["m::1"], undefined, "M is not filled automatically");

    const rolledWait = waitFor(host, "state", state => state.rolls === 1);
    host.emit("turn:roll");
    const rolled = await rolledWait;
    const face = String(rolled.dice[0]);
    const selectedWait = waitFor(host, "state", state => state.selection.includes(0));
    host.emit("turn:select", { indices: [0] });
    await selectedWait;
    const rejectedWait = waitFor(host, "game:error", error => error.message === "Kolona M prihvata samo najveći mogući rezultat za izabrani red.");
    host.emit("turn:commit", { columnId: "m", row: face });
    await rejectedWait;
    const crossedWait = waitFor(host, "state", state => state.players[0].cells[`m::${face}`] === 0);
    host.emit("turn:commit", { columnId: "m", row: face, crossOut: true });
    const crossed = await crossedWait;
    assert.ok(crossed.players[0].crossedCells.includes(`m::${face}`));
    assert.equal(crossed.currentPlayerId, crossed.players[1].id);
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

test("Arena routes serve both games, preserve invites and load every browser dependency", async t => {
  const port = await freePort();
  const origin = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["server/server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  t.after(() => child.kill());
  await waitForHealth(origin + "/health", child);
  for (const route of ["/", "/en.html"]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Arena Games/);
    assert.match(html, /href="\/jamb"/);
    assert.match(html, /href="https:\/\/ne-ljuti-se-covece-2.onrender.com\/"/);
    assert.doesNotMatch(html, /socket.io|PROTOTIP|PROTOTYPE/);
    if (route === "/en.html") assert.match(html, /<html lang="en">/);
  }
  const seen = new Set();
  async function visit(url) {
    if (seen.has(url)) return;
    seen.add(url);
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
    const source = await response.text();
    if (url.endsWith(".js")) {
      assert.match(response.headers.get("content-type"), /javascript/);
      for (const match of source.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)) await visit(new URL(match[1], url).href);
    }
    if (url.endsWith(".css")) assert.match(response.headers.get("content-type"), /text\/css/);
  }
  const home = await (await fetch(origin + "/")).text();
  for (const match of home.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) await visit(new URL(match[1], origin).href);
  assert.equal(seen.size, 5);
  for (const route of ["/jamb", "/jamb/", "/jamb?room=AB123"]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<base href="\/">/);
    assert.match(html, /type="module" src="app.js"/);
    const base = new URL("/", origin + route);
    for (const name of ["app.js", "game.js", "invite.js", "i18n.js", "styles.css", "arena.css"]) {
      assert.equal((await fetch(new URL(name, base))).status, 200, name);
    }
  }
  const invite = await fetch(origin + "/?room=AB123&lang=en", { redirect: "manual" });
  assert.equal(invite.status, 302);
  assert.equal(invite.headers.get("location"), "/jamb?room=AB123&lang=en");
  assert.equal((await fetch(origin + "/hub/shared/missing.js")).status, 404);
  assert.equal((await fetch(origin + "/package.json")).status, 404);
});

test("security rejects foreign browser origins, weak tokens, duplicate/stale commands and room exhaustion", async t => {
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, PORT: String(port), PUBLIC_URL: "https://dice-jumbo-2.onrender.com", SECURITY_MAX_ROOMS: "1" }, stdio: "ignore"
  });
  const sockets = [];
  t.after(() => { sockets.forEach(socket => socket.disconnect()); child.kill(); });
  await waitForHealth(base + "/health", child);
  const page = await fetch(base + "/jamb");
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("x-powered-by"), null);
  assert.match(await page.text(), /src="\/socket.io\/socket.io.js"/);
  assert.equal((await fetch(base + "/socket.io/socket.io.js")).status, 200);
  for (const transport of ["polling", "websocket"]) {
    const rejected = createClient(base, { transports: [transport], reconnection: false, timeout: 3000, extraHeaders: { Origin: "https://evil.example" } });
    sockets.push(rejected);
    const error = await new Promise(resolve => rejected.once("connect_error", resolve));
    assert.ok(error);
    assert.equal(rejected.connected, false);
  }
  assert.equal((await fetch(base + "/socket.io/?EIO=4&transport=polling", { headers: { Origin: "null" } })).status, 403);
  const host = await connect(base); sockets.push(host);
  const createdWait = waitFor(host, "room:created");
  const firstState = waitFor(host, "state");
  host.emit("room:create", { name: '<img src=x onerror=alert(1)>' });
  const room = await createdWait;
  const publicRoom = await firstState;
  assert.match(room.roomCode, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.match(room.sessionToken, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(publicRoom), /sessionToken|tokenHash|processedCommands/);
  const second = await connect(base); sockets.push(second);
  const capacity = waitFor(second, "game:error");
  second.emit("room:create", { name: "Overflow" });
  assert.match((await capacity).message, /zauzete/);
  const weakToken = waitFor(second, "game:error");
  second.emit("room:resume", { sessionToken: "predictable-timestamp" });
  assert.match((await weakToken).message, /Sesija/);
  const joinedWait = waitFor(second, "room:joined");
  second.emit("room:join", { roomCode: room.roomCode, name: "Guest" });
  await joinedWait;
  const startedWait = waitFor(host, "state", state => state.started);
  host.emit("room:start");
  const started = await startedWait;
  const oldTurn = waitFor(host, "game:error");
  host.emit("turn:roll", { turnId: "0".repeat(32), requestId: randomUUID() });
  assert.match((await oldTurn).message, /Zastarela/);
  const commandId = randomUUID();
  const rolledWait = waitFor(host, "state", state => state.rolls === 1);
  host.emit("turn:roll", { turnId: started.turnId, requestId: commandId });
  await rolledWait;
  const duplicate = waitFor(host, "game:error");
  host.emit("turn:roll", { turnId: started.turnId, requestId: commandId });
  assert.match((await duplicate).message, /već obrađena/);
  const reconnect = await connect(base); sockets.push(reconnect);
  const disconnected = new Promise(resolve => host.once("disconnect", resolve));
  const resumed = waitFor(reconnect, "room:resumed");
  const restored = waitFor(reconnect, "state");
  reconnect.emit("room:resume", { sessionToken: room.sessionToken });
  await resumed; await disconnected;
  assert.equal((await restored).rolls, 1, "replayed roll never changed the dice count");
  assert.equal(host.connected, false);
});

test("event flooding is bounded without mutating room state", async t => {
  const port = await freePort(), base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, PORT: String(port), SECURITY_EVENTS_PER_MINUTE: "2" }, stdio: "ignore"
  });
  const sockets = [];
  t.after(() => { sockets.forEach(socket => socket.disconnect()); child.kill(); });
  await waitForHealth(base + "/health", child);
  const socket = await connect(base); sockets.push(socket);
  const created = waitFor(socket, "room:created");
  socket.emit("room:create", { name: "Host" }); await created;
  const left = waitFor(socket, "room:left");
  socket.emit("room:leave"); await left;
  const limited = waitFor(socket, "game:error");
  socket.emit("room:create", { name: "Flood" });
  assert.match((await limited).message, /Previše zahteva/);
});
