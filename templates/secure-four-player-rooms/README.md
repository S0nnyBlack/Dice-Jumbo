# Secure four-player room template

Reusable, server-authoritative room foundation for games with **2–4 players**. This folder is intentionally separate from Jamb's production server. Copy it into a new game, replace `example-game.js`, and adapt the UI. It does not change a running game merely by existing on this branch.

## What the template provides

- Cryptographically generated 10-character room codes and 256-bit resume tokens. The room code is an invitation; the resume token is a private credential. Tokens are stored in the manager only as SHA-256 hashes and are never included in room broadcasts or links.
- Host-only start, exactly one connection bound to each seat, reconnect without losing the seat, lobby host transfer, and an explicit four-player cap.
- Server-controlled state transitions. The client sends an action, never an authoritative game state or a player ID. Game-specific rules run in `game.apply` on a draft; a rejected action cannot partially modify the stored game.
- Monotonic room revisions and client-generated request IDs. Replayed requests return their original acknowledgement without applying a move twice; requests based on an old revision are rejected.
- Per-viewer public state through `game.publicState`, so each game decides which private information a player may see.
- Bounds for payload size, connection and action rates, total rooms, idle rooms, and maximum room lifetime.
- An explicit allowed-origin list for browser connections. The Socket.IO adapter limits incoming messages to 8 KiB.
- A shareable link generated as soon as a room is created. The link contains the room code only.

## Start a new game

The template uses Node 20+ and Socket.IO 4. Run `npm install` and `npm test` in this folder after copying it into a new repository. `npm start` runs a small example server with a `/health` endpoint; it has no game UI. In the Dice-Jumbo repository, the root test job also discovers these tests.

```js
import http from "node:http";
import { RoomManager } from "./room-manager.js";
import { createSecureRoomSocketServer } from "./socketio-adapter.js";
import { exampleGame } from "./example-game.js";

const publicUrl = process.env.PUBLIC_URL; // for example, https://game.example/
if (!publicUrl) throw new Error("Set PUBLIC_URL");
const server = http.createServer(/* your static files and health endpoint */);
const rooms = new RoomManager({ game: exampleGame });
createSecureRoomSocketServer(server, rooms, {
  publicUrl,
  allowedOrigins: [new URL(publicUrl).origin]
});
const sweeper = setInterval(() => rooms.sweep(), 60_000);
sweeper.unref();
server.listen(process.env.PORT || 3000);
```

Replace `exampleGame` with an adapter containing:

- `create(config) → plain object`: validate game options and return initial game state.
- `join(stateDraft, { playerId, seat, name })` and `leave(stateDraft, { playerId, seat })`: optional lobby updates.
- `start(stateDraft, { players })`: optional start transition.
- `apply(stateDraft, { actorId, seat, command, players }) → { finished? }`: validate the move and update the draft. Throw `RoomError` for invalid moves. Never trust a client-provided seat, result, dice value, or turn number.
- `publicState(stateCopy, { viewerId, seat, players }) → plain object`: explicitly select fields visible to this player. Do not return secret hands, hidden totals, tokens, or internal IDs unless the game's rules allow them.

The hooks must be synchronous and free of external side effects. The manager uses a draft state to avoid partial changes, but it cannot roll back a database write or message sent inside a hook.

## Client protocol

Each event takes an acknowledgement callback. Success is `{ ok: true, ... }`; a rejected request is `{ ok: false, error: { code, message } }`.

| Event | Payload | Result |
| --- | --- | --- |
| `room:create` | `{ name, config }` | `{ code, token, inviteUrl, state }` |
| `room:join` | `{ code, name }` | `{ code, token, inviteUrl, state }` |
| `room:resume` | `{ token }` | Rebinds the seat and closes its former connection |
| `room:start` | `{ requestId, expectedRevision }` | Host starts a room with 2–4 connected players |
| `room:command` | `{ requestId, expectedRevision, command }` | Applies a game-specific action once |
| `room:sync` | No payload | Fresh personalized `state` |
| `room:leave` | No payload | Leaves a lobby; an active game needs a game-specific forfeit rule |
| `room:state` | Server event | New personalized snapshot after changes |

Generate `requestId` with `crypto.randomUUID()`. Use the latest `state.revision` as `expectedRevision`. On `STALE_REVISION`, call `room:sync` and let the player review the current legal move. Keep the resume token private; do not put it in a URL, screenshot, log, analytics event, or room state.

When `room:create` succeeds, show `code` for manual entry and provide one share button, **Kopiraj link sobe**, that copies `inviteUrl`. The recipient opens `?room=CODE`; `readRoomCode(location.search)` pre-fills the join field and the form has one clear **Pridruži se sobi** button. There is no second copy-code button. `buildRoomLink` uses the configured public URL, never the untrusted request Host header.

```js
const created = await emitWithAck("room:create", { name, config });
roomCodeElement.textContent = created.code;
copyButton.onclick = () => navigator.clipboard.writeText(created.inviteUrl);
```

## Deployment boundary

This implementation holds rooms in one Node process. It suits a single-instance deployment and intentionally clears games on restart, matching the current Jamb wipe policy. **Do not run multiple replicas with this in-memory manager:** route users to one instance or add a shared transactional store and cross-instance event delivery before scaling out. Set `PUBLIC_URL` to the real HTTPS address, restrict `allowedOrigins`, and derive `clientKeyFromSocket` from a trusted network address. Do not trust a client-supplied `X-Forwarded-For` header unless your reverse proxy verifies and replaces it.

The template limits abuse but does not replace application-specific authorization, input checks inside `game.apply`, observability, backups, or an incident response plan. Tests exercise the room contract and Socket.IO boundary; each new game still needs its own rules and end-to-end tests.

