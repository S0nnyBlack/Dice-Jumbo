# Jumbo Dice server

Server-authoritative realtime layer using Express + Socket.IO. Socket.IO provides bidirectional low-latency events and automatic reconnection support. The server owns room state, turn order and dice rolls.

## Events
- room:create
- room:join
- room:start
- turn:roll
- turn:select
- room:resume
- state
- game:error

The next implementation phase should move full scoring validation into the server and add category-write events with per-category locking.