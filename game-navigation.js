export const GAME_DESTINATIONS = Object.freeze({
  hub: "/",
  ludo: "https://ne-ljuti-se-covece-2.onrender.com/covece"
});
// Preserve unfinished solo/online sessions and respect the existing leave confirmation.
export function navigateToGame(destination, { confirmLeave, saveSolo, navigate }) {
  if (!Object.values(GAME_DESTINATIONS).includes(destination)) throw new Error("Unknown navigation destination");
  if (!confirmLeave()) return false;
  saveSolo();
  navigate(destination);
  return true;
}
