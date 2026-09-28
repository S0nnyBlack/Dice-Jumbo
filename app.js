const socket=window.io ? window.io(window.location.origin) : null;
const net={connected:false,roomCode:null,playerId:null,sessionToken:null,server:null};
import{COLUMN_DEFS,VALUE_ROWS,COMBINATION_ROWS,rollDice,analyse,combinationScore,upperScore,directionOrder}from"./game.js";

const state={
 mode:"setup",rolls:0,dice:[],selected:new Set(),columns:["down","free","up"],
 currentPlayer:0,players:[{id:"local",name:"Igrač 1",cells:{}}],activePlayers:1,viewPlayer:0,pending:null,gameOver:false
};
const app=document.getElementById("app");
const defs=()=>state.columns.map(id=>COLUMN_DEFS.find(c=>c.id===id)).filter(Boolean);
const escapeHtml=value=>String(value).replace(/[&<>"\']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[ch]));
const current=()=>state.players[state.currentPlayer];
const cellKey=(col,row)=>col+"::"+row;
const selectedValues=()=>[...state.selected].map(i=>state.dice[i]);
const isFilled=(p,col,row)=>p?.cells?.[cellKey(col,row)]!==undefined;
const scoreRows=[...VALUE_ROWS.map(String),"MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"];

function resetLocal(){
 state.mode="solo";state.rolls=0;state.dice=[];state.selected.clear();state.players=[{id:"local",name:"Igrač 1",cells:{}}];
 state.currentPlayer=0;state.viewPlayer=0;state.pending=null;state.gameOver=false;
}

function setup(){
 state.mode="setup";
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>Izaberi način igre</p></div>
 <div class="setup-card"><h2>Način igre</h2><div class="toolbar">
   <button class="btn primary" id="solo">Solo igra</button>
   <button class="btn" id="online">Online multiplayer</button>
 </div><p class="status">Solo mod je namenjen igranju jednog igrača bez protivničkog AI-ja.</p></div>
 </section>`;
 app.querySelector("#solo").onclick=soloSetup;
 app.querySelector("#online").onclick=onlineSetup;
}

function columnSetup(title,buttonText,onStart){
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>${title}</p></div>
 <div class="setup-card"><h2>Kolone</h2><p class="status">Gore, Dole i Slobodna su obavezne. Ostale kolone možete uključiti ili isključiti pre početka.</p>
 <div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory?"disabled":""}></label>`).join("")}</div></div>
 <button class="btn primary" id="start">${buttonText}</button><button class="btn" id="back">Nazad</button>
 </section>`;
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{state.columns=x.checked?[...new Set([...state.columns,x.dataset.col])]:state.columns.filter(id=>id!==x.dataset.col)});
 app.querySelector("#start").onclick=onStart;
 app.querySelector("#back").onclick=setup;
}

function soloSetup(){
 state.columns=[...COLUMN_DEFS.map(c=>c.id)];
 columnSetup("Solo igra","Pokreni solo igru",()=>{resetLocal();state.columns=[...new Set(["down","free","up",...state.columns])];state.mode="solo";soloGame();});
}

function onlineSetup(){
 state.mode="setup-online";
 state.columns=["down","free","up"];
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>Online multiplayer</p></div>
 <div id="network" class="status">Online: povezivanje sa serverom…</div>
 <div class="setup-card"><h2>Soba</h2><div class="toolbar">
   <input id="playerName" placeholder="Ime igrača" value="Igrač 1">
   <button class="btn" id="createRoom">Kreiraj sobu</button>
 </div><div class="toolbar" style="margin-top:10px">
   <input id="roomCodeInput" placeholder="ROOM CODE"><input id="joinName" placeholder="Ime igrača" value="Igrač 2"><button class="btn" id="joinRoom">Pridruži se</button>
 </div></div>
 <div class="setup-card"><h2>Kolone</h2><div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory?"disabled":""}></label>`).join("")}</div></div>
 <button class="btn" id="back">Nazad</button></section>`;
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{state.columns=x.checked?[...new Set([...state.columns,x.dataset.col])]:state.columns.filter(id=>id!==x.dataset.col)});
 app.querySelector("#back").onclick=setup;
 if(socket){
   app.querySelector("#createRoom").onclick=()=>socket.emit("room:create",{name:app.querySelector("#playerName").value||"Igrač 1",config:{columns:state.columns}});
   app.querySelector("#joinRoom").onclick=()=>socket.emit("room:join",{roomCode:app.querySelector("#roomCodeInput").value,name:app.querySelector("#joinName").value||"Igrač"});
   updateNetworkStatus();
 }
}

function updateNetworkStatus(){
 const n=document.getElementById("network");if(n)n.textContent=net.connected?"Online: server povezan":"Online: povezivanje…";
}
if(socket){
 socket.on("connect",()=>{net.connected=true;updateNetworkStatus();const token=localStorage.getItem("jumboDiceSession");if(token)socket.emit("room:resume",{sessionToken:token})});
 socket.on("disconnect",()=>{net.connected=false;updateNetworkStatus()});
 socket.on("room:created",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Soba je kreirana: "+d.roomCode);});
 socket.on("room:joined",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Pridružen si sobi "+d.roomCode);});
 socket.on("game:error",e=>alert(e.message));
 socket.on("state",s=>{net.server=s;if(state.mode!=="solo")renderServerState(s)});
}

function newTurn(){state.rolls=0;state.dice=[];state.selected.clear();state.pending=null}

function soloGame(){
 state.mode="solo";
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice <span class="mode-badge">SOLO</span></h1><p>6 kockica · najviše 5 za rezultat · do 3 bacanja</p></div><div class="toolbar"><button class="btn" id="setup">Podešavanja</button><button class="btn" id="home">Početni ekran</button></div></header>
 <div class="layout">
 <section class="panel">
  <div class="meta"><span>Na potezu: <b>Igrač 1</b></span><span>Bacanje <b id="count">0/3</b></span></div>
  <div class="dice-grid" id="dice"></div>
  <div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button></div>
  <div class="options" id="options"></div>
 </section>
 <section class="panel"><div class="tabs"><button class="player-tab active">Igrač 1</button></div><div class="sheet-wrap"><div id="sheet"></div></div></section>
 </div>`;
 app.querySelector("#setup").onclick=soloSetup;
 app.querySelector("#home").onclick=setup;
 app.querySelector("#roll").onclick=soloRoll;
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.pending=null;renderSolo()};
 renderSolo();
}

function soloRoll(){
 if(state.gameOver||state.rolls>=3)return;
 const fresh=rollDice(6);
 if(state.rolls===0)state.dice=fresh;
 else state.dice=state.dice.map((v,i)=>state.selected.has(i)?v:fresh[i]);
 state.rolls++;state.selected.clear();state.pending=null;renderSolo();
}

function soloCandidates(){
 if(state.selected.size!==5||state.rolls===0)return [];
 const values=selectedValues(),a=analyse(values),p=current(),out=[];
 for(const col of defs()){
   if(["up","down"].includes(col.id)){
     const row=directionOrder(col.id,p.cells);
     if(row&&scoreRows.includes(row)&&!isFilled(p,col.id,row))out.push(makeCandidate(col,row,values,a));
   }else{
     for(const row of scoreRows){
       if(isFilled(p,col.id,row))continue;
       const c=makeCandidate(col,row,values,a);
       if(c)out.push(c);
     }
   }
 }
 return out.filter(Boolean);
}

function makeCandidate(col,row,values,a){
 let value=null;
 if(VALUE_ROWS.map(String).includes(row)) value=a.upper[Number(row)];
 else if(row==="MAX"||row==="MIN") value=a.total;
 else value=combinationScore(row,values);
 if(value===null||value===undefined)return null;
 return{colId:col.id,colName:col.name,row,value};
}

function commitSolo(candidate){
 const p=current();
 if(isFilled(p,candidate.colId,candidate.row))return;
 p.cells[cellKey(candidate.colId,candidate.row)]=candidate.value;
 state.pending=null;
 const filled=defs().every(col=>scoreRows.every(row=>isFilled(p,col.id,row)));
 if(filled){state.gameOver=true;newTurn();renderSolo();return;}
 newTurn();renderSolo();
}

function renderSolo(){
 const dice=app.querySelector("#dice");if(!dice)return;
 dice.innerHTML=state.dice.map((v,i)=>`<button class="die ${state.selected.has(i)?"selected":""}" data-i="${i}">${v}</button>`).join("");
 dice.querySelectorAll(".die").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(state.selected.has(i))state.selected.delete(i);else if(state.selected.size<5)state.selected.add(i);renderSolo()});
 const count=app.querySelector("#count");if(count)count.textContent=`${state.rolls}/3`;
 const box=app.querySelector("#options");if(box){
   if(state.gameOver){box.innerHTML='<span class="status">Solo partija je završena.</span>';}
   else if(state.selected.size!==5){box.innerHTML='<span class="status">Izaberi tačno 5 kockica. Možeš menjati izbor do sledećeg bacanja.</span>';}
   else{
     const ops=soloCandidates();
     box.innerHTML=ops.length?ops.map((o,i)=>`<button class="option" data-op="${i}"><b>${o.colName} · ${o.row}</b><span>${o.value}</span></button>`).join(""):'<span class="status">Nema dostupnog upisa za ovu kombinaciju.</span>';
     box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>commitSolo(ops[+b.dataset.op]));
   }
 }
 renderSoloSheet();
}

function renderScoreSheet(player,isSelf=true){
 const sheet=app.querySelector("#sheet");if(!sheet)return;
 const columns=defs();
 const headers={down:"↓",free:"S",up:"↑",announced:"↕",contra:"↓↑",r:"R",n:"N",d:"D",o:"O",m:"M"};
 const titles={down:"Dole",free:"Slobodna",up:"Gore",announced:"Najava",contra:"Kontra najava",r:"R",n:"N",d:"D",o:"O",m:"M"};
 const rows=[
  {id:"1",label:"1",type:"normal"},{id:"2",label:"2",type:"normal"},{id:"3",label:"3",type:"normal"},
  {id:"4",label:"4",type:"normal"},{id:"5",label:"5",type:"normal"},{id:"6",label:"6",type:"normal"},
  {id:"SUM_TOP",label:"Σ",type:"sum"},{id:"MAX",label:"max",type:"normal"},{id:"MIN",label:"min",type:"normal"},
  {id:"SUM_MID",label:"Σ",type:"sum"},
  {id:"KENTA",label:"KENTA",sub:"66, 56, 46",type:"combo"},
  {id:"TRILING",label:"TRILING",sub:"+20",type:"combo"},
  {id:"FUL",label:"FUL",sub:"+30",type:"combo"},
  {id:"POKER",label:"POKER",sub:"+40",type:"combo"},
  {id:"YAMB",label:"YAMB",sub:"+50",type:"combo"},
  {id:"SUM_TOTAL",label:"Σ",type:"sum"}
 ];
 const hideRow=!isSelf;
 let html=`<table class="sheet premium-sheet"><colgroup><col class="label-col">${columns.map(c=>`<col class="data-col col-${c.id}">`).join("")}</colgroup>
 <thead><tr><th class="corner-hatch" aria-label="Kategorija"></th>${columns.map(c=>`<th class="sheet-head ${c.id==="r"?"group-start":""}" title="${titles[c.id]}"><span class="head-symbol">${headers[c.id]}</span><span class="head-name">${titles[c.id]}</span></th>`).join("")}</tr></thead><tbody>`;
 for(const row of rows){
   const hiddenSum=hideRow&&["SUM_TOP","SUM_MID","SUM_TOTAL"].includes(row.id);
   html+=`<tr class="sheet-row ${row.type} ${hiddenSum?"hidden-total-row":""}"><th class="row-label">${row.label}${row.sub?`<small>${row.sub}</small>`:""}</th>`;
   for(const col of columns){
     const v=player?.cells?.[cellKey(col.id,row.id)];
     const shown=hiddenSum?(v===undefined?"":"🔒"):(v===undefined?"":v);
     const classNames=["sheet-cell",v===undefined?"empty":"filled",col.id==="o"?"o-column":"",col.id==="r"?"group-start":""].filter(Boolean).join(" ");
     html+=`<td class="${classNames}" data-cell="${cellKey(col.id,row.id)}">${shown}</td>`;
   }
   html+="</tr>";
 }
 if(isSelf){
   const total=Object.entries(player?.cells||{}).reduce((acc,[k,v])=>k.includes("::SUM_")?acc:acc+Number(v||0)*(k.endsWith("::MIN")?-1:1),0);
   html+=`<tr class="final-total"><th class="row-label">UKUPNO</th><td colspan="${columns.length}" class="final-total-value">${total}</td></tr>`;
 }
 html+="</tbody></table>";
 sheet.innerHTML=html;
}

function renderSoloSheet(){
 renderScoreSheet(current(),true);
}

function renderServerState(s){
 if(!s)return;
 state.mode="online";state.rolls=s.rolls;state.dice=s.dice||[];state.selected=new Set(s.selection||[]);
 const idx=s.players.findIndex(p=>p.id===s.currentPlayerId);if(idx>=0)state.currentPlayer=idx;
 state.players=s.players.map(p=>({id:p.id,name:p.name,cells:p.cells||{}}));
 state.columns=s.config?.columns||state.columns;
 if(s.started){game();renderOnline();}
 else renderLobbyState(s);
}
function renderLobbyState(s){
 app.innerHTML='<section class="panel setup"><div class="brand"><h1>Jumbo Dice <span class="mode-badge">ONLINE</span></h1><p>Soba '+s.roomCode+'</p></div><div class="setup-card"><h2>Igrači ('+s.players.length+'/4)</h2><div class="status">'+s.players.map(p=>escapeHtml(p.name)+(p.id===s.hostId?' · host':'')+(p.connected?'':' · offline')).join('<br>')+'</div><p class="status">'+(s.players.length<2?'Čeka se još jedan igrač.':'Soba je spremna za početak.')+'</p>'+(s.hostId===net.playerId?'<button class="btn primary" id="startOnline" '+(s.players.length<2?'disabled':'')+'>Pokreni partiju</button>':'<p class="status">Čeka se da host pokrene partiju.</p>')+'</div><button class="btn" id="back">Početni ekran</button></section>';
 app.querySelector("#back").onclick=setup;
 const start=app.querySelector("#startOnline");if(start)start.onclick=()=>socket?.emit("room:start");
}

function game(){
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice <span class="mode-badge">ONLINE</span></h1><p>6 kockica · najviše 5 za rezultat · do 3 bacanja</p></div></header>
 <div class="layout"><section class="panel"><div class="meta"><span>Na potezu: <b>${escapeHtml(current().name)}</b></span><span>Bacanje <b id="count">0/3</b></span></div><div class="dice-grid" id="dice"></div><div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi</button></div><div class="options" id="options"></div></section><section class="panel"><div class="tabs" id="tabs"></div><div class="sheet-wrap"><div id="sheet"></div></div></section></div>`;
 app.querySelector("#roll").onclick=()=>socket?.emit("turn:roll");app.querySelector("#clear").onclick=()=>{state.selected.clear();socket?.emit("turn:select",{indices:[]})};renderOnline();
}

function renderOnline(){
 const d=app.querySelector("#dice");if(!d)return;
 d.innerHTML=state.dice.map((v,i)=>`<button class="die ${state.selected.has(i)?"selected":""}" data-i="${i}">${v}</button>`).join("");
 d.querySelectorAll(".die").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);socket?.emit("turn:select",{indices:[...state.selected]})});
 const c=app.querySelector("#count");if(c)c.textContent=`${state.rolls}/3`;
 const tabs=app.querySelector("#tabs");tabs.innerHTML=state.players.map((p,i)=>'<button class="player-tab '+(i===state.currentPlayer?'active':'')+'">'+escapeHtml(p.name)+'</button>').join("");
 const box=app.querySelector("#options");
 if(box){
   if(state.players[state.currentPlayer]?.id!==net.playerId) box.innerHTML='<span class="status">Sačekaj svoj potez.</span>';
   else if(state.rolls===0) box.innerHTML='<span class="status">Baci kockice da započneš potez.</span>';
   else if(state.selected.size!==5) box.innerHTML='<span class="status">Izaberi tačno 5 kockica.</span>';
   else{
     const ops=soloCandidates();
     box.innerHTML=ops.length?ops.map((o,i)=>'<button class="option" data-op="'+i+'"><b>'+o.colName+' · '+o.row+'</b><span>'+o.value+'</span></button>').join(""):'<span class="status">Nema dostupnog upisa za ovu kombinaciju.</span>';
     box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>socket?.emit("turn:commit",{columnId:ops[+b.dataset.op].colId,row:ops[+b.dataset.op].row}));
   }
 }
 renderSoloSheet();
}

setup();
