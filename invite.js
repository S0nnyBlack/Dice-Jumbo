const validRoomCode=/^[A-Z0-9]{5,8}$/;

export function readInviteCode(search=""){
 const raw=new URLSearchParams(search).get("room");
 const code=raw?.trim().toUpperCase()||"";
 return validRoomCode.test(code)?code:"";
}

export function buildInviteUrl(pageUrl,roomCode){
 const code=String(roomCode).trim().toUpperCase();
 if(!validRoomCode.test(code))throw new TypeError("Nevažeći kod sobe.");
 const url=new URL(pageUrl);
 url.searchParams.set("room",code);
 url.hash="";
 return url.toString();
}
