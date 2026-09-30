import { Server } from "socket.io";
import { RoomError, WindowRateLimiter } from "./room-manager.js";
import { buildRoomLink } from "./invite.js";

function originAllowed(origin, allowedOrigins, allowNoOrigin) {
  return origin ? allowedOrigins.includes(origin) : allowNoOrigin;
}

/**
 * The public origin list must be explicit. A browser's Origin header is not an
 * identity check; the 256-bit resume token still authorizes a returning seat.
 */
export function createSecureRoomSocketServer(httpServer, manager, {
  allowedOrigins,
  publicUrl,
  allowNoOrigin = false,
  clientKeyFromSocket = socket => socket.handshake.address,
  maxConnectionsPerClient = 16
} = {}) {
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length || allowedOrigins.some(origin => {
    try { return new URL(origin).origin !== origin; } catch { return true; }
  })) throw new TypeError("Explicit origin URLs are required.");
  if (!publicUrl || !allowedOrigins.includes(new URL(publicUrl).origin)) throw new TypeError("Public URL must use an allowed origin.");

  const io = new Server(httpServer, {
    maxHttpBufferSize: 8192,
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
    allowRequest: (request, done) => done(null, originAllowed(request.headers.origin, allowedOrigins, allowNoOrigin))
  });
  const connectionRate = new WindowRateLimiter();
  const activeConnections = new Map();

  function broadcast(code) {
    for (const { connectionId, state } of manager.connectedViews(code)) {
      io.sockets.sockets.get(connectionId)?.emit("room:state", state);
    }
  }

  function respond(ack, work) {
    const reply = typeof ack === "function" ? ack : () => {};
    try { reply({ ok: true, ...work() }); }
    catch (error) {
      const known = error instanceof RoomError;
      reply({ ok: false, error: { code: known ? error.code : "INTERNAL", message: known ? error.message : "Server error." } });
    }
  }

  io.use((socket, next) => {
    const key = clientKeyFromSocket(socket);
    try {
      if (!originAllowed(socket.handshake.headers.origin, allowedOrigins, allowNoOrigin)) throw new Error("Origin rejected.");
      if (typeof key !== "string" || !key || key.length > 128) throw new Error("Invalid client key.");
      connectionRate.consume(key, "connect", 30, 60_000);
      if ((activeConnections.get(key) || 0) >= maxConnectionsPerClient) throw new Error("Connection limit reached.");
      socket.data.roomClientKey = key;
      next();
    } catch { next(new Error("Connection rejected.")); }
  });

  io.on("connection", socket => {
    const key = socket.data.roomClientKey;
    activeConnections.set(key, (activeConnections.get(key) || 0) + 1);

    socket.on("room:create", (payload, ack) => respond(ack, () => {
      const result = manager.create({ name: payload?.name, config: payload?.config ?? {}, clientKey: key, connectionId: socket.id });
      broadcast(result.code);
      return { ...result, inviteUrl: buildRoomLink(publicUrl, result.code) };
    }));

    socket.on("room:join", (payload, ack) => respond(ack, () => {
      const result = manager.join({ code: payload?.code, name: payload?.name, clientKey: key, connectionId: socket.id });
      broadcast(result.code);
      return { ...result, inviteUrl: buildRoomLink(publicUrl, result.code) };
    }));

    socket.on("room:resume", (payload, ack) => respond(ack, () => {
      const result = manager.resume({ token: payload?.token, clientKey: key, connectionId: socket.id });
      if (result.previousConnectionId && result.previousConnectionId !== socket.id) {
        io.sockets.sockets.get(result.previousConnectionId)?.disconnect(true);
      }
      broadcast(result.code);
      return { code: result.code, playerId: result.playerId, state: result.state };
    }));

    socket.on("room:start", (payload, ack) => respond(ack, () => {
      const result = manager.start({ connectionId: socket.id, requestId: payload?.requestId, expectedRevision: payload?.expectedRevision });
      const code = manager.snapshotForConnection(socket.id).code;
      if (!result.replay) broadcast(code);
      return result;
    }));

    socket.on("room:command", (payload, ack) => respond(ack, () => {
      const result = manager.command({ connectionId: socket.id, requestId: payload?.requestId,
        expectedRevision: payload?.expectedRevision, command: payload?.command });
      const code = manager.snapshotForConnection(socket.id).code;
      if (!result.replay) broadcast(code);
      return result;
    }));

    socket.on("room:sync", ack => respond(ack, () => {
      connectionRate.consume(key, "sync", 60, 60_000);
      return { state: manager.snapshotForConnection(socket.id) };
    }));

    socket.on("room:leave", ack => respond(ack, () => {
      const result = manager.leaveLobby(socket.id);
      if (result.code) broadcast(result.code);
      return result;
    }));

    socket.on("disconnect", () => {
      const remaining = (activeConnections.get(key) || 1) - 1;
      if (remaining) activeConnections.set(key, remaining);
      else activeConnections.delete(key);
      const code = manager.disconnect(socket.id);
      if (code) broadcast(code);
    });
  });

  return io;
}

