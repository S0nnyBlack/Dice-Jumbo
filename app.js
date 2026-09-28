const socket=window.io ? window.io(window.location.origin) : null;
const net={connected:false,synced:false,roomCode:null,playerId:null,sessionToken:null,server:null};
import{COLUMN_DEFS,VALUE_ROWS,COMBINATION_ROWS,rollDice,availableEntries,upperBonus,normalizeColumnIds}from"./game.js";

const state={
 mode:"setup",rolls:0,maxRolls:3,dice:[],selected:new Set(),undoHistory:[],columns:["down","free","up"],
 currentPlayer:0,players:[{id:"local",name:"Igrač 1",cells:{},crossedCells:[]} ],activePlayers:1,viewPlayer:0,pending:null,gameOver:false,soloActive:false,crossOutMode:false,announcedRow:null,contraTargetRow:null,onlineStarted:false,hostId:null,onlineUndoAvailable:false
};
const app=document.getElementById("app");
const defs=()=>state.columns.map(id=>COLUMN_DEFS.find(c=>c.id===id)).filter(Boolean);
const escapeHtml=value=>String(value).replace(/[&<>"\']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[ch]));
const current=()=>state.players[state.currentPlayer];
const cellKey=(col,row)=>col+"::"+row;
const selectedValues=()=>[...state.selected].map(i=>state.dice[i]);
const isFilled=(p,col,row)=>p?.cells?.[cellKey(col,row)]!==undefined;
const scoreRows=[...VALUE_ROWS.map(String),"MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"];

const TABLE_SCALE_KEY="jumboDiceTableScaleV1";
const TABLE_SCALE_LEVELS=["compact","normal","large"];
let tableScale="normal";
try{const savedScale=localStorage.getItem(TABLE_SCALE_KEY);if(TABLE_SCALE_LEVELS.includes(savedScale))tableScale=savedScale;}catch{}
function applyTableScale(){
 document.body.dataset.sheetScale=tableScale;
 const button=app.querySelector("#tableScale");if(!button)return;
 const labels={compact:"Tabela −",normal:"Tabela",large:"Tabela +"};
 const descriptions={compact:"Manja tabela",normal:"Standardna veličina tabele",large:"Veća tabela"};
 button.textContent=labels[tableScale];button.setAttribute("aria-label",descriptions[tableScale]);button.setAttribute("aria-pressed",String(tableScale==="large"));
}
function bindTableScale(){
 const button=app.querySelector("#tableScale");if(!button)return;
 button.onclick=()=>{
  tableScale=TABLE_SCALE_LEVELS[(TABLE_SCALE_LEVELS.indexOf(tableScale)+1)%TABLE_SCALE_LEVELS.length];
  try{localStorage.setItem(TABLE_SCALE_KEY,tableScale);}catch{}
  applyTableScale();
 };
 applyTableScale();
}
const SOLO_SAVE_KEY="jumboDiceSoloSaveV1";
const SESSION_KEY="jumboDiceSession";
const DEPLOYMENT_ID_KEY="jumboDiceDeploymentIdV1";
let deploymentChecked=false;
function saveSoloGame(){
 if(!state.soloActive||state.mode!=="solo")return;
 const player=current();
 const snapshot={version:1,columns:state.columns,player:{name:player?.name||"Igrač 1",cells:player?.cells||{},crossedCells:player?.crossedCells||[]},rolls:state.rolls,dice:state.dice,selected:[...state.selected],crossOutMode:state.crossOutMode,announcedRow:state.announcedRow,contraTargetRow:state.contraTargetRow,gameOver:state.gameOver,undoHistory:state.undoHistory};
 try{localStorage.setItem(SOLO_SAVE_KEY,JSON.stringify(snapshot));}catch(error){console.warn("Solo partija nije mogla da se sačuva.",error);}
}
function isValidSoloSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=="object"||!snapshot.player||typeof snapshot.player!=="object")return false;
 const cells=snapshot.player.cells;
 if(!cells||typeof cells!=="object"||Array.isArray(cells)||!Array.isArray(snapshot.player.crossedCells))return false;
 if(!Number.isInteger(snapshot.rolls)||snapshot.rolls<0||snapshot.rolls>5)return false;
 if(!Array.isArray(snapshot.dice)||snapshot.dice.length>6||snapshot.dice.some(value=>!Number.isInteger(value)||value<1||value>6))return false;
 if(!Array.isArray(snapshot.selected)||snapshot.selected.length>5||snapshot.selected.some(index=>!Number.isInteger(index)||index<0||index>=snapshot.dice.length))return false;
 return true;
}
function restoreSoloGame(){
 try{
  const saved=JSON.parse(localStorage.getItem(SOLO_SAVE_KEY)||"null");
  if(!saved||saved.version!==1||!saved.player||!saved.player.cells||typeof saved.player.cells!=="object"||Array.isArray(saved.player.cells)||!Array.isArray(saved.dice)||saved.dice.some(value=>!Number.isInteger(value)||value<1||value>6))return false;
  state.mode="solo";state.columns=normalizeColumnIds(saved.columns);state.players=[{id:"local",name:"Igrač 1",cells:saved.player.cells,crossedCells:Array.isArray(saved.player.crossedCells)?saved.player.crossedCells:[]}];
  state.currentPlayer=0;state.viewPlayer=0;state.rolls=Number.isInteger(saved.rolls)?Math.max(0,Math.min(5,saved.rolls)):0;state.dice=saved.dice.slice(0,6);
  state.selected=new Set(Array.isArray(saved.selected)?saved.selected.filter(i=>Number.isInteger(i)&&i>=0&&i<state.dice.length).slice(0,5):[]);
  state.crossOutMode=saved.crossOutMode===true;state.announcedRow=typeof saved.announcedRow==="string"?saved.announcedRow:null;state.contraTargetRow=typeof saved.contraTargetRow==="string"?saved.contraTargetRow:null;state.gameOver=saved.gameOver===true;
  state.undoHistory=Array.isArray(saved.undoHistory)?saved.undoHistory.filter(isValidSoloSnapshot).slice(-50):[];state.soloActive=true;return true;
 }catch(error){console.warn("Sačuvana solo partija nije mogla da se učita.",error);return false;}
}

function resetLocal(){
 state.mode="solo";state.rolls=0;state.maxRolls=3;state.dice=[];state.selected.clear();state.undoHistory=[];state.players=[{id:"local",name:"Igrač 1",cells:{},crossedCells:[]}];
 state.currentPlayer=0;state.viewPlayer=0;state.pending=null;state.gameOver=false;state.soloActive=false;state.crossOutMode=false;state.announcedRow=null;state.contraTargetRow=null;
}

function gameInProgress(){
 return (state.mode==="solo"&&state.soloActive&&!state.gameOver)||(state.mode==="online"&&state.onlineStarted&&!state.gameOver);
}
function confirmLeaveGame(){
 return !gameInProgress()||window.confirm(state.mode==="solo"?"Solo partija još traje. Napredak će biti sačuvan. Da li želite da izađete?":"Online partija još traje. Možete se ponovo povezati nakon izlaska. Da li želite da izađete?");
}
window.addEventListener("beforeunload",event=>{
 if(!gameInProgress())return;
 event.preventDefault();event.returnValue="";
});

function setup(){
 state.mode="setup";
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>Izaberi način igre</p></div>
 <div class="setup-card home-mode-card"><h2>Odaberi način igre</h2><div class="toolbar">
   <button class="btn primary" id="solo">Solo igra</button>
   <button class="btn" id="online">Online multiplayer</button>
 </div><p class="status">Solo mod je namenjen igranju jednog igrača bez protivničkog AI-ja. Online partija podržava 2–4 igrača.</p></div>
 <section class="home-guide" aria-labelledby="guideTitle">
  <div class="home-guide-heading"><span class="guide-kicker">PRE PRVOG BACANJA</span><h2 id="guideTitle">Kako se igra Jumbo Dice?</h2><p>Cilj je da kroz bacanja popuniš što više polja i osvojiš što više poena. Konačan zbir se otkriva tek kada se partija završi.</p></div>
  <div class="guide-grid">
   <article class="guide-card"><h3>Tok poteza</h3><ol><li>Baci svih 6 kockica. Imaš do 3 bacanja po potezu.</li><li>Posle bacanja označi kockice koje želiš da zadržiš, pa ponovo baci ostale.</li><li>Izaberi dostupno polje u tabeli i potvrdi upis. Možeš izabrati od 1 do 5 kockica; Triling traži najmanje 3 iste, Poker najmanje 4 iste, a za Kentu, Ful i Jamb treba svih 5. Upis sa manje od 5 traži potvrdu.</li><li>Umesto rezultata možeš precrtati dostupno polje. Svaki potez popunjava jedno polje.</li></ol><p class="guide-note">Ako je ostalo samo jedno polje za bodovanje, dobijaš do 5 bacanja.</p></article>
   <article class="guide-card"><h3>Kolone</h3><ul><li><b>Dole:</b> popunjavaj redove od 1 naniže.</li><li><b>Slobodna:</b> izaberi bilo koje dostupno polje.</li><li><b>Gore:</b> popunjavaj od Jamba naviše.</li><li><b>Najava (N):</b> samo posle prvog bacanja; obavezuje te na izabrani red.</li><li><b>Dirigovano (D):</b> igraš u redu koji je prethodni igrač najavio.</li><li><b>R:</b> ručna kolona; može se igrati samo posle prvog bacanja, a Kenta vredi 66. <b>N (↓↑):</b> jedinice naniže, Jamb naviše.</li><li><b>O:</b> otključava se kada su prethodne uključene kolone popunjene. <b>M:</b> automatski uzima najveći rezultat iz prethodnih uključenih kolona.</li></ul><p class="guide-note">U solo igri su uključene osnovne kolone Dole, Slobodna i Gore; dodatne možeš izabrati pre početka.</p></article>
   <article class="guide-card guide-scoring"><h3>Bodovanje ukratko</h3><ul class="scoring-list"><li><b>Redovi 1–6:</b> zbir kockica izabranog broja.</li><li><b>MAX / MIN:</b> zbir svih 5 izabranih kockica.</li><li><b>Kenta:</b> niz 1–5 ili 2–6; vredi 66, 56 ili 46 u zavisnosti od bacanja. U R vredi 66.</li><li><b>Triling:</b> tri iste, zbir +20.</li><li><b>Ful:</b> tri iste i par, zbir +30.</li><li><b>Poker:</b> četiri iste, vrednost te četvorke +40.</li><li><b>Jamb:</b> pet istih, zbir +50.</li><li><b>Bonus:</b> +30 kada je zbir redova 1–6 najmanje 60.</li></ul></article>
  </div>
 </section>
 </section>`;
 app.querySelector("#solo").onclick=soloSetup;
 app.querySelector("#online").onclick=onlineSetup;
}

function columnSetup(title,buttonText,onStart,locked=false){
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>${title}</p></div>
 <div class="setup-card"><h2>Kolone</h2><p class="status">${locked?"Podešavanja su zaključana do kraja tekuće partije.":"Početno su uključene samo obavezne kolone: Gore, Dole i Slobodna. Možete uključiti ostale kolone ili izabrati sve."}</p>
 <div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory||locked?"disabled":""}></label>`).join("")}</div>${locked?'<button class="btn" id="newSolo" type="button">Nova partija</button>':'<button class="btn" id="selectAll" type="button">Izaberi sve</button>'}</div>
 <button class="btn primary" id="start">${buttonText}</button><button class="btn" id="back">Nazad</button>
 </section>`;
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{const selected=new Set(state.columns);x.checked?selected.add(x.dataset.col):selected.delete(x.dataset.col);state.columns=normalizeColumnIds([...selected])});
 const selectAll=app.querySelector("#selectAll");if(selectAll)selectAll.onclick=()=>{state.columns=COLUMN_DEFS.map(c=>c.id);app.querySelectorAll("[data-col]").forEach(input=>{input.checked=true})};
 app.querySelector("#start").onclick=onStart;
 app.querySelector("#back").onclick=()=>{if(!locked||confirmLeaveGame())setup()};
 const newSolo=app.querySelector("#newSolo");if(newSolo)newSolo.onclick=()=>{if(!window.confirm("Nova partija će zameniti sačuvanu solo partiju. Nastaviti?"))return;state.soloActive=false;state.gameOver=false;state.undoHistory=[];state.columns=["down","free","up"];soloSetup()};
}

function soloSetup(){
 if(state.soloActive&&!state.gameOver){
   columnSetup("Solo igra u toku","Nastavi partiju",soloGame,true);
   return;
 }
 state.columns=["down","free","up"];
 columnSetup("Solo igra","Pokreni solo igru",()=>{resetLocal();state.columns=normalizeColumnIds(state.columns);state.mode="solo";state.soloActive=true;soloGame();});
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
 <div class="setup-card"><h2>Kolone</h2><div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory?"disabled":""}></label>`).join("")}</div><button class="btn" id="selectAll" type="button">Izaberi sve</button></div>
 <button class="btn" id="back">Nazad</button></section>`;
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{const selected=new Set(state.columns);x.checked?selected.add(x.dataset.col):selected.delete(x.dataset.col);state.columns=normalizeColumnIds([...selected])});
 app.querySelector("#selectAll").onclick=()=>{state.columns=COLUMN_DEFS.map(c=>c.id);app.querySelectorAll("[data-col]").forEach(input=>{input.checked=true})};
 app.querySelector("#back").onclick=setup;
 if(socket){
   app.querySelector("#createRoom").onclick=()=>socket.emit("room:create",{name:app.querySelector("#playerName").value||"Igrač 1",config:{columns:normalizeColumnIds(state.columns)}});
   app.querySelector("#joinRoom").onclick=()=>socket.emit("room:join",{roomCode:app.querySelector("#roomCodeInput").value,name:app.querySelector("#joinName").value||"Igrač"});
   updateNetworkStatus();
  const token=localStorage.getItem(SESSION_KEY);if(deploymentChecked&&token)socket.emit("room:resume",{sessionToken:token});
 }
}

function updateNetworkStatus(){
 const n=document.getElementById("network");
 if(n)n.textContent=net.connected?"Online: server povezan":"Online: veza prekinuta — pokušavam ponovno povezivanje.";
 const create=app.querySelector("#createRoom"),join=app.querySelector("#joinRoom");
 if(create)create.disabled=!net.connected;if(join)join.disabled=!net.connected;
 const banner=app.querySelector("#connectionStatus"),message=app.querySelector("#connectionMessage"),reconnect=app.querySelector("#reconnect");
 const needsSync=state.mode==="online"&&state.onlineStarted&&net.connected&&!net.synced;
 if(banner){banner.hidden=net.connected&&!needsSync;if(message)message.textContent=needsSync?"Veza je obnovljena; sinhronizujem stanje sobe…":"Veza je prekinuta. Pokušaj automatskog povezivanja je u toku.";if(reconnect){reconnect.hidden=net.connected;reconnect.disabled=net.connected;reconnect.textContent=net.connected?"Sinhronizujem…":"Poveži ponovo";}}
}
if(socket){
 socket.on("connect",()=>{net.connected=true;net.synced=false;updateNetworkStatus();const token=localStorage.getItem("jumboDiceSession");if(deploymentChecked&&token&&state.mode!=="solo")socket.emit("room:resume",{sessionToken:token});if(state.mode==="online")renderOnline()});
 socket.on("disconnect",()=>{net.connected=false;net.synced=false;updateNetworkStatus();if(state.mode==="online")renderOnline()});
 socket.on("connect_error",()=>{net.connected=false;net.synced=false;updateNetworkStatus()});
 socket.on("room:resumed",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken)});
 socket.on("room:created",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Soba je kreirana: "+d.roomCode);});
 socket.on("room:joined",d=>{net.roomCode=d.roomCode;net.playerId=d.playerId;net.sessionToken=d.sessionToken;localStorage.setItem("jumboDiceSession",d.sessionToken);alert("Pridružen si sobi "+d.roomCode);});
 socket.on("game:error",e=>alert(e.message));
 socket.on("state",s=>{net.server=s;net.synced=true;if(state.mode!=="solo")renderServerState(s);updateNetworkStatus()});
}

function newTurn(){state.rolls=0;state.dice=[];state.selected.clear();state.pending=null;state.crossOutMode=false;state.announcedRow=null}

function rulesDialogMarkup(){
 const rules={down:"Popunjava se od 1 naniže.",free:"Bira se bilo koje dostupno polje.",up:"Popunjava se od Jamba naviše.",announced:"Najavljuje se posle prvog bacanja i obavezuje na taj red.",contra:"Dirigovano prati polje koje je protivnik prethodno najavio.",r:"Ručna kolona se igra posle prvog bacanja; Kenta vredi 66.",n:"Popunjava se od jedinica naniže i od Jamba naviše.",o:"Otključava se kada su prethodne uključene kolone popunjene.",m:"Automatski uzima maksimum iz prethodnih uključenih kolona."};
 return `<dialog class="rules-dialog" id="rulesDialog" aria-labelledby="rulesTitle"><div class="rules-dialog-head"><h2 id="rulesTitle">Brza pravila</h2><button class="btn" id="closeRules" type="button" aria-label="Zatvori pravila">Zatvori</button></div><p>Za unos izaberi od 1 do 5 kockica. Triling traži najmanje 3 iste, Poker 4 iste, a Kenta, Ful i Jamb svih 5. Upis sa manje od 5 traži potvrdu.</p><h3>Kolone u ovoj partiji</h3><ul>${defs().map(column=>`<li><b>${escapeHtml(column.name)}:</b> ${rules[column.id]}</li>`).join("")}</ul><h3>Bodovanje</h3><ul><li><b>1–6:</b> zbir kockica odgovarajuće vrednosti.</li><li><b>MAX / MIN:</b> zbir svih 5 izabranih kockica.</li><li><b>Kenta:</b> niz 1–5 ili 2–6; 66 posle prvog, 56 posle drugog i 46 posle trećeg bacanja.</li><li><b>Triling / Ful / Poker / Jamb:</b> zbir +20 / +30 / vrednost četiri iste +40 / zbir +50.</li><li><b>Bonus:</b> 30 poena kada je zbir redova 1–6 najmanje 60.</li></ul><p>Precrtavanje upisuje X. Konačan zbir se prikazuje po završetku partije.</p></dialog>`;
}
function bindRulesGuide(){
 const dialog=app.querySelector("#rulesDialog"),open=app.querySelector("#rulesHelp"),close=app.querySelector("#closeRules");
 if(!dialog||!open||!close)return;
 open.onclick=()=>dialog.showModal();
 close.onclick=()=>dialog.close();
 dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
}

function soloGame(){
 state.mode="solo";
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice <span class="mode-badge">SOLO</span></h1><p>6 kockica · do 3 bacanja (5 u završnom potezu)</p></div><div class="toolbar"><button class="btn" id="tableScale">Tabela</button><button class="btn" id="rulesHelp">Pravila</button><button class="btn" id="setup">Podešavanja</button><button class="btn" id="home">Početni ekran</button></div></header>
 <div class="meta game-status"><span>Na potezu: <b>Igrač 1</b></span><span>Bacanje <b id="count">0/3</b></span><span class="turn-status" id="turnStatus" role="status"></span></div>
 <div class="layout">
 <section class="panel game-controls">
  <div class="dice-grid" id="dice"></div>
  <div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button><button class="btn" id="crossout">Precrtaj polje (0)</button><button class="btn" id="undo" disabled>Vrati potez</button></div>
  <div class="options" id="options"></div><div class="options" id="announceOptions"></div>
 </section>
 <section class="panel game-score"><div class="tabs"><button class="player-tab active">Igrač 1</button></div><div class="sheet-wrap"><div id="sheet"></div></div></section>
 </div>${rulesDialogMarkup()}`;
 bindRulesGuide();
 bindTableScale();
 app.querySelector("#setup").onclick=soloSetup;
 app.querySelector("#home").onclick=()=>{if(confirmLeaveGame())setup()};
 app.querySelector("#roll").onclick=soloRoll;
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.pending=null;state.crossOutMode=false;renderSolo()};
 app.querySelector("#crossout").onclick=()=>{state.crossOutMode=!state.crossOutMode;if(state.crossOutMode)state.selected.clear();renderSolo()};
 app.querySelector("#undo").onclick=undoSoloTurn;
 renderSolo();
}

function maxRollsForLocal(){
 const player=current();
 const remaining=defs().filter(col=>col.id!=="m").reduce((total,col)=>total+scoreRows.filter(row=>!isFilled(player,col.id,row)).length,0);
 return remaining===1?5:3;
}
function soloRoll(){
 if(state.gameOver||state.rolls>=maxRollsForLocal())return;
 state.crossOutMode=false;
 const fresh=rollDice(6);
 if(state.rolls===0)state.dice=fresh;
 else state.dice=state.dice.map((v,i)=>state.selected.has(i)?v:fresh[i]);
 state.rolls++;state.selected.clear();state.pending=null;renderSolo();
}

function soloCandidates(){
 if(state.rolls===0||(!state.crossOutMode&&state.selected.size===0))return [];
 const restrictions=state.contraTargetRow?{contraRow:state.contraTargetRow}:state.announcedRow?{announcedRow:state.announcedRow}:{};
 return availableEntries(state.columns,current()?.cells||{},state.crossOutMode?[]:selectedValues(),{crossOut:state.crossOutMode,...restrictions,rolls:state.rolls});
}
function announceableRows(){
 if(!state.columns.includes("announced"))return [];
 const cells=current()?.cells||{};
 return scoreRows.filter(row=>{
   if(cells[cellKey("announced",row)]!==undefined)return false;
   if(state.columns.includes("contra")){
     const next=(state.currentPlayer+1)%state.players.length;
     if(state.players[next]?.cells?.[cellKey("contra",row)]!==undefined)return false;
   }
   return true;
 });
}
function announceRow(row){
 if(state.rolls!==1||state.announcedRow||state.contraTargetRow||!announceableRows().includes(row))return;
 if(state.mode==="online")socket?.emit("turn:announce",{row});
 else {state.announcedRow=row;renderSolo();}
}
function renderAnnouncementUi(){
 const box=app.querySelector("#announceOptions");if(!box)return;
 const isMyTurn=state.mode!=="online"||(state.players[state.currentPlayer]?.id===net.playerId&&net.connected&&net.synced);
 if(!isMyTurn){box.innerHTML="";return;}
 if(state.contraTargetRow){box.textContent=(state.mode==="online"?"Protivnik je najavio ":"Prethodno si najavio ")+state.contraTargetRow+". Moraš odigrati to polje u koloni Dirigovano.";return;}
 if(state.announcedRow){box.textContent="Najavljeno polje: "+state.announcedRow+". Ovaj potez moraš završiti isključivo u toj ćeliji kolone Najava.";return;}
 let info="";
 const cells=current()?.cells||{};
 if(state.columns.includes("r"))info="R (Ručna) se popunjava posle prvog bacanja; ručna Kenta vredi 66. ";
 const oIndex=state.columns.indexOf("o");
 if(oIndex>=0){const earlier=state.columns.slice(0,oIndex);const ready=earlier.every(col=>scoreRows.every(row=>cells[cellKey(col,row)]!==undefined));if(!ready)info+="Kolona O se otključava tek kada su prethodne uključene kolone popunjene. ";}
 if(state.columns.includes("m"))info+="Kolona M se automatski popunjava maksimumom iz prethodnih uključenih kolona; precrtanje se prenosi kao X. ";
 if(state.columns.includes("contra")){const full=state.columns.includes("announced")&&scoreRows.every(row=>cells[cellKey("announced",row)]!==undefined);info+=(full?"Kolona Najava je popunjena, pa se Dirigovano može igrati slobodno. ":"Dirigovano prati polje koje je protivnik najavio u prethodnom potezu. Bez najave protivnika, ćeliju možeš precrtati. "); }
 if(!state.columns.includes("announced")){box.textContent=info;return;}
 if(state.rolls===0){box.textContent=(info?info+" ":"")+"Najavu možeš izabrati samo posle prvog bacanja; izbor te obavezuje na baš to polje.";return;}
 if(state.rolls>1){box.textContent=(info?info+" ":"")+"Prvo bacanje je prošlo, pa Najava više nije dostupna u ovom potezu.";return;}
 const rows=announceableRows();
 box.textContent=(info?info+" ":"")+"Posle prvog bacanja izaberi polje koje ćeš morati da odigraš:";
 if(!rows.length){const empty=document.createElement("span");empty.className="status options-empty";empty.textContent="Nema polja koja možeš da najaviš.";box.append(empty);return;}
 for(const row of rows){const button=document.createElement("button");button.className="option";button.dataset.announce=row;button.textContent="Najavi · "+row;button.onclick=()=>announceRow(row);box.append(button);}
}
function confirmShortSelection(candidate){
 if(state.crossOutMode||state.selected.size===5)return true;
 return window.confirm("Izabrali ste "+state.selected.size+" od 5 kockica. Upis će se računati samo iz izabranih kockica. Da li želite da nastavite?");
}
function commitOnlineCandidate(candidate){
 if(!net.connected||!net.synced||!confirmShortSelection(candidate))return;
 socket?.emit("turn:commit",{columnId:candidate.colId,row:candidate.row,crossOut:state.crossOutMode});
}


function refreshLocalDerived(player){
 const columns=state.columns;
 const maxIndex=columns.indexOf("m");
 if(maxIndex>=0){
   const sources=columns.slice(0,maxIndex),firstSix=sources.slice(0,6);
   for(const row of scoreRows){
     if(isFilled(player,"m",row)||!sources.length||!sources.every(col=>isFilled(player,col,row)))continue;
     const crossed=firstSix.some(col=>player.crossedCells.includes(cellKey(col,row)));
     player.cells[cellKey("m",row)]=crossed?0:Math.max(...sources.map(col=>Number(player.cells[cellKey(col,row)]||0)));
     if(crossed)player.crossedCells.push(cellKey("m",row));
   }
 }
 for(const col of columns){
   const upper=VALUE_ROWS.map(face=>Number(player.cells[cellKey(col,String(face))]||0)).reduce((a,b)=>a+b,0);
   const top=upper+upperBonus(upper);
   const middle=COMBINATION_ROWS.reduce((total,row)=>total+Number(player.cells[cellKey(col,row)]||0),0);
   player.cells[cellKey(col,"SUM_TOP")]=top;
   player.cells[cellKey(col,"SUM_MID")]=middle;
   player.cells[cellKey(col,"SUM_TOTAL")]=top+middle+Number(player.cells[cellKey(col,"MAX")]||0)-Number(player.cells[cellKey(col,"MIN")]||0);
 }
}
function captureSoloSnapshot(){
 const player=current();
 return {player:{...player,cells:{...player.cells},crossedCells:[...(player.crossedCells||[])]},rolls:state.rolls,dice:[...state.dice],selected:[...state.selected],crossOutMode:state.crossOutMode,announcedRow:state.announcedRow,contraTargetRow:state.contraTargetRow,gameOver:state.gameOver};
}
function undoSoloTurn(){
 const snapshot=state.undoHistory.pop();if(!snapshot)return;
 if(state.rolls>0&&!window.confirm("Vraćanjem poteza odbaciće se trenutno započeto bacanje. Nastaviti?")){state.undoHistory.push(snapshot);return;}
 state.players[state.currentPlayer]=snapshot.player;state.rolls=snapshot.rolls;state.dice=snapshot.dice;state.selected=new Set(snapshot.selected);state.crossOutMode=snapshot.crossOutMode;state.announcedRow=snapshot.announcedRow;state.contraTargetRow=snapshot.contraTargetRow;state.gameOver=snapshot.gameOver;renderSolo();
}
function commitSolo(candidate){
 state.undoHistory.push(captureSoloSnapshot());
 if(state.undoHistory.length>50)state.undoHistory.shift();
 const p=current();
 if(isFilled(p,candidate.colId,candidate.row))return;
 p.cells[cellKey(candidate.colId,candidate.row)]=candidate.value;
 if(candidate.crossOut){p.crossedCells=p.crossedCells||[];p.crossedCells.push(cellKey(candidate.colId,candidate.row));}
 state.contraTargetRow=state.columns.includes("contra")?(state.announcedRow||null):null;
 refreshLocalDerived(p);
 state.pending=null;
 const filled=defs().every(col=>scoreRows.every(row=>isFilled(p,col.id,row)));
 if(filled){state.gameOver=true;newTurn();renderSolo();return;}
 newTurn();renderSolo();
}

function updateTurnStatus(isMyTurn=true){
 const status=app.querySelector("#turnStatus");if(!status)return;
 if(state.mode==="online"&&!net.connected){status.textContent="Veza je prekinuta";status.dataset.state="waiting";return;}
 if(state.mode==="online"&&!net.synced){status.textContent="Sinhronizujem stanje sobe…";status.dataset.state="waiting";return;}
 if(state.gameOver){status.textContent="Partija završena";status.dataset.state="done";return;}
 if(state.contraTargetRow){status.textContent="Obavezno Dirigovano: "+state.contraTargetRow;status.dataset.state="required";return;}
 if(state.announcedRow){status.textContent="Obavezna najava: "+state.announcedRow;status.dataset.state="required";return;}
 if(!isMyTurn){status.textContent="Čeka se potez protivnika";status.dataset.state="waiting";return;}
 if(state.rolls===0){status.textContent="Baci kockice da započneš potez";status.dataset.state="ready";return;}
 const maxRolls=state.mode==="online"?(state.maxRolls||3):maxRollsForLocal();
 if(state.rolls>=maxRolls){status.textContent="Izaberi dostupno polje za upis";status.dataset.state="ready";return;}
 status.textContent="Izaberi kockice ili polje za upis";status.dataset.state="ready";
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
 const count=app.querySelector("#count");if(count)count.textContent=`${state.rolls}/${maxRollsForLocal()}`;
 updateTurnStatus();
 const roll=app.querySelector("#roll");
 if(roll){roll.disabled=state.gameOver||state.rolls>=maxRollsForLocal();roll.textContent=state.rolls>=maxRollsForLocal()?"Sva bacanja iskorišćena":"Baci / ponovo baci";}
 const undo=app.querySelector("#undo");if(undo)undo.disabled=state.undoHistory.length===0;
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
 renderAnnouncementUi();
 renderSoloSheet();
 saveSoloGame();
}

function renderScoreSheet(player,isSelf=true){
 const sheet=app.querySelector("#sheet");if(!sheet)return;
 const columns=defs();
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
 const canChoose=isSelf&&!state.gameOver&&state.rolls>0&&(state.crossOutMode||state.selected.size>0)&&(state.mode!=="online"||(current()?.id===net.playerId&&net.connected&&net.synced));
 const choices=canChoose?soloCandidates():[];
 const hideRow=!state.gameOver&&!isSelf;
 let html=`<table class="sheet premium-sheet" style="--sheet-min-width:${64+52*columns.length}px"><colgroup><col class="label-col">${columns.map(c=>`<col class="data-col col-${c.id}">`).join("")}</colgroup>
 <thead><tr><th class="corner-hatch" aria-label="Kategorija"></th>${columns.map(c=>`<th class="sheet-head ${c.id==="r"?"group-start":""}" title="${c.headerTitle}"><span class="head-symbol">${c.headerSymbol}</span><span class="head-name">${c.headerLabel}</span><span class="head-detail">${c.headerTitle===c.headerLabel?"":c.headerTitle}</span></th>`).join("")}</tr></thead><tbody>`;
 for(const row of rows){
   const hiddenSum=(hideRow&&["SUM_TOP","SUM_MID","SUM_TOTAL"].includes(row.id))||(!state.gameOver&&row.id==="SUM_TOTAL");
   html+=`<tr class="sheet-row ${row.type} ${hiddenSum?"hidden-total-row":""}"><th class="row-label">${row.label}${row.sub?`<small>${row.sub}</small>`:""}</th>`;
   for(const col of columns){
     const v=player?.cells?.[cellKey(col.id,row.id)];
     const optionIndex=choices.findIndex(option=>option.colId===col.id&&option.row===row.id);
     const isAvailable=optionIndex>=0&&v===undefined&&!hiddenSum;
     const crossed=player?.crossedCells?.includes(cellKey(col.id,row.id));
     const shown=hiddenSum?"🔒":crossed?"X":isAvailable?choices[optionIndex].value:(v===undefined?"":v);
     const classNames=["sheet-cell",hiddenSum?"locked-total":isAvailable?"available-entry":(v===undefined?"empty":"filled"),col.id==="o"?"o-column":"",col.id==="r"?"group-start":""].filter(Boolean).join(" ");
     const choiceAttrs=isAvailable?` data-choice="${optionIndex}" role="button" tabindex="0" aria-label="Dostupno polje: ${escapeHtml(col.name)}, ${row.label}, ${choices[optionIndex].value} poena"`:"";
     html+=`<td class="${classNames}" data-cell="${cellKey(col.id,row.id)}"${choiceAttrs}>${shown}</td>`;
   }
   html+="</tr>";
 }
 if(isSelf||state.gameOver){
   const total=columns.reduce((acc,col)=>acc+Number(player?.cells?.[cellKey(col.id,"SUM_TOTAL")]||0),0);
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
 state.mode="online";state.onlineStarted=Boolean(s.started);state.hostId=s.hostId||null;state.onlineUndoAvailable=s.canUndo===true;state.gameOver=Boolean(s.gameOver);state.rolls=s.rolls;state.maxRolls=s.maxRolls||3;state.dice=s.dice||[];state.selected=new Set(s.selection||[]);state.announcedRow=s.announcedRow||null;state.contraTargetRow=s.contraTargetRow||null;
 const idx=s.players.findIndex(p=>p.id===s.currentPlayerId);if(idx>=0)state.currentPlayer=idx;
 state.players=s.players.map(p=>({id:p.id,name:p.name,cells:p.cells||{},crossedCells:p.crossedCells||[]}));
 state.columns=normalizeColumnIds(s.config?.columns||state.columns);
 if(s.started){game();renderOnline();}
 else renderLobbyState(s);
}
function renderLobbyState(s){
 app.innerHTML='<section class="panel setup"><div class="brand"><h1>Jumbo Dice <span class="mode-badge">ONLINE</span></h1><p>Soba '+s.roomCode+'</p></div><div class="setup-card"><h2>Igrači ('+s.players.length+'/4)</h2><div class="status">'+s.players.map(p=>escapeHtml(p.name)+(p.id===s.hostId?' · host':'')+(p.connected?'':' · offline')).join('<br>')+'</div><p class="status">'+(s.players.length<2?'Čeka se još jedan igrač.':'Soba je spremna za početak.')+'</p>'+(s.hostId===net.playerId?'<button class="btn primary" id="startOnline" '+(s.players.length<2?'disabled':'')+'>Pokreni partiju</button>':'<p class="status">Čeka se da host pokrene partiju.</p>')+'</div><button class="btn" id="back">Početni ekran</button></section>';
 app.querySelector("#back").onclick=setup;
 const start=app.querySelector("#startOnline");if(start)start.onclick=()=>socket?.emit("room:start");
}

function game(){
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice <span class="mode-badge">ONLINE</span></h1><p>6 kockica · najviše 5 za rezultat · do 3 bacanja</p></div><div class="toolbar"><button class="btn" id="tableScale">Tabela</button><button class="btn" id="rulesHelp">Pravila</button></div></header>
 <div class="meta game-status"><span>Na potezu: <b>${escapeHtml(current().name)}</b></span><span>Bacanje <b id="count">0/3</b></span><span class="turn-status" id="turnStatus" role="status"></span></div><div class="connection-status" id="connectionStatus" role="status" hidden><span id="connectionMessage"></span><button class="btn" id="reconnect" type="button">Poveži ponovo</button></div><div class="layout"><section class="panel game-controls"><div class="dice-grid" id="dice"></div><div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button><button class="btn" id="crossout">Precrtaj polje (0)</button><button class="btn" id="undo" disabled>Vrati potez</button></div><div class="options" id="options"></div><div class="options" id="announceOptions"></div></section><section class="panel game-score"><div class="tabs" id="tabs"></div><div class="sheet-wrap"><div id="sheet"></div></div></section></div>${rulesDialogMarkup()}`;
 bindRulesGuide();
 bindTableScale();
 const reconnect=app.querySelector("#reconnect");if(reconnect)reconnect.onclick=()=>{reconnect.disabled=true;reconnect.textContent="Povezivanje…";socket?.connect()};
 updateNetworkStatus();
 app.querySelector("#roll").onclick=()=>{if(!net.connected||!net.synced)return;state.crossOutMode=false;socket?.emit("turn:roll")};
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.crossOutMode=false;socket?.emit("turn:select",{indices:[]})};
 app.querySelector("#crossout").onclick=()=>{state.crossOutMode=!state.crossOutMode;if(state.crossOutMode){state.selected.clear();socket?.emit("turn:select",{indices:[]})}renderOnline()};
 app.querySelector("#undo").onclick=()=>{if(!net.connected||!net.synced||!state.onlineUndoAvailable||state.hostId!==net.playerId)return;if((state.rolls>0||state.announcedRow)&&!window.confirm("Vraćanjem poteza odbaciće se trenutni potez. Nastaviti?"))return;socket?.emit("turn:undo")};
 renderOnline();
}

function renderOnline(){
 const d=app.querySelector("#dice");if(!d)return;
 const isMyTurn=state.players[state.currentPlayer]?.id===net.playerId;
 const canAct=isMyTurn&&net.connected&&net.synced;
 updateNetworkStatus();
 d.innerHTML=state.dice.map((v,i)=>'<button class="die '+(state.selected.has(i)?"selected":"")+'" data-i="'+i+'" '+(!canAct||state.gameOver||state.rolls===0?"disabled":"")+'>'+v+'</button>').join("");
 d.querySelectorAll(".die").forEach(b=>b.onclick=()=>{
   if(!canAct||state.gameOver||state.rolls===0)return;
   state.crossOutMode=false;
   const i=+b.dataset.i;
   state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);
   socket?.emit("turn:select",{indices:[...state.selected]});
 });
 const c=app.querySelector("#count");if(c)c.textContent=`${state.rolls}/${state.maxRolls||3}`;
 updateTurnStatus(canAct);
 const roll=app.querySelector("#roll"),clear=app.querySelector("#clear"),crossout=app.querySelector("#crossout");
 const undo=app.querySelector("#undo");if(undo){undo.disabled=!net.connected||!net.synced||state.hostId!==net.playerId||!state.onlineUndoAvailable;undo.title=state.hostId===net.playerId?"Vrati poslednji potez cele sobe":"Samo domaćin može da vrati potez";}
 if(roll){roll.disabled=!canAct||state.gameOver||state.rolls>=(state.maxRolls||3);roll.textContent=state.rolls>=(state.maxRolls||3)?"Sva bacanja iskorišćena":"Baci / ponovo baci";}
 if(clear)clear.disabled=!canAct||state.gameOver||state.rolls===0;
 if(crossout){crossout.disabled=!canAct||state.gameOver||state.rolls===0;crossout.classList.toggle("crossout-active",state.crossOutMode);crossout.textContent=state.crossOutMode?"Otkaži precrtavanje":"Precrtaj polje (0)";}
 const tabs=app.querySelector("#tabs");tabs.innerHTML=state.players.map((p,i)=>'<button class="player-tab '+(i===state.currentPlayer?'active':'')+'">'+escapeHtml(p.name)+'</button>').join("");
 const box=app.querySelector("#options");
 if(box){
   let hint="";
   if(state.gameOver)hint="Partija je završena. Konačan rezultat je prikazan na tabeli.";
   else if(!canAct)hint=net.connected?"Sinhronizujem stanje sobe…":"Veza je prekinuta. Sačekaj ponovno povezivanje.";
   else if(!isMyTurn)hint="Sačekaj svoj potez.";
   else if(state.rolls===0)hint="Prvo baci kockice. Za bodovanje izaberi 1–5 kockica.";
   else if(state.crossOutMode)hint="Izaberi dostupno polje koje želiš da precrtaš. U polje će biti upisana 0.";
   else if(state.selected.size===0)hint="Izaberi 1–5 kockica za bodovanje ili označi kockice za sledeće bacanje.";
   else hint=`Izabrano: ${state.selected.size}/5. Sa manje od 5 kockica prikazaće se upozorenje pri upisu.`;
   const ops=state.gameOver||!canAct?[]:soloCandidates();
   const cards=ops.map((o,i)=>'<button class="option" data-op="'+i+'"><b>'+escapeHtml(o.colName)+' · '+escapeHtml(o.row)+'</b><span>'+o.value+'</span></button>').join("");
   const empty=!state.gameOver&&canAct&&state.rolls>0&&!state.crossOutMode&&state.selected.size>0&&!ops.length?"Nema dostupnih polja za izabrani rezultat.":"";
   box.innerHTML='<span class="status">'+hint+'</span>'+(cards||(empty?'<span class="status options-empty">'+empty+'</span>':""));
   box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>commitOnlineCandidate(ops[+b.dataset.op]));
 }
 renderAnnouncementUi();
 renderSoloSheet();
}

async function startApp(){
 try{
  const response=await fetch("/health",{cache:"no-store"});
  if(!response.ok)throw new Error("Server verzija nije dostupna.");
  const {deploymentId}=await response.json();
  if(typeof deploymentId==="string"&&deploymentId){
   const previousDeployment=localStorage.getItem(DEPLOYMENT_ID_KEY);
   if(previousDeployment!==deploymentId){
    localStorage.removeItem(SOLO_SAVE_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(DEPLOYMENT_ID_KEY,deploymentId);
   }
  }
 }catch(error){console.warn("Verzija servera nije proverena; sačuvana partija je zadržana.",error);}
 deploymentChecked=true;
 if(restoreSoloGame())soloGame();else setup();
}
startApp();
