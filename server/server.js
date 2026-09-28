import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { randomInt } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeColumnIds } from "../game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, "..");

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true, service: "jumbo-dice-server" }));
app.get("/", (_, res) => res.sendFile(path.join(publicRoot, "index.html")));
app.get("/app.js", (_, res) => res.sendFile(path.join(publicRoot, "app.js")));
app.get("/game.js", (_, res) => res.sendFile(path.join(publicRoot, "game.js")));
app.get("/styles.css", (_, res) => res.sendFile(path.join(publicRoot, "styles.css")));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = new Map();
const sessions = new Map();
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const COMBO_ROWS = ["KENTA", "TRILING", "FUL", "POKER", "YAMB"];
const TOP_ROWS = ["1", "2", "3", "4", "5", "6"];

function createCode() {
  let value;
  do value = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (rooms.has(value));
  return value;
}
function makeDice() { return Array.from({ length: 6 }, () => randomInt(1, 7)); }
function key(col, row) { return col + "::" + row; }
function sum(v) { return v.reduce((a, b) => a + b, 0); }
function counts(v) { return v.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {}); }

const SCORE_ROWS = [...TOP_ROWS, "MAX", "MIN", ...COMBO_ROWS];
function analyse(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 5) return null;
  const c = counts(values);
  const freq = Object.values(c);
  const sorted = [...new Set(values)].sort((a, b) => a - b).join(",");
  const total = sum(values);
  return {
    total,
    counts: c,
    kenta: values.length === 5 && (sorted === "1,2,3,4,5" || sorted === "2,3,4,5,6"),
    triling: freq.some(count => count >= 3),
    ful: values.length === 5 && freq.includes(3) && freq.includes(2),
    poker: freq.some(count => count >= 4),
    yamb: values.length === 5 && freq.includes(5)
  };
}
function combinationScore(row, values, { rolls = 3, manual = false } = {}) {
  const a = analyse(values);
  if (!a) return null;
  if (row === "KENTA") return a.kenta ? (manual ? 66 : rolls === 1 ? 66 : rolls === 2 ? 56 : 46) : null;
  if (row === "TRILING") return a.triling ? a.total + 20 : null;
  if (row === "FUL") return a.ful ? a.total + 30 : null;
  if (row === "POKER") {
    if (!a.poker) return null;
    const fourCount = Object.values(a.counts).find(count => count >= 4);
    const face = Number(Object.keys(a.counts).find(value => a.counts[value] === fourCount));
    return face * 4 + 40;
  }
  if (row === "YAMB") return a.yamb ? a.total + 50 : null;
  return null;
}
function upperScore(values, face) { return values.filter(x => x === face).reduce((a, b) => a + b, 0); }
function columnRows(colId) {
  if (colId === "up" || colId === "down" || colId === "r" || colId === "n") {
    return [...TOP_ROWS, "SUM_TOP", "MAX", "MIN", "SUM_MID", ...COMBO_ROWS, "SUM_TOTAL"];
  }
  if (["free", "announced", "contra", "r", "n", "o", "m"].includes(colId)) {
    return [...TOP_ROWS, "SUM_TOP", "MAX", "MIN", "SUM_MID", ...COMBO_ROWS, "SUM_TOTAL"];
  }
  return [];
}
function emptyCell(player, col, row) { return player.cells[key(col, row)] === undefined; }
function validColumn(config, id) { return config.columns.includes(id); }
function frontierRows(col, player) {
  if (col === "down") return SCORE_ROWS.find(row => emptyCell(player, col, row)) ? [SCORE_ROWS.find(row => emptyCell(player, col, row))] : [];
  if (col === "up") {
    const row = [...SCORE_ROWS].reverse().find(item => emptyCell(player, col, item));
    return row ? [row] : [];
  }
  const directions = {
    n: [SCORE_ROWS, [...SCORE_ROWS].reverse()]
  }[col];
  if (!directions) return [];
  return [...new Set(directions.map(rows => rows.find(row => emptyCell(player, col, row))).filter(Boolean))];
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
  if (!columnRows(col).includes(row)) return { ok: false, error: "Red nije dozvoljen." };
  if (!emptyCell(player, col, row)) return { ok: false, error: "Polje je već iskorišćeno." };

  if (col === "up" && row !== frontierRows("up", player)[0]) return { ok: false, error: "Gore kolona mora pratiti redosled." };
  if (col === "down" && row !== frontierRows("down", player)[0]) return { ok: false, error: "Dole kolona mora pratiti redosled." };
  if (col === "n" && !frontierRows(col, player).includes(row)) return { ok: false, error: "Kolona mora pratiti otvoreni redosled." };
  if (col === "o" && !requiredColumnReady(room, player)) return { ok: false, error: "Kolona O se otključava kada se popune prethodne kolone." };
  if (col === "r" && room.rolls !== 1) return { ok: false, error: "Ručna kolona se popunjava posle prvog bacanja." };
  if (col === "m") return { ok: false, error: "Kolona M se izračunava iz prethodnih kolona." };

  const scoreable = TOP_ROWS.includes(row) || row === "MAX" || row === "MIN" || COMBO_ROWS.includes(row);
  if (crossOut) return scoreable ? { ok: true, value: 0 } : { ok: false, error: "Zbirna polja ne mogu da se precrtaju." };
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 5 || !selected.every(value => Number.isInteger(value) && value >= 1 && value <= 6)) {
    return { ok: false, error: "Izaberite od 1 do 5 važećih kockica." };
  }

  let value = null;
  if (TOP_ROWS.includes(row)) value = upperScore(selected, Number(row));
  else if (row === "MAX" || row === "MIN") value = sum(selected);
  else if (COMBO_ROWS.includes(row)) {
    value = combinationScore(row, selected, { rolls: room.rolls, manual: col === "r" });
    if (value === null) return { ok: false, error: "Izabrane kockice ne ispunjavaju uslov za ovu kombinaciju." };
  }
  return { ok: true, value };
}
function updateSequence(player, col, row) {
  const rows = columnRows(col).filter(r => !["SUM_TOP", "SUM_MID", "SUM_TOTAL"].includes(r));
  if (col === "up") player.nextUpRow = rows[rows.indexOf(row) - 1];
  if (col === "down") player.nextDownRow = rows[rows.indexOf(row) + 1];
}
function captureTurnState(room){
  return {
    players: room.players.map(player => ({
      cells: { ...player.cells },
      crossedCells: [...(player.crossedCells || [])],
      announcedRow: player.announcedRow || null
    })),
    currentPlayerId: room.currentPlayerId,
    rolls: room.rolls,
    dice: [...room.dice],
    selection: [...room.selection],
    contraTargetRow: room.contraTargetRow
  };
}
function restoreTurnState(room, snapshot){
  snapshot.players.forEach((saved, index) => {
    const player = room.players[index];
    if (!player) return;
    player.cells = { ...saved.cells };
    player.crossedCells = [...saved.crossedCells];
    player.announcedRow = saved.announcedRow;
  });
  room.currentPlayerId = snapshot.currentPlayerId;
  room.rolls = snapshot.rolls;
  room.dice = [...snapshot.dice];
  room.selection = [...snapshot.selection];
  room.contraTargetRow = snapshot.contraTargetRow;
}

function updateMaximumColumn(room, player) {
  const maxIndex = room.config.columns.indexOf("m");
  if (maxIndex < 0) return;
  const sources = room.config.columns.slice(0, maxIndex);
  const firstSix = sources.slice(0, 6);
  for (const row of SCORE_ROWS) {
    if (!emptyCell(player, "m", row)) continue;
    if (!sources.length || !sources.every(col => !emptyCell(player, col, row))) continue;
    const isCrossed = firstSix.some(col => (player.crossedCells || []).includes(key(col, row)));
    const value = isCrossed ? 0 : Math.max(...sources.map(col => Number(player.cells[key(col, row)] || 0)));
    player.cells[key("m", row)] = value;
    if (isCrossed) player.crossedCells.push(key("m", row));
  }
}
function sumVisibleCells(player, col, group) {
  const rows = group === "top" ? TOP_ROWS : COMBO_ROWS;
  const total = rows.reduce((acc, row) => acc + Number(player.cells[key(col, row)] || 0), 0);
  return group === "top" && total >= 60 ? total + 30 : total;
}
function maxRollsForTurn(room, player) {
  let remaining = 0;
  for (const col of room.config.columns) {
    if (col === "m") continue;
    for (const row of SCORE_ROWS) if (emptyCell(player, col, row)) remaining++;
  }
  return remaining === 1 ? 5 : 3;
}
function isGameOver(room) {
  return room.started && room.players.length > 0 && room.players.every(player =>
    room.config.columns.every(col => columnRows(col)
      .filter(row => !["SUM_TOP", "SUM_MID", "SUM_TOTAL"].includes(row))
      .every(row => !emptyCell(player, col, row)))
  );
}
function buildPublicCells(player, viewerId, gameOver) {
  const isSelf = player.id === viewerId;
  const result = {};
  for (const [k, v] of Object.entries(player.cells)) {
    if (gameOver) result[k] = v;
    else if (k.includes("SUM_TOTAL")) continue;
    else if (isSelf || (!k.includes("SUM_TOP") && !k.includes("SUM_MID"))) result[k] = v;
  }
  return result;
}
function publicState(room, viewerId) {
  const viewer = room.players.find(p => p.id === viewerId);
  const gameOver = isGameOver(room);
  return {
    roomCode: room.code,
    started: room.started,
    gameOver,
    hostId: room.hostId,
    currentPlayerId: room.currentPlayerId,
    rolls: room.currentPlayerId === viewerId ? room.rolls : 0,
    maxRolls: room.currentPlayerId === viewerId && viewer ? maxRollsForTurn(room, viewer) : 3,
    dice: room.currentPlayerId === viewerId ? room.dice : [],
    selection: room.currentPlayerId === viewerId ? room.selection : [],
    announcedRow: viewer?.announcedRow || null,
    contraTargetRow: room.currentPlayerId === viewerId ? room.contraTargetRow : null,
    canUndo: room.history.length > 0,
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
function sessionToken() { return randomInt(100000000, 999999999).toString(36) + Date.now().toString(36); }

io.on("connection", socket => {
  socket.on("room:create", ({ name = "Igrač 1", config = {} } = {}) => {
    const columns = normalizeColumnIds(config?.columns);
    const player = {
      id: randomInt(100000, 999999999).toString(),
      name: String(name).slice(0, 24),
      socketId: socket.id,
      connected: true,
      ready: true,
      cells: {},
      crossedCells: [],
      announcedRow: null,
      token: sessionToken()
    };
    const room = {
      code: createCode(),
      hostId: player.id,
      started: false,
      config: { columns },
      players: [player],
      currentPlayerId: player.id,
      rolls: 0,
      dice: [],
      selection: [],
      contraTargetRow: null,
      history: []
    };
    rooms.set(room.code, room);
    sessions.set(player.token, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);
    socket.emit("room:created", { roomCode: room.code, playerId: player.id, sessionToken: player.token });
    broadcast(room);
  });

  socket.on("room:join", ({ roomCode, name } = {}) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room) return emitError(socket, "Soba ne postoji.");
    if (room.started) return emitError(socket, "Partija je već počela.");
    if (room.players.length >= MAX_PLAYERS) return emitError(socket, "Soba je puna.");

    const player = {
      id: randomInt(100000, 999999999).toString(),
      name: String(name || `Igrač ${room.players.length + 1}`).slice(0, 24),
      socketId: socket.id,
      connected: true,
      ready: true,
      cells: {},
      crossedCells: [],
      announcedRow: null,
      token: sessionToken()
    };
    room.players.push(player);
    sessions.set(player.token, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);
    socket.emit("room:joined", { roomCode: room.code, playerId: player.id, sessionToken: player.token });
    broadcast(room);
  });

  socket.on("room:start", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player) return;
    if (room.hostId !== player.id) return emitError(socket, "Samo host može pokrenuti partiju.");
    if (room.players.length < MIN_PLAYERS) return emitError(socket, "Potrebna su najmanje 2 igrača.");
    if (room.started) return;
    room.started = true;
    room.currentPlayerId = room.players[0].id;
    room.rolls = 0;
    room.dice = [];
    room.selection = [];
    room.contraTargetRow = null;
    room.history = [];
    for (const p of room.players) p.announcedRow = null;
    broadcast(room);
  });

  socket.on("turn:roll", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (isGameOver(room)) return emitError(socket, "Partija je završena.");
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (room.rolls >= maxRollsForTurn(room, player)) return emitError(socket, "Dostignut je maksimalan broj bacanja za ovaj potez.");

    const fresh = makeDice();
    if (room.rolls === 0) room.dice = fresh;
    else room.dice = room.dice.map((value, i) => room.selection.includes(i) ? value : fresh[i]);

    room.rolls++;
    room.selection = [];
    broadcast(room);
  });

  socket.on("turn:select", ({ indices = [] } = {}) => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || room.currentPlayerId !== player.id) return;
    if (room.rolls === 0) return emitError(socket, "Prvo bacite kockice.");
    const clean = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < 6);
    if (clean.length > 5) return emitError(socket, "Najviše 5 kockica možete zadržati.");
    room.selection = clean;
    broadcast(room);
  });

  socket.on("turn:announce", ({ row } = {}) => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (!room.config.columns.includes("announced")) return emitError(socket, "Kolona Najava nije uključena.");
    if (room.contraTargetRow && room.config.columns.includes("contra")) return emitError(socket, "Morate odigrati polje u koloni Dirigovano.");
    if (room.rolls !== 1) return emitError(socket, "Najavu možete postaviti samo posle prvog bacanja.");
    if (player.announcedRow) return emitError(socket, "Najava za ovaj potez je već postavljena.");
    const scoreRows = [...TOP_ROWS, "MAX", "MIN", ...COMBO_ROWS];
    if (!scoreRows.includes(row) || !emptyCell(player, "announced", row)) return emitError(socket, "Izabrano polje za Najavu nije dostupno.");
    if (room.config.columns.includes("contra")) {
      const idx = room.players.findIndex(p => p.id === player.id);
      const next = room.players[(idx + 1) % room.players.length];
      if (!emptyCell(next, "contra", row)) return emitError(socket, "Protivnik je već iskoristio to polje u koloni Dirigovano.");
    }
    player.announcedRow = row;
    broadcast(room);
  });

  socket.on("turn:commit", ({ columnId, row, crossOut = false } = {}) => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (isGameOver(room)) return emitError(socket, "Partija je završena.");
    if (room.currentPlayerId !== player.id) return emitError(socket, "Nije vaš potez.");
    if (room.rolls === 0) return emitError(socket, "Potez još nije bačen.");
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
    if (columnId === "m") return emitError(socket, "Kolona M se izračunava iz prethodnih kolona.");
    if (["r", "n"].includes(columnId) && !frontierRows(columnId, player).includes(row)) return emitError(socket, "Kolona mora pratiti otvoreni redosled.");
    const result = calculateEntry(room, player, columnId, row, selectedValues, isCrossOut);
    if (!result.ok) return emitError(socket, result.error);

    room.history.push(captureTurnState(room));
    if (room.history.length > 50) room.history.shift();
    player.cells[key(columnId, row)] = result.value;
    if (isCrossOut) player.crossedCells.push(key(columnId, row));
    updateSequence(player, columnId, row);
    updateMaximumColumn(room, player);

    const totals = {};
    for (const col of room.config.columns) {
      totals[key(col, "SUM_TOP")] = sumVisibleCells(player, col, "top");
      totals[key(col, "SUM_MID")] = sumVisibleCells(player, col, "combo");
      totals[key(col, "SUM_TOTAL")] = totals[key(col, "SUM_TOP")] + totals[key(col, "SUM_MID")] + Number(player.cells[key(col, "MAX")] || 0) - Number(player.cells[key(col, "MIN")] || 0);
    }
    for (const [k, v] of Object.entries(totals)) player.cells[k] = v;

    room.contraTargetRow = room.config.columns.includes("contra") ? (player.announcedRow || null) : null;
    player.announcedRow = null;
    const idx = room.players.findIndex(p => p.id === player.id);
    room.currentPlayerId = room.players[(idx + 1) % room.players.length].id;
    room.rolls = 0;
    room.dice = [];
    room.selection = [];
    broadcast(room);
  });

  socket.on("turn:undo", () => {
    const room = getRoomBySocket(socket.id);
    const player = getPlayer(room, socket.id);
    if (!room || !player || !room.started) return;
    if (room.hostId !== player.id) return emitError(socket, "Samo domaćin može da vrati poslednji potez.");
    const snapshot = room.history.pop();
    if (!snapshot) return emitError(socket, "Nema poteza koji može da se vrati.");
    restoreTurnState(room, snapshot);
    broadcast(room);
  });

  socket.on("room:resume", ({ sessionToken: token } = {}) => {
    const session = sessions.get(token);
    const room = session && rooms.get(session.roomCode);
    if (!room) return emitError(socket, "Sesija nije pronađena.");
    const player = room.players.find(p => p.id === session.playerId);
    if (!player) return emitError(socket, "Igrač nije pronađen.");
    player.socketId = socket.id;
    player.connected = true;
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
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Jumbo Dice server listening on ${PORT}`));
