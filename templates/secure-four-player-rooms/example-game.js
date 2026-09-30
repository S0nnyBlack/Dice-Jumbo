import { RoomError } from "./room-manager.js";

// Replace this adapter with the rules for a new game. The room manager owns
// identity, seats, invitations, revisions, and reconnection.
export const exampleGame = {
  create(config) {
    const target = config.target ?? 5;
    if (!Number.isInteger(target) || target < 3 || target > 20) throw new RoomError("INVALID_CONFIG", "Target must be 3–20.");
    return { target, count: 0, currentSeat: 0, winnerSeat: null };
  },

  start(state) { state.currentSeat = 0; },

  apply(state, { seat, command, players }) {
    if (seat !== state.currentSeat) throw new RoomError("NOT_YOUR_TURN", "Wait for your turn.");
    if (command.type !== "take" || !Number.isInteger(command.amount) || command.amount < 1 || command.amount > 2) {
      throw new RoomError("INVALID_MOVE", "Take one or two points.");
    }
    state.count += command.amount;
    if (state.count >= state.target) {
      state.winnerSeat = seat;
      return { finished: true };
    }
    state.currentSeat = (seat + 1) % players.length;
    return { finished: false };
  },

  publicState(state) {
    return { target: state.target, count: state.count, currentSeat: state.currentSeat, winnerSeat: state.winnerSeat };
  }
};

