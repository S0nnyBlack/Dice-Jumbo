import express from"express";import http from"http";import cors from"cors";import{Server}from"socket.io";import{randomInt}from"crypto";
const app=express();app.use(cors());app.get("/health",(req,res)=>res.json({ok:true,service:"jumbo-dice-server"}));
const httpServer=http.createServer(app);const io=new Server(httpServer,{cors:{origin:"*",methods:["GET","POST"]}});
const rooms=new Map(),sessions=new Map();
const MAX=4,MIN=2;
const names=["Igrač 1","Igrač 2","Igrač 3","Igrač 4"];
function code(){let c="";do c=Math.random().toString(36).slice(2,7).toUpperCase();while(rooms.has(c));return c}
function dice(){return Array.from({length:6},()=>randomInt(1,7))}
function sanitize(room,viewerId){return{roomCode:room.code,started:room.started,hostId:room.hostId,currentPlayerId:room.currentPlayerId,rolls:room.rolls,players:room.players.map(p=>({id:p.id,name:p.name,connected:p.connected,cells:p.id===viewerId?p.cells:safeCells(p.cells)})),config:room.config,dice:persistDiceFor(room,viewerId)}}
function safeCells(cells){const out={};for(const[k,v]of Object.entries(cells)){if(!k.endsWith("::SUM_TOP")&&!k.endsWith("::SUM_MID")&&!k.endsWith("::SUM_TOTAL"))out[k]=v}return out}
function persistDiceFor(room,viewerId){return room.currentPlayerId===viewerId?room.dice:null}
function send(room){for(const p of room.players){const s=io.sockets.sockets.get(p.socketId);if(s)s.emit("state",sanitize(room,p.id))}}
function err(s,msg){s.emit("game:error",{message:msg})}
function findPlayer(s,room){return room.players.find(p=>p.socketId===s.id)}
function newRoom(host,name,config){const id=cryptoId();const room={code:id,hostId:host.id,started:false,config,players:[host],currentPlayerId:host.id,rolls:0,dice:[],turnSelection:[],createdAt:Date.now()};rooms.set(id,room);return room}
function cryptoId(){return code()}
io.on("connection",socket=>{
 socket.on("room:create",({name,config}={})=>{
  const id=socket.id;const player={id,name:(name||names[0]).slice(0,24),socketId:id,connected:true,cells:{},sessionToken:randomInt(1e9,2e9).toString()};
  const room=newRoom(player,player.name,config);sessions.set(player.sessionToken,{roomCode:room.code,playerId:player.id});
  socket.join(room.code);socket.emit("room:created",{roomCode:room.code,playerId:player.id,sessionToken:player.sessionToken});send(room);
 });
 socket.on("room:join",({roomCode,name}={})=>{const room=rooms.get(String(roomCode||"").toUpperCase());if(!room)return err(socket,"Soba ne postoji.");if(room.started)return err(socket,"Partija je već počela.");
  if(room.players.length>=MAX)return err(socket,"Soba je puna.");
  const idx=room.players.length;const player={id:randomInt(1e8,9e8).toString(),name:(name||names[idx]).slice(0,24),socketId:socket.id,connected:true,cells:{},sessionToken:randomInt(1e9,2e9).toString()};
  room.players.push(player);sessions.set(player.sessionToken,{roomCode:room.code,playerId:player.id});socket.join(room.code);socket.emit("room:joined",{roomCode:room.code,playerId:player.id,sessionToken:player.sessionToken});send(room);
 });
 socket.on("room:start",()=>{const room=[...rooms.values()].find(r=>r.players.some(p=>p.socketId===socket.id));if(!room)return;if(room.hostId!==findPlayer(socket,room)?.id)return err(socket,"Samo host može da pokrene partiju.");if(room.players.length<MIN)return err(socket,"Potrebna su najmanje 2 igrača.");room.started=true;room.currentPlayerId=room.players[0].id;room.rolls=0;room.dice=[];send(room)});
 socket.on("turn:roll",()=>{const room=[...rooms.values()].find(r=>r.players.some(p=>p.socketId===socket.id));if(!room||!room.started)return;if(room.currentPlayerId!==findPlayer(socket,room)?.id)return err(socket,"Nije vaš potez.");if(room.rolls>=3)return err(socket,"Maksimalno 3 bacanja.");room.dice=room.rolls===0?dice():room.dice.map((v,i)=>room.turnSelection.includes(i)?v:dice()[i]);room.turnSelection=[];room.rolls++;send(room)});
 socket.on("turn:select",({indices}={})=>{const room=[...rooms.values()].find(r=>r.players.some(p=>p.socketId===socket.id));if(!room||room.currentPlayerId!==findPlayer(socket,room)?.id)return;const clean=[...new Set((indices||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<6))];if(clean.length>5)return err(socket,"Možete izabrati najviše 5 kockica.");room.turnSelection=clean;send(room)});
 socket.on("room:resume",({sessionToken}={})=>{const session=sessions.get(sessionToken);const room=session&&rooms.get(session.roomCode);if(!room)return err(socket,"Sesija nije pronađena.");const p=room.players.find(x=>x.id===session.playerId);if(!p)return err(socket,"Igrač nije pronađen.");p.socketId=socket.id;p.connected=true;socket.join(room.code);socket.emit("room:resumed",{roomCode:room.code,playerId:p.id});send(room)});
 socket.on("disconnect",()=>{for(const room of rooms.values()){const p=room.players.find(x=>x.socketId===socket.id);if(p){p.connected=false;p.socketId=null;send(room)}}});
});
const PORT=process.env.PORT||3000;httpServer.listen(PORT,()=>console.log(`Jumbo Dice server listening on ${PORT}`));