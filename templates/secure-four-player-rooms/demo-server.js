import http from "node:http";
import { RoomManager } from "./room-manager.js";
import { createSecureRoomSocketServer } from "./socketio-adapter.js";
import { exampleGame } from "./example-game.js";

const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL || (process.env.NODE_ENV === "production" ? "" : `http://localhost:${port}/`);
if (!publicUrl) throw new Error("PUBLIC_URL is required in production.");

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.stats().rooms }));
    return;
  }
  response.writeHead(404).end("Not found");
});
const rooms = new RoomManager({ game: exampleGame });
const io = createSecureRoomSocketServer(server, rooms, {
  publicUrl,
  allowedOrigins: [new URL(publicUrl).origin]
});
const sweepTimer = setInterval(() => rooms.sweep(), 60_000);
sweepTimer.unref();
server.listen(port, "0.0.0.0", () => console.log(`Room template listening on ${port}`));

function shutdown() {
  clearInterval(sweepTimer);
  io.close(() => process.exit(0));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

