# Multiplayer architecture

The browser UI now uses a per-player game-state model.

For production online play, the authoritative state should live on a server:
- room creation/join via room code
- host owns the column configuration
- server validates roll limits, selected dice, category availability and turn order
- clients receive sanitized opponent sheets
- aggregate rows remain server-side/private until game end
- reconnect support restores the player's current turn

A WebSocket transport (for example Node.js + Socket.IO) can be added without changing the scoring API in game.js.
