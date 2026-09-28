# Jumbo Dice

Phase 2 adds the real score-sheet model, per-player sheets, public opponent visibility and a multiplayer-ready game state.

## Implemented
- 6 dice, maximum 5 selected.
- Up to 3 rolls.
- Host-only column configuration.
- Mandatory Gore, Dole and Slobodna.
- Per-player cells and used-cell locking.
- Opponent score sheets can be opened.
- Opponent SUM/total rows are hidden during play.
- Own total is visible.

## Scoring reference
- Upper rows 1-6: sum matching dice.
- Triling: selected five dice must contain three equal dice; score sum +20.
- Ful: 3+2; score sum +30.
- Poker: four equal; score sum +40.
- Yamb: five equal; score sum +50.
- Kenta: 1-5 = 66, 2-6 = 56.

## Multiplayer
The repository includes a server-authoritative realtime transport using Express and Socket.IO. Render deployment is supported via render.yaml.

## Solo mode
- Single-player local mode is available without an AI opponent.
- The same 6-dice / select-up-to-5 / up-to-3-roll flow is used.
- The player configures active columns before starting.
- Results are stored locally in the browser for the current session.
