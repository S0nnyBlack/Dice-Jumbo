const socket=window.io ? window.io(window.location.origin) : null;
const net={connected:false,roomCode:null,playerId:null,sessionToken:null,server:null};
import{COLUMN_DEFS,VALUE_ROWS,COMBINATION_ROWS,rollDice,availableEntries}from"./game.js";

const state={
 mode:"setup",rolls:0,dice:[],selected:new Set(),columns:["down","free","up"],
 currentPlayer:0,players:[{id:"local",name:"Igrač 1",cells:{}}],activePlayers:1,viewPlayer:0,pending:null,gameOver:false,soloActive:false,crossOutMode:false
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
 state.currentPlayer=0;state.viewPlayer=0;state.pending=null;state.gameOver=false;state.soloActive=false;state.crossOutMode=false;
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

function columnSetup(title,buttonText,onStart,locked=false){
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>${title}</p></div>
 <div class="setup-card"><h2>Kolone</h2><p class="status">${locked?"Podešavanja su zaključana do kraja tekuće partije.":"Početno su uključene samo obavezne kolone: Gore, Dole i Slobodna. Možete uključiti ostale kolone ili izabrati sve."}</p>
 <div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory||locked?"disabled":""}></label>`).join("")}</div>${locked?"":'<button class="btn" id="selectAll" type="button">Izaberi sve</button>'}</div>
 <button class="btn primary" id="start">${buttonText}</button><button class="btn" id="back">Nazad</button>
 </section>`;
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{state.columns=x.checked?[...new Set([...state.columns,x.dataset.col])]:state.columns.filter(id=>id!==x.dataset.col)});
 const selectAll=app.querySelector("#selectAll");if(selectAll)selectAll.onclick=()=>{state.columns=COLUMN_DEFS.map(c=>c.id);app.querySelectorAll("[data-col]").forEach(input=>{input.checked=true})};
 app.querySelector("#start").onclick=onStart;
 app.querySelector("#back").onclick=setup;
}

function soloSetup(){
 if(state.soloActive&&!state.gameOver){
   columnSetup("Solo igra u toku","Nastavi partiju",soloGame,true);
   return;
 }
 state.columns=["down","free","up"];
 columnSetup("Solo igra","Pokreni solo igru",()=>{resetLocal();state.columns=[...new Set(["down","free","up",...state.columns])];state.mode="solo";state.soloActive=true;soloGame();});
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
 socket.on("room:resumed",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken)});
 socket.on("room:created",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Soba je kreirana: "+d.roomCode);});
 socket.on("room:joined",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Pridružen si sobi "+d.roomCode);});
 socket.on("game:error",e=>alert(e.message));
 socket.on("state",s=>{net.server=s;if(state.mode!=="solo")renderServerState(s)});
}

function newTurn(){state.rolls=0;state.dice=[];state.selected.clear();state.pending=null;state.crossOutMode=false}

function soloGame(){
 state.mode="solo";
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice <span class="mode-badge">SOLO</span></h1><p>6 kockica · najviše 5 za rezultat · do 3 bacanja</p></div><div class="toolbar"><button class="btn" id="setup">Podešavanja</button><button class="btn" id="home">Početni ekran</button></div></header>
 <div class="layout">
 <section class="panel">
  <div class="meta"><span>Na potezu: <b>Igrač 1</b></span><span>Bacanje <b id="count">0/3</b></span></div>
  <div class="dice-grid" id="dice"></div>
  <div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button><button class="btn" id="crossout">Precrtaj polje (0)</button></div>
  <div class="options" id="options"></div>
 </section>
 <section class="panel"><div class="tabs"><button class="player-tab active">Igrač 1</button></div><div class="sheet-wrap"><div id="sheet"></div></div></section>
 </div>`;
 app.querySelector("#setup").onclick=soloSetup;
 app.querySelector("#home").onclick=setup;
 app.querySelector("#roll").onclick=soloRoll;
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.pending=null;state.crossOutMode=false;renderSolo()};
 app.querySelector("#crossout").onclick=()=>{state.crossOutMode=!state.crossOutMode;if(state.crossOutMode)state.selected.clear();renderSolo()};
 renderSolo();
}

function soloRoll(){
 if(state.gameOver||state.rolls>=3)return;
 state.crossOutMode=false;
 const fresh=rollDice(6);
 if(state.rolls===0)state.dice=fresh;
 else state.dice=state.dice.map((v,i)=>state.selected.has(i)?v:fresh[i]);
 state.rolls++;state.selected.clear();state.pending=null;renderSolo();
}

function soloCandidates(){
 if(state.rolls===0||(!state.crossOutMode&&state.selected.size===0))return [];
 return availableEntries(state.columns,current()?.cells||{},state.crossOutMode?[]:selectedValues(),{crossOut:state.crossOutMode});
}
function confirmShortSelection(candidate){
 if(state.crossOutMode||state.selected.size===5)return true;
 return window.confirm("Izabrali ste "+state.selected.size+" od 5 kockica. Upis će se računati samo iz izabranih kockica. Da li želite da nastavite?");
}
function commitOnlineCandidate(candidate){
 if(!confirmShortSelection(candidate))return;
 socket?.emit("turn:commit",{columnId:candidate.colId,row:candidate.row,crossOut:state.crossOutMode});
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
 dice.innerHTML=state.dice.map((v,i)=>'<button class="die '+(state.selected.has(i)?"selected":"")+'" data-i="'+i+'" '+(!state.rolls||state.gameOver?"disabled":"")+'>'+v+'</button>').join("");
 dice.querySelectorAll(".die").forEach(b=>b.onclick=()=>{
   if(!state.rolls||state.gameOver)return;
   state.crossOutMode=false;
   const i=+b.dataset.i;
   if(state.selected.has(i))state.selected.delete(i);
   else if(state.selected.size<5)state.selected.add(i);
   renderSolo();
 });
 const count=app.querySelector("#count");if(count)count.textContent=`${state.rolls}/3`;
 const roll=app.querySelector("#roll");
 if(roll){roll.disabled=state.gameOver||state.rolls>=3;roll.textContent=state.rolls>=3?"Sva bacanja iskorišćena":"Baci / ponovo baci";}
 const crossout=app.querySelector("#crossout");
 if(crossout){crossout.disabled=state.gameOver||state.rolls===0;crossout.classList.toggle("crossout-active",state.crossOutMode);crossout.textContent=state.crossOutMode?"Otkaži precrtavanje":"Precrtaj polje (0)";}
 const box=app.querySelector("#options");if(box){
   let hint="";
   if(state.gameOver) hint="Solo partija je završena.";
   else if(state.rolls===0) hint="Prvo baci kockice. Možeš upisati rezultat koristeći 1–5 izabranih kockica.";
   else if(state.crossOutMode) hint="Izaberi dostupno polje koje želiš da precrtaš. U polje će biti upisana 0.";
   else if(state.rolls<3) hint="Označene kockice se zadržavaju pri sledećem bacanju. Za bodovanje izaberi 1–5; upis sa manje od 5 traži potvrdu.";
   else hint=`Izabrano za rezultat: ${state.selected.size}/5. Upis sa manje od 5 kockica traži potvrdu.`;
   const ops=state.gameOver?[]:soloCandidates();
   const cards=ops.map((o,i)=>'<button class="option" data-op="'+i+'"><b>'+escapeHtml(o.colName)+' · '+escapeHtml(o.row)+'</b><span>'+o.value+'</span></button>').join("");
   const empty=state.gameOver||state.rolls===0||state.crossOutMode?"":(state.selected.size===0?"Izaberi bar jednu kockicu ili uključi precrtavanje.":"Nema dostupnih polja za izabranu kombinaciju.");
   box.innerHTML='<span class="status">'+hint+'</span>'+(cards|| (empty?'<span class="status options-empty">'+empty+'</span>':""));
   box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>{
     const option=ops[+b.dataset.op];
     if(confirmShortSelection(option))commitSolo(option);
   });
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
 const canChoose=isSelf&&!state.gameOver&&state.rolls>0&&(state.crossOutMode||state.selected.size>0)&&(state.mode!=="online"||current()?.id===net.playerId);
 const choices=canChoose?soloCandidates():[];
 const hideRow=!state.gameOver&&!isSelf;
 let html=`<table class="sheet premium-sheet"><colgroup><col class="label-col">${columns.map(c=>`<col class="data-col col-${c.id}">`).join("")}</colgroup>
 <thead><tr><th class="corner-hatch" aria-label="Kategorija"></th>${columns.map(c=>`<th class="sheet-head ${c.id==="r"?"group-start":""}" title="${titles[c.id]}"><span class="head-symbol">${headers[c.id]}</span><span class="head-name">${titles[c.id]}</span></th>`).join("")}</tr></thead><tbody>`;
 for(const row of rows){
   const hiddenSum=(hideRow&&["SUM_TOP","SUM_MID","SUM_TOTAL"].includes(row.id))||(!state.gameOver&&row.id==="SUM_TOTAL");
   html+=`<tr class="sheet-row ${row.type} ${hiddenSum?"hidden-total-row":""}"><th class="row-label">${row.label}${row.sub?`<small>${row.sub}</small>`:""}</th>`;
   for(const col of columns){
     const v=player?.cells?.[cellKey(col.id,row.id)];
     const optionIndex=choices.findIndex(option=>option.colId===col.id&&option.row===row.id);
     const isAvailable=optionIndex>=0&&v===undefined&&!hiddenSum;
     const shown=hiddenSum?"🔒":isAvailable?choices[optionIndex].value:(v===undefined?"":v);
     const classNames=["sheet-cell",hiddenSum?"locked-total":isAvailable?"available-entry":(v===undefined?"empty":"filled"),col.id==="o"?"o-column":"",col.id==="r"?"group-start":""].filter(Boolean).join(" ");
     const choiceAttrs=isAvailable?` data-choice="${optionIndex}" role="button" tabindex="0" aria-label="Dostupno polje: ${escapeHtml(col.name)}, ${row.label}, ${choices[optionIndex].value} poena"`:"";
     html+=`<td class="${classNames}" data-cell="${cellKey(col.id,row.id)}"${choiceAttrs}>${shown}</td>`;
   }
   html+="</tr>";
 }
 if(isSelf||state.gameOver){
   const total=Object.entries(player?.cells||{}).reduce((acc,[k,v])=>k.includes("::SUM_")?acc:acc+Number(v||0)*(k.endsWith("::MIN")?-1:1),0);
   html+=`<tr class="final-total"><th class="row-label">UKUPNO</th><td colspan="${columns.length}" class="final-total-value">${state.gameOver?total:"🔒"}</td></tr>`;
 }
 html+="</tbody></table>";
 sheet.innerHTML=html;
 sheet.querySelectorAll("[data-choice]").forEach(cell=>{
   const choose=()=>{
     const option=choices[Number(cell.dataset.choice)];
     if(!option)return;
     if(state.mode==="solo"){if(confirmShortSelection(option))commitSolo(option);}
     else commitOnlineCandidate(option);
   };
   cell.onclick=choose;
   cell.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();choose();}};
 });
}

function renderSoloSheet(){
 const isSelf=state.mode!=="online"||current()?.id===net.playerId;
 renderScoreSheet(current(),isSelf);
}

function renderServerState(s){
 if(!s)return;
 state.mode="online";state.gameOver=Boolean(s.gameOver);state.rolls=s.rolls;state.dice=s.dice||[];state.selected=new Set(s.selection||[]);
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
 <div class="layout"><section class="panel"><div class="meta"><span>Na potezu: <b>${escapeHtml(current().name)}</b></span><span>Bacanje <b id="count">0/3</b></span></div><div class="dice-grid" id="dice"></div><div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button><button class="btn" id="crossout">Precrtaj polje (0)</button></div><div class="options" id="options"></div></section><section class="panel"><div class="tabs" id="tabs"></div><div class="sheet-wrap"><div id="sheet"></div></div></section></div>`;
 app.querySelector("#roll").onclick=()=>{state.crossOutMode=false;socket?.emit("turn:roll")};
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.crossOutMode=false;socket?.emit("turn:select",{indices:[]})};
 app.querySelector("#crossout").onclick=()=>{state.crossOutMode=!state.crossOutMode;if(state.crossOutMode){state.selected.clear();socket?.emit("turn:select",{indices:[]})}renderOnline()};
 renderOnline();
}

function renderOnline(){
 const d=app.querySelector("#dice");if(!d)return;
 const isMyTurn=state.players[state.currentPlayer]?.id===net.playerId;
 d.innerHTML=state.dice.map((v,i)=>'<button class="die '+(state.selected.has(i)?"selected":"")+'" data-i="'+i+'" '+(!isMyTurn||state.gameOver||state.rolls===0?"disabled":"")+'>'+v+'</button>').join("");
 d.querySelectorAll(".die").forEach(b=>b.onclick=()=>{
   if(!isMyTurn||state.gameOver||state.rolls===0)return;
   state.crossOutMode=false;
   const i=+b.dataset.i;
   state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);
   socket?.emit("turn:select",{indices:[...state.selected]});
 });
 const c=app.querySelector("#count");if(c)c.textContent=`${state.rolls}/3`;
 const roll=app.querySelector("#roll"),clear=app.querySelector("#clear"),crossout=app.querySelector("#crossout");
 if(roll){roll.disabled=!isMyTurn||state.gameOver||state.rolls>=3;roll.textContent=state.rolls>=3?"Sva bacanja iskorišćena":"Baci / ponovo baci";}
 if(clear)clear.disabled=!isMyTurn||state.gameOver||state.rolls===0;
 if(crossout){crossout.disabled=!isMyTurn||state.gameOver||state.rolls===0;crossout.classList.toggle("crossout-active",state.crossOutMode);crossout.textContent=state.crossOutMode?"Otkaži precrtavanje":"Precrtaj polje (0)";}
 const tabs=app.querySelector("#tabs");tabs.innerHTML=state.players.map((p,i)=>'<button class="player-tab '+(i===state.currentPlayer?'active':'')+'">'+escapeHtml(p.name)+'</button>').join("");
 const box=app.querySelector("#options");
 if(box){
   let hint="";
   if(state.gameOver)hint="Partija je završena. Konačan rezultat je prikazan na tabeli.";
   else if(!isMyTurn)hint="Sačekaj svoj potez.";
   else if(state.rolls===0)hint="Prvo baci kockice. Za bodovanje izaberi 1–5 kockica.";
   else if(state.crossOutMode)hint="Izaberi dostupno polje koje želiš da precrtaš. U polje će biti upisana 0.";
   else if(state.selected.size===0)hint="Izaberi 1–5 kockica za bodovanje ili označi kockice za sledeće bacanje.";
   else hint=`Izabrano: ${state.selected.size}/5. Sa manje od 5 kockica prikazaće se upozorenje pri upisu.`;
   const ops=state.gameOver||!isMyTurn?[]:soloCandidates();
   const cards=ops.map((o,i)=>'<button class="option" data-op="'+i+'"><b>'+escapeHtml(o.colName)+' · '+escapeHtml(o.row)+'</b><span>'+o.value+'</span></button>').join("");
   const empty=!state.gameOver&&isMyTurn&&state.rolls>0&&!state.crossOutMode&&state.selected.size>0&&!ops.length?"Nema dostupnih polja za izabrani rezultat.":"";
   box.innerHTML='<span class="status">'+hint+'</span>'+(cards||(empty?'<span class="status options-empty">'+empty+'</span>':""));
   box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>commitOnlineCandidate(ops[+b.dataset.op]));
 }
 renderSoloSheet();
}

setup();
