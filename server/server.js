import express from "express";
import http from "http";
import { Server } from "socket.io";
import { randomInt, randomBytes } from "crypto";
import { makeRoomCode, makeSessionToken, tokenHash, RateLimiter, readLimit, allowedOrigin, securityHeaders } from "./security.js";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { normalizeColumnIds, calculateColumnSums, visibleCellsForPlayer, combinationScore, SCORE_ROWS, COMBINATION_ROWS, VALUE_ROWS, upperScore, sum, maximumRowScore, directionOrder, frontierRows as gameFrontierRows } from "../game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, "..");
let deploymentId = process.env.RENDER_GIT_COMMIT || "local";
try {
  const buildInfo = JSON.parse(readFileSync(path.join(publicRoot, "deployment-version.json"), "utf8"));
  if (typeof buildInfo.id === "string" && buildInfo.id) deploymentId = buildInfo.id;
} catch {}

const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
if (process.env.NODE_ENV === "production" && !publicUrl) throw new Error("PUBLIC_URL or RENDER_EXTERNAL_URL is required in production");
const responseHeaders = securityHeaders(publicUrl);
const rates = new RateLimiter();
const limits = {
  rooms: readLimit(process.env.SECURITY_MAX_ROOMS, 100),
  connections: readLimit(process.env.SECURITY_MAX_CONNECTIONS, 256),
  connectionsPerIp: readLimit(process.env.SECURITY_CONNECTIONS_PER_IP, 64),
  events: readLimit(process.env.SECURITY_EVENTS_PER_MINUTE, 240)
};
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => { res.set(responseHeaders); next(); });
app.get("/health", (_, res) => res.json({ ok: true, service: "jumbo-dice-server", deploymentId }));
// Preserve room invites shared before the Arena homepage was introduced.
app.get("/", (req, res) => {
  if (req.query.room !== undefined) return res.redirect(302, "/jamb" + req.originalUrl.slice(1));
  res.sendFile(path.join(publicRoot, "hub/index.html"));
});
app.get("/en.html", (_, res) => res.sendFile(path.join(publicRoot, "hub/en.html")));
app.get("/jamb", (_, res) => res.sendFile(path.join(publicRoot, "index.html")));
app.use("/hub/shared", express.static(path.join(publicRoot, "hub/shared"), { index: false }));
app.get("/app.js", (_, res) => res.sendFile(path.join(publicRoot, "app.js")));
app.get("/game.js", (_, res) => res.sendFile(path.join(publicRoot, "game.js")));
app.get("/game-navigation.js", (_, res) => res.sendFile(path.join(publicRoot, "game-navigation.js")));
app.get("/invite.js", (_, res) => res.sendFile(path.join(publicRoot, "invite.js")));
app.get("/i18n.js", (_, res) => res.sendFile(path.join(publicRoot, "i18n.js")));
app.get("/styles.css", (_, res) => res.sendFile(path.join(publicRoot, "styles.css")));
app.get("/arena.css", (_, res) => res.sendFile(path.join(publicRoot, "arena.css")));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 8192,
  allowRequest: (req, callback) => {
    const key = req.socket.remoteAddress || "unknown";
    callback(null, allowedOrigin(req, publicUrl) && rates.consume("connect:" + key, 60) && io.engine.clientsCount < limits.connections);
  }
});

const rooms = new Map();
const sessions = new Map();
function wipeVolatileGameState() {
  rooms.clear();
  sessions.clear();
}
wipeVolatileGameState();
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const ABANDONED_ROOM_MS = 30 * 60 * 1000;
const TOP_ROWS = VALUE_ROWS.map(String);

function createCode() {
  let value;
  do value = makeRoomCode();
  while (rooms.has(value));
  return value;
}
function makeDice() { return Array.from({ length: 6 }, () => randomInt(1, 7)); }
function key(col, row) { return col + "::" + row; }
function emptyCell(player, col, row) { return player.cells[key(col, row)] === undefined; }
function validColumn(config, id) { return config.columns.includes(id); }
function frontierRows(col, player) {
  if (col === "n") return gameFrontierRows(col, player.cells);
  const row = directionOrder(col, player.cells);
  return row ? [row] : [];
}
function requiredColumnReady(room, player) {
  const stop = room.config.columns.indexOf("o");
  if (stop < 0) return true;
  return room.config.columns.slice(0, stop).every(col =>
    SCORE_ROWS.every(row => !emptyCell(player, col, row))
  );
}
function calculateEntry(room, player, col, row, selected, crossOut = false) {
  if (!validColumn(room.config, col)) return { ok: false, error: "Kolona nije aktivna." };
  if (!SCORE_ROWS.includes(row)) return { ok: false, error: "Red nije dozvoljen." };
  if (!emptyCell(player, col, row)) return { ok: false, error: "Polje je već iskorišćeno." };

  if (col === "up" && row !== frontierRows("up", player)[0]) return { ok: false, error: "Gore kolona mora pratiti redosled." };
  if (col === "down" && row !== frontierRows("down", player)[0]) return { ok: false, error: "Dole kolona mora pratiti redosled." };
  if (col === "n" && !frontierRows(col, player).includes(row)) return { ok: false, error: "Kolona mora pratiti otvoreni redosled." };
  if (col === "o" && !requiredColumnReady(room, player)) return { ok: false, error: "Kolona O se otključava kada se popune prethodne kolone." };
  if (col === "r" && room.rolls !== 1) return { ok: false, error: "Ručna kolona se popunjava posle prvog bacanja." };

  if (crossOut) return { ok: true, value: 0 };
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 5 || !selected.every(value => Number.isInteger(value) && value >= 1 && value <= 6)) {
    return { ok: false, error: "Izaberite od 1 do 5 važećih kockica." };
  }

  let value = null;
  if (TOP_ROWS.includes(row)) value = upperScore(selected, Number(row));
  else if (row === "MAX" || row === "MIN") {
    if (selected.length !== 5) return { ok: false, error: "MAX i MIN zahtevaju tačno 5 izabranih kockica." };
    value = sum(selected);
  }
  else if (COMBINATION_ROWS.includes(row)) {
    value = combinationScore(row, selected, { rolls: room.rolls, manual: col === "r" });
    if (value === null) return { ok: false, error: "Izabrane kockice ne ispunjavaju uslov za ovu kombinaciju." };
  }
  if (value === 0) return { ok: false, error: "Rezultat 0 se ne upisuje; izaberite precrtavanje polja." };
  if (col === "m" && value !== maximumRowScore(row)) return { ok: false, error: "Kolona M prihvata samo najveći mogući rezultat za izabrani red." };
  return { ok: true, value };
}
function maxRollsForTurn(room, player) {
  let remaining = 0;
  for (const col of room.config.columns) {
    for (const row of SCORE_ROWS) if (emptyCell(player, col, row)) remaining++;
  }
  return remaining === 1 ? 5 : 3;
}
function isGameOver(room) {
  return room.started && room.players.length > 0 && room.players.every(player =>
    room.config.columns.every(col => SCORE_ROWS.every(row => !emptyCell(player, col, row)))
  );
}
function buildPublicCells(player, viewerId, gameOver) {
  const isSelf = player.id === viewerId;
  return visibleCellsForPlayer(player.cells, { isSelf, gameOver });
}
function publicState(room, viewerId) {
  const viewer = room.players.find(p => p.id === viewerId);
  const activePlayer = room.players.find(p => p.id === room.currentPlayerId);
  const gameOver = isGameOver(room);
  return {
    roomCode: room.code,
    started: room.started,
    gameOver,
    hostId: room.hostId,
    currentPlayerId: room.currentPlayerId,
    rolls: room.rolls,
    maxRolls: activePlayer ? maxRollsForTurn(room, activePlayer) : 3,
    dice: [...room.dice],
    selection: [...room.selection],
    turnId: room.turnId,
    turnHistory: room.turnHistory.map(entry => ({ ...entry })),
    announcedRow: viewer?.announcedRow || null,
    contraTargetRow: room.currentPlayerId === viewerId ? room.contraTargetRow : null,
    config: room.config,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      ready: p.ready,
      cells: buildPublicCells(p, viewerId, gameOver),
      crossedCells: p.crossedCells || []
    }))
  };
}
function broadcast(room) {
  for (const player of room.players) {
    const socket = player.socketId ? io.sockets.sockets.get(player.socketId) : null;
    if (socket) socket.emit("state", publicState(room, player.id));
  }
}
function emitError(socket, message) { socket.emit("game:error", { message }); }
function getRoomBySocket(socketId) {
  for (const room of rooms.values()) if (room.players.some(p => p.socketId === socketId)) return room;
  return null;
}
function getPlayer(room, socketId) { return room?.players.find(p => p.socketId === socketId) || null; }
function fields(payload) { return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}; }
function createPlayer(name, socketId) {
  const token = makeSessionToken();
  const player = {
    id: randomBytes(16).toString("hex"),
    name: name.slice(0, 24), socketId, connected: true, ready: true,
    processedCommands: new Set(), cells: {}, crossedCells: [], announcedRow: null, tokenHash: tokenHash(token)
  };
  return { player, token };
}
function validateTurnCommand(room, player, payload) {
  const { turnId, requestId } = fields(payload);
  if (turnId !== room.turnId || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) return "Zastarela ili neispravna komanda. Osveži stanje igre.";
  if (player.processedCommands.has(requestId)) return "Komanda je već obrađena.";
  player.processedCommands.add(requestId);
  if (player.processedCommands.size > 128) player.processedCommands.delete(player.processedCommands.values().next().value);
  return null;
}
function disposeRoom(room) {
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
  for (const player of room.players) sessions.delete(player.tokenHash);
  rooms.delete(room.code);
}
function scheduleRoomCleanup(room) {
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    room.cleanupTimer = null;
    if (room.players.every(player => !player.connected)) disposeRoom(room);
  }, ABANDONED_ROOM_MS);
  room.cleanupTimer.unref();
}
function closeStartedRoom(room) {
  for (const player of room.players) {
    const participant = player.socketId && io.sockets.sockets.get(player.socketId);
    if (participant) {
      participant.emit("room:closed", { message: "Partija je završena jer je igrač napustio sobu." });
      participant.leave(room.code);
    }
  }
  disposeRoom(room);
}

io.use((socket, next) => {
  const key = socket.conn.remoteAddress || "unknown";
  const peers = [...io.sockets.sockets.values()].filter(peer => peer.conn.remoteAddress === socket.conn.remoteAddress);
  if (io.sockets.sockets.size >= limits.connections || peers.length >= limits.connectionsPerIp) return next(new Error("Previše otvorenih veza."));
  next();
});
io.on("connection", socket => {
  const ip = socket.conn.remoteAddress || "unknown";
  socket.use((packet, next) => {
    if (!rates.consume("event:" + socket.id, limits.events) || !rates.consume("ip-events:" + ip, 1200)) {
      emitError(socket, "Previše zahteva. Pokušaj kasnije.");
      return;
    }
    next();
  });
  socket.once("disconnect", () => rates.buckets.delete("event:" + socket.id));
  socket.on("room:create", payload => {
    if (!rates.consume("create:" + ip, 10)) return emitError(socket, "Previše zahteva. Pokušaj kasnije.");
    if (rooms.size >= limits.rooms) return emitError(socket, "Sve sobe su zauzete. Pokušaj kasnije.");
    if (getRoomBySocket(socket.id)) return emitError(socket, "Već ste u sobi.");
    const { name = "Igrač 1", config = {} } = fields(payload);
    if (typeof name !== "string") return emitError(socket, "Ime igrača mora biti tekst.");
    const columns = normalizeColumnIds(config?.columns);
    const { player, token } = createPlayer(name, socket.id);
    const room = {
      code: createCode(),
      createdAt: Date.now(),
      turnId: randomBytes(16).toString("hex"),
      hostId: player.id,
      started: false,
      config: { columns },
      players: [player],
      currentPlayerId: player.id,
      rolls: 0,
      dice: [],
      selection: [],
      contraTargetRow: null,
      turnHistory: [],
      cleanupTimer: null
    };
    rooms.set(room.code, room);
    sessions.set(player.tokenHash, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);
    socket.emit("room:created", { roomCode: room.code, playerId: player.id, sessionToken: token });
    broadcast(room);
  });

  socket.on("room:join", payload => {
    if (getRoomBySocket(socket.id)) return emitError(socket, "Već ste u sobi.");
    const { roomCode, name } = fields(payload);
    if (typeof roomCode !== "string") return emitError(socket, "Kod sobe mora biti tekst.");
    if (name !== undefined && typeof name !== "string") return emitError(socket, "Ime igrača mora biti tekst.");
    const room = rooms.get(roomCode.trim().toUpperCase());
    if (!room) return emitError(socket, "Soba ne postoji.");
    if (room.started) return emitError(socket, "Partija je već počela.");
    if (room.players.length >= MAX_PLAYERS) return emitError(socket, "Soba je puna.");

    const { player, token } = createPlayer(name || `Igrač ${room.players.length + 1}`, socket.id);
    room.players.push(player);
    sessions.set(player.tokenHash, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);
    socket.emit("room:joined", { roomCode: room.code, playerId: player.id, sessionToken: token });
    broadcast(room);
  });

  socket.on("room:leave", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player) return socket.emit("room:left");
    if (room.started) return closeStartedRoom(room);
    sessions.delete(player.tokenHash);
    room.players = room.players.filter(member => member.id !== player.id);
    socket.leave(room.code);
    socket.emit("room:left");
    if (!room.players.length) return disposeRoom(room);
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    room.currentPlayerId = room.hostId;
    broadcast(room);
  });

  socket.on("room:start", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player) return;
    if (room.hostId !== player.id) return emitError(socket, "Samo host može pokrenuti partiju.");
    if (room.players.length < MIN_PLAYERS) return emitError(socket, "Potrebna su najmanje 2 igrača.");
    if (room.players.some(p => !p.connected)) return emitError(socket, "Svi igrači moraju biti povezani pre početka partije.");
    if (room.started) return;
    room.started = true;
    room.turnId = randomBytes(16).toString("hex");
    room.currentPlayerId = room.players[0].id;
    room.rolls = 0;
    room.dice = [];
    room.selection = [];
    room.contraTargetRow = null;
    room.turnHistory = [];
    for (const p of room.players) p.announcedRow = null;
    broadcast(room);
  });

  socket.on("turn:roll", payload => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (isGameOver(room)) return emitError(socket, "Partija je završena.");
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (room.rolls >= maxRollsForTurn(room, player)) return emitError(socket, "Dostignut je maksimalan broj bacanja za ovaj potez.");
    const invalid = validateTurnCommand(room, player, payload);
    if (invalid) return emitError(socket, invalid);

    const fresh = makeDice();
    if (room.rolls === 0) room.dice = fresh;
    else room.dice = room.dice.map((value, i) => room.selection.includes(i) ? value : fresh[i]);

    room.rolls++;
    broadcast(room);
  });

  socket.on("turn:select", payload => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || room.currentPlayerId !== player.id) return;
    if (room.rolls === 0) return emitError(socket, "Prvo bacite kockice.");
    const invalid = validateTurnCommand(room, player, payload);
    if (invalid) return emitError(socket, invalid);
    const indices = payload?.indices === undefined ? [] : payload.indices;
    if (!Array.isArray(indices)) return emitError(socket, "Izbor kockica mora biti lista indeksa.");
    const clean = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < 6);
    if (clean.length > 5) return emitError(socket, "Najviše 5 kockica možete zadržati.");
    room.selection = clean;
    broadcast(room);
  });

  socket.on("turn:announce", payload => {
    const { row } = fields(payload);
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (!room.config.columns.includes("announced")) return emitError(socket, "Kolona Najava nije uključena.");
    if (room.contraTargetRow && room.config.columns.includes("contra")) return emitError(socket, "Morate odigrati polje u koloni Dirigovano.");
    if (room.rolls !== 1) return emitError(socket, "Najavu možete postaviti samo posle prvog bacanja.");
    if (player.announcedRow) return emitError(socket, "Najava za ovaj potez je već postavljena.");
    const invalid = validateTurnCommand(room, player, payload);
    if (invalid) return emitError(socket, invalid);
    if (!SCORE_ROWS.includes(row) || !emptyCell(player, "announced", row)) return emitError(socket, "Izabrano polje za Najavu nije dostupno.");
    if (room.config.columns.includes("contra")) {
      const idx = room.players.findIndex(p => p.id === player.id);
      const next = room.players[(idx + 1) % room.players.length];
      if (!emptyCell(next, "contra", row)) return emitError(socket, "Protivnik je već iskoristio to polje u koloni Dirigovano.");
    }
    player.announcedRow = row;
    broadcast(room);
  });

  socket.on("turn:commit", payload => {
    const { columnId, row, crossOut = false } = fields(payload);
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (isGameOver(room)) return emitError(socket, "Partija je završena.");
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (room.rolls === 0) return emitError(socket, "Potez još nije bačen.");
    const invalid = validateTurnCommand(room, player, payload);
    if (invalid) return emitError(socket, invalid);
    const isCrossOut = crossOut === true;
    if (room.contraTargetRow && room.config.columns.includes("contra") && (columnId !== "contra" || row !== room.contraTargetRow)) return emitError(socket, "Morate odigrati protivnikovo najavljeno polje u koloni Dirigovano.");
    const announcedFull = room.config.columns.includes("announced") && SCORE_ROWS.every(scoreRow => !emptyCell(player, "announced", scoreRow));
    if (!room.contraTargetRow && columnId === "contra" && room.config.columns.includes("contra") && !announcedFull && !isCrossOut) return emitError(socket, "Nema najave protivnika za Kontra najavu.");
    if (player.announcedRow && (columnId !== "announced" || row !== player.announcedRow)) return emitError(socket, "Morate odigrati najavljeno polje.");
    if (!player.announcedRow && columnId === "announced" && room.config.columns.includes("announced") && !isCrossOut) return emitError(socket, "Najavu možete odigrati samo ako ste je postavili posle prvog bacanja.");
    if (!isCrossOut && (room.selection.length < 1 || room.selection.length > 5)) return emitError(socket, "Izaberite od 1 do 5 kockica ili precrtajte polje.");

    const selectedValues = room.selection.map(i => room.dice[i]);
    if (columnId === "o" && !requiredColumnReady(room, player)) return emitError(socket, "Kolona O se otključava kada se popune prethodne kolone.");
    if (columnId === "r" && room.rolls !== 1) return emitError(socket, "Ručna kolona se popunjava posle prvog bacanja.");
    if (columnId === "n" && !frontierRows(columnId, player).includes(row)) return emitError(socket, "Kolona mora pratiti otvoreni redosled.");
    const result = calculateEntry(room, player, columnId, row, selectedValues, isCrossOut);
    if (!result.ok) return emitError(socket, result.error);

    player.cells[key(columnId, row)] = result.value;
    if (isCrossOut) player.crossedCells.push(key(columnId, row));

    const totals = {};
    for (const col of room.config.columns) {
      const sums = calculateColumnSums(player.cells, col);
      for (const [row, value] of Object.entries(sums)) totals[key(col, row)] = value;
    }
    for (const [k, v] of Object.entries(totals)) player.cells[k] = v;

    room.turnHistory.push({playerId:player.id,columnId,row,value:result.value,crossOut:isCrossOut});
    if (room.turnHistory.length > 12) room.turnHistory.shift();
    room.contraTargetRow = room.config.columns.includes("contra") ? (player.announcedRow || null) : null;
    player.announcedRow = null;
    const idx = room.players.findIndex(p => p.id === player.id);
    room.currentPlayerId = room.players[(idx + 1) % room.players.length].id;
    room.turnId = randomBytes(16).toString("hex");
    room.rolls = 0;
    room.dice = [];
    room.selection = [];
    broadcast(room);
  });

  socket.on("turn:undo", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    emitError(socket, "Vraćanje poteza nije dostupno u online partiji.");
  });

  socket.on("room:resume", payload => {
    const { sessionToken: token } = fields(payload);
    const hash = tokenHash(token);
    const session = hash && sessions.get(hash);
    const currentRoom = getRoomBySocket(socket.id);
    if (currentRoom) {
      const currentPlayer = getPlayer(currentRoom, socket.id);
      if (session?.roomCode !== currentRoom.code || session?.playerId !== currentPlayer?.id) return emitError(socket, "Već ste u sobi.");
      socket.emit("room:resumed", { roomCode: currentRoom.code, playerId: currentPlayer.id, sessionToken: token });
      broadcast(currentRoom);
      return;
    }
    const room = session && rooms.get(session.roomCode);
    if (!room) return emitError(socket, "Sesija nije pronađena.");
    const player = room.players.find(p => p.id === session.playerId);
    if (!player) return emitError(socket, "Igrač nije pronađen.");
    const previousSocket = player.socketId && io.sockets.sockets.get(player.socketId);
    player.socketId = socket.id;
    player.connected = true;
    if (previousSocket && previousSocket.id !== socket.id) previousSocket.disconnect(true);
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
    socket.join(room.code);
    socket.emit("room:resumed", { roomCode: room.code, playerId: player.id, sessionToken: token });
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      broadcast(room);
      if (room.players.every(member => !member.connected)) scheduleRoomCleanup(room);
    }
  });
});

const sweep = setInterval(() => {
  rates.sweep();
  for (const room of rooms.values()) if (Date.now() - room.createdAt >= 24 * 60 * 60 * 1000) {
    for (const player of room.players) {
      const participant = player.socketId && io.sockets.sockets.get(player.socketId);
      participant?.emit("room:closed", { message: "Soba je zatvorena." });
      participant?.leave(room.code);
    }
    disposeRoom(room);
  }
}, 60000);
sweep.unref();
httpServer.requestTimeout = 15000;
httpServer.headersTimeout = 10000;
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Jumbo Dice server listening on ${PORT}`));

let shuttingDown = false;
function shutdownAndWipe(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sweep);
  console.log(`${signal}: brisanje aktivnih soba i sesija.`);
  wipeVolatileGameState();
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  io.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}
process.once("SIGTERM", () => shutdownAndWipe("SIGTERM"));
process.once("SIGINT", () => shutdownAndWipe("SIGINT"));

