import { RoomError } from "./room-manager.js";

const codePattern = /^[A-HJ-NP-Z2-9]{10}$/;

export function buildRoomLink(publicUrl, code) {
  if (typeof code !== "string" || !codePattern.test(code)) throw new RoomError("INVALID_CODE", "Invalid room code.");
  const url = new URL(publicUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new TypeError("Public URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw new TypeError("Public URL must not contain credentials.");
  url.searchParams.set("room", code);
  url.hash = "";
  return url.toString();
}

export function readRoomCode(search) {
  const value = new URLSearchParams(search).get("room")?.trim().toUpperCase() || "";
  return codePattern.test(value) ? value : "";
}

