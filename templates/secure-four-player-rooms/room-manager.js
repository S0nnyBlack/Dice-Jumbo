import { createHash, randomBytes, randomInt } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const DEFAULTS = Object.freeze({
  maxRooms: 500,
  disconnectedIdleMs: 30 * 60_000,
  maxRoomAgeMs: 24 * 60 * 60_000,
  finishedRetentionMs: 60 * 60_000,
  requestHistory: 32,
  maxPayloadBytes: 4096
});

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new RoomError(code, message); };
const hashToken = token => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const newPlayerId = () => randomBytes(16).toString("hex");
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function safeJson(value, maxBytes) {
  if (!plainObject(value)) fail("INVALID_PAYLOAD", "Expected a JSON object.");
  const seen = new Set();
  function visit(item, depth) {
    if (depth > 8) fail("INVALID_PAYLOAD", "Payload is too deeply nested.");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      if (seen.has(item)) fail("INVALID_PAYLOAD", "Circular payload.");
      seen.add(item);
      item.forEach(child => visit(child, depth + 1));
      seen.delete(item);
      return;
    }
    if (!plainObject(item) || seen.has(item)) fail("INVALID_PAYLOAD", "Invalid JSON value.");
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail("INVALID_PAYLOAD", "Reserved payload key.");
      visit(child, depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) fail("PAYLOAD_TOO_LARGE", "Payload is too large.");
  return structuredClone(value);
}

function cleanName(name) {
  if (typeof name !== "string") fail("INVALID_NAME", "Name must be text.");
  const result = name.normalize("NFKC").trim();
  if (result.length < 1 || [...result].length > 24 || /[\p{Cc}\p{Cf}]/u.test(result)) {
    fail("INVALID_NAME", "Name must contain 1–24 visible characters.");
  }
  return result;
}

function cleanClientKey(key) {
  if (typeof key !== "string" || !key || key.length > 128) fail("INVALID_CLIENT", "A server-derived client key is required.");
  return key;
}

function cleanConnectionId(id) {
  if (typeof id !== "string" || !id || id.length > 128) fail("INVALID_CONNECTION", "A server-derived connection ID is required.");
  return id;
}

export class WindowRateLimiter {
  constructor({ now = Date.now, maxKeys = 10_000 } = {}) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }

  consume(key, action, limit, windowMs) {
    const id = `${action}:${key}`;
    const time = this.now();
    let bucket = this.buckets.get(id);
    if (!bucket || time >= bucket.until) {
      if (!bucket && this.buckets.size >= this.maxKeys) {
        for (const [entry, current] of this.buckets) if (time >= current.until) this.buckets.delete(entry);
        if (this.buckets.size >= this.maxKeys) fail("RATE_LIMITED", "Too many requests.");
      }
      bucket = { count: 0, until: time + windowMs };
      this.buckets.set(id, bucket);
    }
    if (++bucket.count > limit) fail("RATE_LIMITED", "Too many requests.");
  }
}

export class RoomManager {
  constructor({ game, now = Date.now, limits = {}, rateLimiter } = {}) {
    if (!game || typeof game.create !== "function" || typeof game.apply !== "function" || typeof game.publicState !== "function") {
      throw new TypeError("A game adapter with create, apply, and publicState is required.");
    }
    this.game = game;
    this.now = now;
    this.limits = { ...DEFAULTS, ...limits };
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Room limits must be positive safe integers.");
    }
    this.rateLimiter = rateLimiter || new WindowRateLimiter({ now });
    this.rooms = new Map();
    this.tokens = new Map();
    this.connections = new Map();
  }

  #code() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!this.rooms.has(code)) return code;
    }
    fail("CAPACITY", "Could not allocate a room code.");
  }

  #unbound(connectionId) {
    cleanConnectionId(connectionId);
    if (this.connections.has(connectionId)) fail("ALREADY_BOUND", "Connection already belongs to a room.");
  }

  #player(room, name, clientKey, connectionId) {
    const id = newPlayerId();
    const token = newToken();
    const player = { id, name, tokenHash: hashToken(token), connectionId, clientKey, connected: true };
    room.players.push(player);
    this.tokens.set(player.tokenHash, { code: room.code, playerId: id });
    this.connections.set(connectionId, { code: room.code, playerId: id });
    return { player, token };
  }

  #bound(connectionId) {
    this.sweep();
    cleanConnectionId(connectionId);
    const binding = this.connections.get(connectionId);
    const room = binding && this.rooms.get(binding.code);
    const player = room?.players.find(item => item.id === binding.playerId && item.connectionId === connectionId);
    if (!player) fail("UNAUTHORIZED", "Connection is not a room participant.");
    return { room, player };
  }

  #publicPlayers(room) {
    return room.players.map((player, seat) => ({ id: player.id, name: player.name, seat, connected: player.connected }));
  }

  #snapshot(room, player) {
    const players = this.#publicPlayers(room);
    const game = this.game.publicState(structuredClone(room.state), { viewerId: player.id, seat: players.findIndex(p => p.id === player.id), players });
    if (!plainObject(game)) throw new TypeError("game.publicState must return a plain object.");
    return structuredClone({ code: room.code, phase: room.finished ? "finished" : room.started ? "playing" : "lobby", revision: room.revision,
      hostId: room.hostId, selfId: player.id, players, game });
  }

  #receipt(room, player, requestId, expectedRevision, payload) {
    if (typeof requestId !== "string" || !REQUEST_PATTERN.test(requestId)) fail("INVALID_REQUEST_ID", "Use a unique request ID.");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail("INVALID_REVISION", "A valid revision is required.");
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const previous = room.requests.get(player.id)?.get(requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail("REQUEST_ID_REUSED", "Request ID was reused with different data.");
      return { replay: true, value: previous.value };
    }
    if (room.revision !== expectedRevision) fail("STALE_REVISION", "Room state has changed; sync before retrying.");
    return { replay: false, fingerprint };
  }

  #record(room, player, requestId, fingerprint, value) {
    let requests = room.requests.get(player.id);
    if (!requests) { requests = new Map(); room.requests.set(player.id, requests); }
    requests.set(requestId, { fingerprint, value });
    while (requests.size > this.limits.requestHistory) requests.delete(requests.keys().next().value);
  }

  create({ name, config = {}, clientKey, connectionId } = {}) {
    this.#unbound(connectionId);
    cleanClientKey(clientKey);
    this.rateLimiter.consume(clientKey, "create", 5, 60_000);
    this.sweep();
    if (this.rooms.size >= this.limits.maxRooms) fail("CAPACITY", "Room capacity reached.");
    const cleanConfig = safeJson(config, this.limits.maxPayloadBytes);
    const cleanPlayerName = cleanName(name);
    const state = this.game.create(cleanConfig);
    if (!plainObject(state)) throw new TypeError("game.create must return a plain object.");
    const time = this.now();
    const room = { code: this.#code(), players: [], hostId: null, state: structuredClone(state), revision: 0, started: false,
      finished: false, finishedAt: null, createdAt: time, touchedAt: time, requests: new Map() };
    const { player, token } = this.#player(room, cleanPlayerName, clientKey, connectionId);
    room.hostId = player.id;
    this.rooms.set(room.code, room);
    return { code: room.code, playerId: player.id, token, state: this.#snapshot(room, player) };
  }

  join({ code, name, clientKey, connectionId } = {}) {
    this.#unbound(connectionId);
    cleanClientKey(clientKey);
    this.rateLimiter.consume(clientKey, "join", 20, 60_000);
    this.sweep();
    const room = typeof code === "string" && CODE_PATTERN.test(code) ? this.rooms.get(code) : null;
    if (!room || room.started || room.players.length >= 4) fail("ROOM_UNAVAILABLE", "Room is unavailable.");
    const cleanPlayerName = cleanName(name);
    const draft = structuredClone(room.state);
    const seat = room.players.length;
    const id = newPlayerId();
    if (this.game.join) this.game.join(draft, { playerId: id, seat, name: cleanPlayerName });
    const token = newToken();
    const player = { id, name: cleanPlayerName, tokenHash: hashToken(token), connectionId, clientKey, connected: true };
    room.state = draft;
    room.players.push(player);
    room.revision++;
    room.touchedAt = this.now();
    this.tokens.set(player.tokenHash, { code: room.code, playerId: id });
    this.connections.set(connectionId, { code: room.code, playerId: id });
    return { code: room.code, playerId: id, token, state: this.#snapshot(room, player) };
  }

  resume({ token, clientKey, connectionId } = {}) {
    this.#unbound(connectionId);
    cleanClientKey(clientKey);
    this.rateLimiter.consume(clientKey, "resume", 30, 60_000);
    this.sweep();
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) fail("UNAUTHORIZED", "Invalid session.");
    const binding = this.tokens.get(hashToken(token));
    const room = binding && this.rooms.get(binding.code);
    const player = room?.players.find(item => item.id === binding.playerId);
    if (!player || player.tokenHash !== hashToken(token)) fail("UNAUTHORIZED", "Invalid session.");
    const previousConnectionId = player.connectionId;
    if (previousConnectionId) this.connections.delete(previousConnectionId);
    player.connectionId = connectionId;
    player.clientKey = clientKey;
    player.connected = true;
    room.revision++;
    room.touchedAt = this.now();
    this.connections.set(connectionId, { code: room.code, playerId: player.id });
    return { code: room.code, playerId: player.id, previousConnectionId, state: this.#snapshot(room, player) };
  }

  start({ connectionId, requestId, expectedRevision } = {}) {
    const { room, player } = this.#bound(connectionId);
    this.rateLimiter.consume(player.clientKey, "command", 120, 60_000);
    const receipt = this.#receipt(room, player, requestId, expectedRevision, { type: "start", expectedRevision });
    if (receipt.replay) return { ...receipt.value, replay: true };
    if (room.started) fail("ALREADY_STARTED", "Game has already started.");
    if (room.hostId !== player.id) fail("FORBIDDEN", "Only the host can start the game.");
    if (room.players.length < 2 || room.players.some(item => !item.connected)) fail("NOT_READY", "Two to four connected players are required.");
    const draft = structuredClone(room.state);
    if (this.game.start) this.game.start(draft, { players: this.#publicPlayers(room) });
    room.state = draft;
    room.started = true;
    room.revision++;
    room.touchedAt = this.now();
    const value = { revision: room.revision };
    this.#record(room, player, requestId, receipt.fingerprint, value);
    return value;
  }

  command({ connectionId, requestId, expectedRevision, command } = {}) {
    const { room, player } = this.#bound(connectionId);
    this.rateLimiter.consume(player.clientKey, "command", 120, 60_000);
    const cleanCommand = safeJson(command, this.limits.maxPayloadBytes);
    const receipt = this.#receipt(room, player, requestId, expectedRevision, { type: "command", expectedRevision, command: cleanCommand });
    if (receipt.replay) return { ...receipt.value, replay: true };
    if (!room.started || room.finished) fail("NOT_PLAYING", "Game is not accepting moves.");
    const draft = structuredClone(room.state);
    const outcome = this.game.apply(draft, { actorId: player.id, seat: room.players.indexOf(player), command: cleanCommand,
      players: this.#publicPlayers(room) });
    if (outcome !== undefined && !plainObject(outcome)) throw new TypeError("game.apply must return an object or undefined.");
    room.state = draft;
    room.revision++;
    room.touchedAt = this.now();
    if (outcome?.finished === true) { room.finished = true; room.finishedAt = this.now(); }
    const value = { revision: room.revision };
    this.#record(room, player, requestId, receipt.fingerprint, value);
    return value;
  }

  leaveLobby(connectionId) {
    const { room, player } = this.#bound(connectionId);
    if (room.started) fail("ACTIVE_GAME", "An active game needs a game-specific forfeit rule.");
    const seat = room.players.indexOf(player);
    const draft = structuredClone(room.state);
    if (this.game.leave) this.game.leave(draft, { playerId: player.id, seat });
    room.state = draft;
    room.players.splice(seat, 1);
    this.tokens.delete(player.tokenHash);
    this.connections.delete(connectionId);
    room.requests.delete(player.id);
    if (!room.players.length) { this.rooms.delete(room.code); return { closed: true }; }
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    room.revision++;
    room.touchedAt = this.now();
    return { closed: false, code: room.code };
  }

  disconnect(connectionId) {
    const binding = this.connections.get(connectionId);
    if (!binding) return false;
    this.connections.delete(connectionId);
    const room = this.rooms.get(binding.code);
    const player = room?.players.find(item => item.id === binding.playerId);
    if (!player || player.connectionId !== connectionId) return false;
    player.connectionId = null;
    player.connected = false;
    room.revision++;
    room.touchedAt = this.now();
    return room.code;
  }

  snapshotForConnection(connectionId) {
    const { room, player } = this.#bound(connectionId);
    return this.#snapshot(room, player);
  }

  connectedViews(code) {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.players.filter(player => player.connected && player.connectionId)
      .map(player => ({ connectionId: player.connectionId, state: this.#snapshot(room, player) }));
  }

  #deleteRoom(room) {
    for (const player of room.players) {
      this.tokens.delete(player.tokenHash);
      if (player.connectionId) this.connections.delete(player.connectionId);
    }
    this.rooms.delete(room.code);
  }

  sweep() {
    const time = this.now();
    let removed = 0;
    for (const room of this.rooms.values()) {
      const expired = time - room.createdAt >= this.limits.maxRoomAgeMs ||
        (room.finished && time - room.finishedAt >= this.limits.finishedRetentionMs) ||
        (room.players.every(player => !player.connected) && time - room.touchedAt >= this.limits.disconnectedIdleMs);
      if (expired) { this.#deleteRoom(room); removed++; }
    }
    return removed;
  }

  stats() { return { rooms: this.rooms.size, connections: this.connections.size }; }
}

