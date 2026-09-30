const socket=window.io ? window.io(window.location.origin) : null;
function emitTurn(event, payload = {}) {
  socket?.emit(event, { ...payload, turnId: net.server?.turnId, requestId: crypto.randomUUID() });
}
const net={connected:false,synced:false,roomCode:null,playerId:null,sessionToken:null,server:null};
import{COLUMN_DEFS,VALUE_ROWS,COMBINATION_ROWS,SCORE_ROWS as scoreRows,rollDice,availableEntries,upperBonus,normalizeColumnIds,calculateColumnSums,summarizeFinalResults}from"./game.js";
import{readInviteCode,parseRoomInput,buildInviteUrl}from"./invite.js";
import{LANGUAGE_KEY,detectLanguage,translateText,createDomTranslator}from"./i18n.js";

const state={
 mode:"setup",rolls:0,maxRolls:3,dice:[],selected:new Set(),diceRollAnimation:false,undoHistory:[],columns:["down","free","up"],
 currentPlayer:0,players:[{id:"local",name:"Igrač 1",cells:{},crossedCells:[]} ],activePlayers:1,viewPlayer:0,pending:null,gameOver:false,soloActive:false,crossOutMode:false,announcedRow:null,contraTargetRow:null,onlineStarted:false,hostId:null,turnHistory:[],
};
const app=document.getElementById("app");
let language=detectLanguage(navigator.languages?.length?navigator.languages:[navigator.language]);
try{const saved=localStorage.getItem(LANGUAGE_KEY)||localStorage.getItem("jumboDiceLanguageV1");if(saved==="sr"||saved==="en")language=saved;}catch{}
document.documentElement.lang=language;
document.title=language==="en"?"jamb.arena — Time for Yamb":"jamb.arena — Vreme je za jamb";
const domTranslator=createDomTranslator(app,language);
let leavingForHub=false;
const ask=message=>window.confirm(translateText(message,language));
const inform=message=>window.alert(translateText(message,language));
function changeLanguage(){
 language=language==="sr"?"en":"sr";
 try{localStorage.setItem(LANGUAGE_KEY,language);}catch{}
 document.documentElement.lang=language;
 document.title=language==="en"?"jamb.arena — Time for Yamb":"jamb.arena — Vreme je za jamb";
 const button=app.querySelector('[data-nav="language"]');
 if(button){button.innerHTML='<span aria-hidden="true">🌐</span> '+(language==="sr"?"English":"Srpski");button.setAttribute("aria-label",language==="sr"?"Promeni jezik na engleski":"Switch language to Serbian");}
 domTranslator.setLanguage(language);
}
const DIE_PIPS={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
let brandDieValue=5,brandClicks=0;
const brandIsStar=()=>brandClicks>0&&brandClicks%10===0;
function brandFaceMarkup(){
 return brandIsStar()?'<span class="brand-star" aria-hidden="true">★</span>':`<span class="brand-face" aria-hidden="true">${DIE_PIPS[brandDieValue].map(pos=>`<i class="brand-pip pip-${pos}"></i>`).join("")}</span>`;
}
const brandDieLabel=()=>brandIsStar()?"Zvezdica! Klikni za novo bacanje.":`Kockica pokazuje ${brandDieValue}. Klikni za novo bacanje.`;
function appNavMarkup(mode){
 return `<header class="site-nav"><div class="site-nav-inner">
  <div class="site-brand"><button type="button" class="brand-mark" id="brandDie" aria-label="${brandDieLabel()}" title="Baci kockicu">${brandFaceMarkup()}</button><button type="button" class="brand-home" data-nav="play" aria-label="jamb.arena početna strana"><span class="brand-words"><strong>jamb<span>.arena</span></strong><small>JAMB STO</small></span></button></div>
  <span class="nav-caption">IGRA</span><nav class="main-nav" aria-label="Glavna navigacija"><button type="button" data-nav="hub"><span aria-hidden="true">▦</span> Sve igre</button><button type="button" data-nav="play" ${["POČETNA","SOLO","KOLONE"].includes(mode)?'aria-current="page"':""}><span aria-hidden="true">⚄</span> Igraj jamb</button><button type="button" data-nav="online" ${mode.startsWith("ONLINE")?'aria-current="page"':""}><span aria-hidden="true">◎</span> Online sto</button><button type="button" id="rulesHelp" data-nav="rules"><span aria-hidden="true">?</span> Pravila igre</button><button type="button" data-nav="language" aria-label="${language==="sr"?"Promeni jezik na engleski":"Switch language to Serbian"}"><span aria-hidden="true">🌐</span> ${language==="sr"?"English":"Srpski"}</button></nav>
  <div class="site-nav-tip"><span>SAVET ZA IGRU</span><strong>Igraj strateški.</strong><p>Sačuvaj jaka bacanja za najavu, a slobodnu kolonu koristi mudro.</p></div><span class="nav-context"><i aria-hidden="true"></i>${escapeHtml(mode)}</span>
 </div></header>`;
}
function diceButtonMarkup(value,index,held,disabled){
 const stateLabel=held?"Sačuvana":"Sačuvaj";
 const accessibleState=held?"sačuvana":"nije sačuvana";
  const empty=!value;
  return '<button type="button" class="die '+(held?"selected":"")+(empty?" die-placeholder":"")+(state.diceRollAnimation?" die-arrive":"")+'" data-i="'+index+'" aria-pressed="'+String(held)+'" aria-label="Kockica '+(index+1)+(empty?", još nije bačena":", "+value+"; "+accessibleState)+'" title="'+(empty?"Baci kockice":held?"Vrati u bacanje":"Sačuvaj") + '" '+(disabled?"disabled":"")+'><span class="die-face" aria-hidden="true">'+(DIE_PIPS[value]||[]).map(pos=>'<i class="pip pip-'+pos+'"></i>').join("")+'</span><span class="die-state">'+(empty?"Spremna":stateLabel)+'</span></button>';
}
app.addEventListener("click",event=>{
 const brandDie=event.target.closest("#brandDie");
 if(brandDie){
  brandClicks++;
  if(!brandIsStar())brandDieValue=([1,2,3,4,5,6].filter(value=>value!==brandDieValue))[Math.floor(Math.random()*5)];
  brandDie.innerHTML=brandFaceMarkup();
  brandDie.setAttribute("aria-label",brandDieLabel());
  return;
 }
 const button=event.target.closest("[data-nav]");
 if(!button)return;
 if(button.dataset.nav==="language"){changeLanguage();return;}
 if(button.dataset.nav==="hub"){
  if(!confirmLeaveGame())return;
  saveSoloGame();
  leavingForHub=true;
  window.location.assign("/");
  return;
 }
 if(button.dataset.nav==="play"){
  if(state.mode==="online"&&net.roomCode){leaveOnlineRoom();return;}
  if(state.mode==="solo"&&state.soloActive&&!state.gameOver&&!confirmLeaveGame())return;
  setup();
 }else if(button.dataset.nav==="online"){
  if(state.mode==="online"&&net.roomCode)return;
  if(state.mode==="solo"&&state.soloActive&&!state.gameOver&&!confirmLeaveGame())return;
  onlineSetup();
 }else if(button.dataset.nav==="rules"){
  showRulesGuide();
 }
});

const defs=()=>state.columns.map(id=>COLUMN_DEFS.find(c=>c.id===id)).filter(Boolean);
const escapeHtml=value=>String(value).replace(/[&<>"\']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[ch]));
const current=()=>state.players[state.currentPlayer];
const cellKey=(col,row)=>col+"::"+row;
const selectedValues=()=>[...state.selected].map(i=>state.dice[i]);
const isFilled=(p,col,row)=>p?.cells?.[cellKey(col,row)]!==undefined;

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
const invitedRoomCode=()=>readInviteCode(window.location.search);
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
 return !gameInProgress()||ask(state.mode==="solo"?"Solo partija još traje. Napredak će biti sačuvan. Da li želite da izađete?":"Online partija još traje. Možete se ponovo povezati nakon izlaska. Da li želite da izađete?");
}
function resetOnlineSession(){
 try{localStorage.removeItem(SESSION_KEY);}catch{}
 net.roomCode=null;net.playerId=null;net.sessionToken=null;net.server=null;net.synced=false;
 state.onlineStarted=false;state.crossOutMode=false;state.selected.clear();
 setup();
}
function leaveOnlineRoom(){
 if(state.onlineStarted&&!ask("Napuštanjem aktivne partije soba će se zatvoriti za sve igrače. Nastaviti?"))return;
 if(!net.roomCode){setup();return;}
 if(net.connected)socket?.emit("room:leave");
 else resetOnlineSession();
}
window.addEventListener("beforeunload",event=>{
 if(leavingForHub||!gameInProgress())return;
 event.preventDefault();event.returnValue="";
});

function setup(){
 state.mode="setup";
 app.innerHTML=`${appNavMarkup("POČETNA")}<section class="online-setup home-choice">
  <header class="online-setup-heading"><span class="eyebrow">DOBRO DOŠAO U ARENU</span><h1>Vreme je za jamb.</h1><p>Odaberi kako želiš da igraš.</p></header>
  <div class="mode-list"><article class="online-setup-card mode-row"><span class="mode-icon" aria-hidden="true">⚄</span><div class="mode-description"><h2>Solo igra</h2><p>Bez čekanja. Izaberi kolone i započni partiju koja se čuva u pregledaču.</p></div><button class="btn primary" id="solo" type="button">Igraj solo →</button></article>
  <article class="online-setup-card mode-row"><span class="mode-icon mode-icon-muted" aria-hidden="true">◎</span><div class="mode-description"><h2>Online multiplayer</h2><p>Napravi sobu ili unesi kod prijatelja. Partija je za 2–4 igrača.</p></div><button class="btn" id="online" type="button">Idi na online sto →</button></article></div>
  <div class="home-rules-teaser"><span>Prvi put igraš?</span><button class="btn" id="openRules" type="button">Pogledaj pravila igre →</button></div></section>`;
 app.querySelector("#solo").onclick=soloSetup;
 app.querySelector("#online").onclick=onlineSetup;
 app.querySelector("#openRules").onclick=showRulesGuide;
}

function columnOptionsMarkup(locked=false){
 return COLUMN_DEFS.map(c=>`<label class="toggle"><span class="column-option-name"><b class="column-option-symbol" aria-hidden="true">${c.headerSymbol}</b>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory||locked?"disabled":""}></label>`).join("");
}
function bindColumnOptions(){
 app.querySelectorAll("[data-col]").forEach(input=>input.onchange=()=>{
  const selected=new Set(state.columns);
  input.checked?selected.add(input.dataset.col):selected.delete(input.dataset.col);
  state.columns=normalizeColumnIds([...selected]);
 });
 const selectAll=app.querySelector("#selectAll");
 if(selectAll)selectAll.onclick=()=>{state.columns=COLUMN_DEFS.map(c=>c.id);app.querySelectorAll("[data-col]").forEach(input=>{input.checked=true})};
}

function columnSetup(buttonText,onStart,locked=false){
 app.innerHTML=`${appNavMarkup("SOLO")}<section class="online-setup solo-setup">
  <header class="online-setup-heading"><span class="eyebrow">IGRAJ SAMOSTALNO</span><h1>Solo igra</h1><p>${locked?"Tvoja partija je sačuvana. Nastavi tamo gde si stao.":"Izaberi kolone i započni svoju partiju."}</p></header>
  <div class="online-setup-grid"><section class="online-setup-card create-room-card"><div class="online-card-heading"><span class="eyebrow">${locked?"PARTIJA U TOKU":"TVOJA PARTIJA"}</span><h2>${locked?"Nastavi igru":"Napravi solo igru"}</h2><p>${locked?"Kolone su zaključane do završetka ove partije.":"Tri osnovne kolone su već izabrane. Dodaj ostale po želji."}</p></div>
   <div class="online-column-heading"><div><span class="eyebrow">PODEŠAVANJA IGRE</span><h3>Kolone listića</h3></div>${locked?"":'<button class="btn" id="selectAll" type="button">Izaberi sve</button>'}</div>
   <div class="setup-grid online-column-grid">${columnOptionsMarkup(locked)}</div>
   <button class="btn primary online-submit" id="start" type="button">${buttonText}</button>${locked?'<button class="btn solo-new" id="newSolo" type="button">Nova partija</button>':""}</section>
   <aside class="online-setup-card solo-info-card"><div class="online-card-heading"><span class="eyebrow">KAKO SE IGRA</span><h2>Tvoj tempo</h2><p>Solo partija se igra lokalno i automatski čuva u ovom pregledaču.</p></div><ul><li>Bacaš šest kockica i biraš do pet za upis.</li><li>Imaš do tri bacanja po potezu.</li><li>Izabrane kockice ostaju sačuvane pri sledećem bacanju.</li><li>Popunjavaš jedan red listića u svakom potezu.</li></ul></aside></div>
  <button class="btn online-back" id="back" type="button">← Nazad</button></section>`;
 bindColumnOptions();
 app.querySelector("#start").onclick=onStart;
 app.querySelector("#back").onclick=()=>{if(!locked||confirmLeaveGame())setup()};
 const newSolo=app.querySelector("#newSolo");if(newSolo)newSolo.onclick=()=>{if(!ask("Nova partija će zameniti sačuvanu solo partiju. Nastaviti?"))return;state.soloActive=false;state.gameOver=false;state.undoHistory=[];state.columns=["down","free","up"];soloSetup()};
}

function soloSetup(){
 if(!state.soloActive)restoreSoloGame();
 if(state.soloActive&&!state.gameOver){
   columnSetup("Nastavi partiju",soloGame,true);
   return;
 }
 state.columns=["down","free","up"];
 columnSetup("Pokreni solo igru",()=>{resetLocal();state.columns=normalizeColumnIds(state.columns);state.mode="solo";state.soloActive=true;soloGame();});
}

function onlineSetup(){
 state.mode="setup-online";
 state.columns=["down","free","up"];
 app.innerHTML=`${appNavMarkup("ONLINE STO")}<section class="online-setup">
  <header class="online-setup-heading"><span class="eyebrow">IGRAJ SA DRUGIMA</span><h1>Online sto</h1><p>Napravi sobu ili se pridruži prijateljima pomoću linka ili koda.</p><div id="network" class="online-network" role="status">Povezivanje sa serverom…</div></header>
  <div class="online-setup-grid"><section class="online-setup-card create-room-card"><div class="online-card-heading"><span class="eyebrow">TVOJA PARTIJA</span><h2>Napravi sobu</h2><p>Izaberi kolone, pa podeli link sobe sa ostalim igračima.</p></div>
   <label class="online-field" for="playerName">Tvoje ime<input id="playerName" placeholder="Ime igrača" value="${language==="en"?"Player 1":"Igrač 1"}" autocomplete="nickname"></label>
   <div class="online-column-heading"><div><span class="eyebrow">PODEŠAVANJA IGRE</span><h3>Kolone listića</h3></div><button class="btn" id="selectAll" type="button">Izaberi sve</button></div>
   <div class="setup-grid online-column-grid">${columnOptionsMarkup()}</div>
   <button class="btn primary online-submit" id="createRoom" type="button">Kreiraj sobu</button></section>
  <section class="online-setup-card join-room-card"><div class="online-card-heading"><span class="eyebrow">IMAŠ POZIVNICU?</span><h2>Pridruži se sobi</h2><p>Unesi kod ili nalepi link koji ti je poslao domaćin.</p></div>
   <label class="online-field" for="roomCodeInput">Kod ili link<input id="roomCodeInput" placeholder="KOD ILI LINK" autocomplete="off" autocapitalize="characters" value="${escapeHtml(invitedRoomCode())}"></label>
   <label class="online-field" for="joinName">Tvoje ime<input id="joinName" placeholder="Ime igrača" value="${language==="en"?"Player 2":"Igrač 2"}" autocomplete="nickname"></label>
   <button class="btn online-submit" id="joinRoom" type="button">Pridruži se sobi</button></section></div>
  <button class="btn online-back" id="back" type="button">← Nazad</button></section>`;
 bindColumnOptions();
 app.querySelector("#back").onclick=setup;
 if(socket){
   app.querySelector("#createRoom").onclick=()=>socket.emit("room:create",{name:app.querySelector("#playerName").value||"Igrač 1",config:{columns:normalizeColumnIds(state.columns)}});
   app.querySelector("#joinRoom").onclick=()=>socket.emit("room:join",{roomCode:parseRoomInput(app.querySelector("#roomCodeInput").value),name:app.querySelector("#joinName").value||"Igrač"});
   updateNetworkStatus();
  const token=localStorage.getItem(SESSION_KEY);if(deploymentChecked&&token&&!invitedRoomCode())socket.emit("room:resume",{sessionToken:token});
 }
}

function updateNetworkStatus(){
 const n=document.getElementById("network");
 if(n)n.textContent=net.connected?"Server povezan":"Veza prekinuta — pokušavam ponovno povezivanje.";
 const create=app.querySelector("#createRoom"),join=app.querySelector("#joinRoom");
 if(create)create.disabled=!net.connected;if(join)join.disabled=!net.connected;
 const banner=app.querySelector("#connectionStatus"),message=app.querySelector("#connectionMessage"),reconnect=app.querySelector("#reconnect");
 const needsSync=state.mode==="online"&&state.onlineStarted&&net.connected&&!net.synced;
 if(banner){banner.hidden=net.connected&&!needsSync;if(message)message.textContent=needsSync?"Veza je obnovljena; sinhronizujem stanje sobe…":"Veza je prekinuta. Pokušaj automatskog povezivanja je u toku.";if(reconnect){reconnect.hidden=net.connected;reconnect.disabled=net.connected;reconnect.textContent=net.connected?"Sinhronizujem…":"Poveži ponovo";}}
}
function acceptRoomSession(data,message=""){
 net.roomCode=data.roomCode;net.playerId=data.playerId;net.sessionToken=data.sessionToken;
 localStorage.setItem(SESSION_KEY,data.sessionToken);
 if(invitedRoomCode()){
  const url=new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
 }
 if(message)inform(message+data.roomCode);
}
if(socket){
 socket.on("connect",()=>{net.connected=true;net.synced=false;updateNetworkStatus();const token=localStorage.getItem(SESSION_KEY);if(deploymentChecked&&token&&state.mode!=="solo"&&!invitedRoomCode())socket.emit("room:resume",{sessionToken:token});if(state.mode==="online")renderOnline()});
 socket.on("disconnect",()=>{net.connected=false;net.synced=false;updateNetworkStatus();if(state.mode==="online")renderOnline()});
 socket.on("connect_error",()=>{net.connected=false;net.synced=false;updateNetworkStatus()});
 socket.on("room:resumed",d=>acceptRoomSession(d));
 socket.on("room:created",d=>acceptRoomSession(d,"Soba je kreirana: "));
 socket.on("room:joined",d=>acceptRoomSession(d,"Pridružen si sobi "));
 socket.on("room:left",resetOnlineSession);
 socket.on("room:closed",d=>{resetOnlineSession();inform(d?.message||"Soba je zatvorena.")});
 socket.on("game:error",e=>inform(e.message));
 socket.on("state",s=>{net.server=s;net.synced=true;if(state.mode!=="solo")renderServerState(s);updateNetworkStatus()});
}

function newTurn(){state.rolls=0;state.dice=[];state.selected.clear();state.pending=null;state.crossOutMode=false;state.announcedRow=null}

function rulesDialogMarkup(){
 return `<dialog class="rules-dialog" id="rulesDialog" aria-labelledby="rulesTitle"><div class="rules-dialog-head"><div><span class="eyebrow">PRAVILA IGRE</span><h2 id="rulesTitle">Kako se igra jamb?</h2><p>Izaberi temu sa leve strane.</p></div><button class="btn" id="closeRules" type="button" aria-label="Zatvori pravila">Zatvori</button></div>
 <div class="rules-dialog-layout"><nav class="rules-topic-nav" role="tablist" aria-label="Teme pravila">${RULE_TOPICS.map((topic,index)=>`<button class="rules-topic-tab ${index===0?"active":""}" type="button" role="tab" id="rulesTab-${topic.id}" data-rules-topic="${topic.id}" aria-selected="${index===0}" aria-controls="rulesTopicPanel" tabindex="${index===0?0:-1}">${topic.label}</button>`).join("")}</nav>
 <section class="rules-topic-panel" id="rulesTopicPanel" role="tabpanel" aria-labelledby="rulesTab-basics" tabindex="0">${rulesTopicMarkup("basics")}</section></div></dialog>`;
}
const RULE_TOPICS=[{id:"basics",label:"Početak igre"},{id:"turn",label:"Tok poteza"},{id:"columns",label:"Kolone listića"},{id:"scores",label:"Bodovanje"},{id:"special",label:"Posebna pravila"}];
function rulesTopicMarkup(topic){
 const card=(title,description,symbol="")=>`<article class="rules-item"><span class="rules-item-symbol" aria-hidden="true">${symbol}</span><h3>${title}</h3><p>${description}</p></article>`;
 if(topic==="basics")return `<span class="eyebrow">POGLAVLJE 01 / 05</span><h3>Početak igre</h3><p>Jamb se igra sa šest kockica. Za rezultat biraš od jedne do pet; cilj je da popuniš listić i osvojiš što više poena.</p><div class="rules-item-grid">${card("Solo igra","Igraš samostalno. Partija se čuva u ovom pregledaču.","⚄")}${card("Online sto","U sobi igra 2–4 igrača. Domaćin bira kolone i pokreće partiju.","◎")}${card("Kolone","Dole, Slobodna i Gore su osnovne. Ostale možeš uključiti pre početka partije.","↓")}${card("Konačan zbir","Ukupan rezultat se prikazuje kada se partija završi.","Σ")}</div>`;
 if(topic==="turn")return `<span class="eyebrow">POGLAVLJE 02 / 05</span><h3>Tok poteza</h3><p>U svakom potezu bacaš kockice, biraš koje čuvaš i upisuješ jedan rezultat.</p><div class="rules-item-grid">${card("1 · Baci kockice","Baci svih šest kockica. Imaš do tri bacanja po potezu.","1")}${card("2 · Sačuvaj izbor","Označene kockice ostaju sačuvane pri sledećem bacanju. Možeš ih ponovo osloboditi.","2")}${card("3 · Izaberi polje","Za upis izaberi 1–5 kockica. Zelena polja u listiću pokazuju dostupne upise.","3")}${card("4 · Potvrdi potez","Upiši rezultat ili precrtaj dostupno polje. Potez popunjava jedno polje.","4")}</div><div class="rules-note">Kada ostane samo jedno polje za bodovanje, dostupno je do pet bacanja.</div>`;
 if(topic==="columns"){
  const descriptions={down:"Od jedinica prema Jambu, redom naniže.",free:"Bilo koje dostupno polje.",up:"Od Jamba prema jedinicama, redom naviše.",announced:"Posle prvog bacanja najavljuješ red za upis.",contra:"Prati red koji je protivnik najavio u prethodnom potezu.",r:"Upis posle prvog bacanja; ručna Kenta vredi 66.",n:"Od jedinica naniže i od Jamba naviše.",o:"Otključava se po završetku prethodnih uključenih kolona.",m:"Upisuje se samo najveći mogući rezultat za izabrani red."};
  return `<span class="eyebrow">POGLAVLJE 03 / 05</span><h3>Kolone listića</h3><p>Svaka kolona određuje redosled ili uslov upisa. U igri su dostupna polja označena zelenom bojom.</p><div class="rules-item-grid">${COLUMN_DEFS.map(column=>card(escapeHtml(column.name),descriptions[column.id],column.headerSymbol)).join("")}</div><div class="rules-note">Osnovne kolone su Dole, Slobodna i Gore. Ostale biraš pre početka partije.</div>`;
 }
 if(topic==="scores")return `<span class="eyebrow">POGLAVLJE 04 / 05</span><h3>Bodovanje</h3><p>Rezultat zavisi od izabranih kockica i reda u koji ga upisuješ.</p><div class="rules-item-grid">${card("Jedinice–šestice","Sabiraju se samo izabrane kockice sa brojem tog reda.","1–6")}${card("Maksimum / Minimum","Dostupni su samo kada označiš tačno pet kockica; upisuje se zbir tih pet.","±")}${card("Kenta","Niz 1–5 ili 2–6: 66, 56 ili 46 poena, prema broju bacanja.","K")}${card("Triling","Zbir tačno tri iste kockice + 20 poena.","3")}${card("Ful","Tri iste i par u pet kockica: zbir svih pet + 30.","F")}${card("Poker","Četiri iste: zbir te četiri kockice + 40.","4")}${card("Jamb","Pet istih: zbir svih pet + 50.","5")}${card("Bonus","Zbir redova 1–6 dobija 30 poena kada dostigne 60.","+")}</div>`;
 return `<span class="eyebrow">POGLAVLJE 05 / 05</span><h3>Posebna pravila</h3><p>Neke kolone i upisi imaju dodatne uslove.</p><div class="rules-item-grid">${card("Najava","Posle prvog bacanja izaberi red. Rezultat upisuješ u taj red posle narednog bacanja.","N")}${card("Dirigovano","Igra se u redu koji je prethodni protivnik najavio. Kada je Najava popunjena, moguć je slobodan unos.","D")}${card("Ručna kolona","Upisuje se posle prvog bacanja. Kenta u ovoj koloni uvek vredi 66.","R")}${card("Obavezna i Maksimalna","Obavezna se otključava po završetku prethodnih kolona; u Maksimalnu se upisuje samo najveći mogući rezultat.","O·M")}${card("Precrtavanje","Upisuje X umesto rezultata u dostupno polje.","X")}${card("Kratak izbor","Upis sa manje od pet izabranih kockica traži potvrdu.","1–4")}</div>`;
}
function bindRulesGuide(){
 const dialog=app.querySelector("#rulesDialog"),close=app.querySelector("#closeRules");
 if(!dialog||!close)return;
 close.onclick=()=>dialog.close();
 dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
 const tabs=[...dialog.querySelectorAll("[data-rules-topic]")];
 function selectTopic(tab,focus=false){
  tabs.forEach(item=>{const selected=item===tab;item.classList.toggle("active",selected);item.setAttribute("aria-selected",String(selected));item.tabIndex=selected?0:-1});
  const panel=dialog.querySelector("#rulesTopicPanel");panel.innerHTML=rulesTopicMarkup(tab.dataset.rulesTopic);panel.setAttribute("aria-labelledby",tab.id);panel.scrollTop=0;
  if(window.innerWidth<=820)tab.scrollIntoView({block:"nearest",inline:"center"});
  if(focus)tab.focus();
 }
 tabs.forEach((tab,index)=>{tab.onclick=()=>selectTopic(tab);tab.onkeydown=event=>{if(!["ArrowDown","ArrowUp","ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowDown"||event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;selectTopic(tabs[next],true)}});
}
function showRulesGuide(){
 let dialog=app.querySelector("#rulesDialog");
 if(!dialog){app.insertAdjacentHTML("beforeend",rulesDialogMarkup());bindRulesGuide();dialog=app.querySelector("#rulesDialog")}
 if(!dialog.open)dialog.showModal();
}

function gameMarkup(online){
 return `${appNavMarkup(online?"ONLINE":"SOLO")}<section class="match-heading"><div class="match-title"><span class="eyebrow">${online?"ONLINE ARENA":"DOBRO DOŠAO U ARENU"}</span><h1>Vreme je za jamb.</h1><p>Baci kockice, složi kombinaciju i popuni svoju tabelu.</p></div><div class="toolbar"><button class="btn" id="tableScale">Tabela</button>${online?'<button class="btn" id="leaveRoom">Napusti partiju</button>':'<button class="btn" id="setup">Podešavanja</button><button class="btn" id="home">Početni ekran</button>'}</div></section>
 <div class="meta game-status"><span>Na potezu: <b>${online?escapeHtml(current().name):"Igrač 1"}</b></span><span>Bacanje <b id="count">0 od 3</b></span>${online?'<span class="live-pill"><i aria-hidden="true"></i>Uživo</span>':'<span class="live-pill mode-status">Solo</span>'}</div>
 <div class="layout ${state.columns.length===COLUMN_DEFS.length?"sheet-expanded":""}" style="--score-panel-width:${Math.min(805,Math.max(460,190+70*state.columns.length))}px">
  <div class="game-main">
    <section class="panel game-score"><div class="score-heading"><div><span class="eyebrow">${online?"TABELA PARTIJE":"TVOJA TABELA"}</span><h2>Jamb listić</h2><p>Zelena polja su dostupna za upis. Izaberi rezultat u tabeli ili na desnoj strani.</p></div></div><div class="sheet-wrap"><div id="sheet"></div></div><p class="sheet-foot">↓ Redom naniže · ↑ Redom naviše</p></section>
  </div>
  <aside class="panel game-sidebar" aria-label="Status i pomoć za partiju">
    <section class="panel game-controls"><div class="section-heading"><div><span class="eyebrow" id="diceTurnLabel">${online?"TRENUTNO BACANJE":"TVOJ POTEZ"}</span><h2>Bacanje kockica</h2></div><span class="rolls-label">6 kockica</span></div><div class="roll-visual"><span>Bacanja u ovom potezu</span><span class="roll-meter" id="rollMeter" aria-hidden="true"></span></div><div class="dice-tray"><span class="dice-label" id="diceOwnerLabel">${online?escapeHtml(current().name).toLocaleUpperCase("sr-Latn")+" · KOCKICE":"TVOJE KOCKICE"}</span><div class="dice-grid" id="dice" role="group" aria-label="Šest kockica; izaberi kockice koje čuvaš"></div><p class="hold-line" id="holdLine">Baci kockice za početak poteza</p></div><div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi izbor</button><button class="btn" id="crossout">Precrtaj polje (0)</button>${online?"":'<button class="btn" id="undo" disabled>Vrati potez</button>'}</div></section>
   <section class="sidebar-card sidebar-turn"><span class="eyebrow">TRENUTNI POTEZ</span><h2>Na potezu</h2><div class="turn-status" id="turnStatus" role="status"></div></section>
   <div class="game-info"><section class="sidebar-card sidebar-quick"><span class="eyebrow">BRZI IZBOR</span><h2>Dostupni upisi</h2><div class="options sidebar-options" id="options"></div></section>
   <section class="sidebar-card sidebar-activity"><span class="eyebrow">AKTIVNOST</span><h2>Najava i veza</h2><div class="options activity-options" id="announceOptions"></div>${online?'<div class="turn-history" id="turnHistory"></div>':""}${online?'<div class="connection-status" id="connectionStatus" role="status" hidden><span id="connectionMessage"></span><button class="btn" id="reconnect" type="button">Poveži ponovo</button></div>':""}</section></div>
   <section class="sidebar-card sidebar-result"><span class="eyebrow">REZULTAT</span><h2>Igrači</h2><div class="tabs" id="tabs">${online?"":'<button class="player-tab active">Igrač 1</button>'}</div><p class="sidebar-note">Listić prikazuje rezultate; konačan zbir je zaključan do završetka partije.</p><div class="end-recap" id="endRecap" hidden></div></section>
  </aside>
 </div>${rulesDialogMarkup()}`;
}

function soloGame(){
 state.mode="solo";
  app.innerHTML=gameMarkup(false);
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
 const remaining=defs().reduce((total,col)=>total+scoreRows.filter(row=>!isFilled(player,col.id,row)).length,0);
 return remaining===1?5:3;
}
function soloRoll(){
 if(state.gameOver||state.rolls>=maxRollsForLocal())return;
 state.crossOutMode=false;
 const fresh=rollDice(6);
 if(state.rolls===0)state.dice=fresh;
 else state.dice=state.dice.map((v,i)=>state.selected.has(i)?v:fresh[i]);
 state.rolls++;state.pending=null;state.diceRollAnimation=true;setTimeout(()=>{state.diceRollAnimation=false},240);renderSolo();
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
 if(state.mode==="online")emitTurn("turn:announce",{row});
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
 if(state.columns.includes("r"))info="Ručna kolona (R) se popunjava posle prvog bacanja; ručna Kenta vredi 66. ";
 const oIndex=state.columns.indexOf("o");
 if(oIndex>=0){const earlier=state.columns.slice(0,oIndex);const ready=earlier.every(col=>scoreRows.every(row=>cells[cellKey(col,row)]!==undefined));if(!ready)info+="Kolona O se otključava tek kada su prethodne uključene kolone popunjene. ";}
 if(state.columns.includes("m"))info+="Kolona M prihvata samo najveći mogući rezultat za izabrani red. ";
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
 if(candidate.crossOut||state.crossOutMode)return ask("Precrtati polje "+candidate.row+" u koloni "+candidate.colName+"? U polje će biti upisana nula.");
 const selectionNote=state.selected.size<5?" Izabrali ste "+state.selected.size+" od 5 kockica; rezultat se računa samo iz izabranih.":"";
 return ask("Upisati "+candidate.value+" poena u "+candidate.colName+" · "+candidate.row+"?"+selectionNote);
}
function commitOnlineCandidate(candidate){
 if(!net.connected||!net.synced||!confirmShortSelection(candidate))return;
 emitTurn("turn:commit",{columnId:candidate.colId,row:candidate.row,crossOut:state.crossOutMode});
}


function refreshLocalDerived(player){
 for(const col of state.columns){
   const sums=calculateColumnSums(player.cells,col);
   for(const [row,value] of Object.entries(sums))player.cells[cellKey(col,row)]=value;
 }
}
function captureSoloSnapshot(){
 const player=current();
 return {player:{...player,cells:{...player.cells},crossedCells:[...(player.crossedCells||[])]},rolls:state.rolls,dice:[...state.dice],selected:[...state.selected],crossOutMode:state.crossOutMode,announcedRow:state.announcedRow,contraTargetRow:state.contraTargetRow,gameOver:state.gameOver};
}
function undoSoloTurn(){
 const snapshot=state.undoHistory.pop();if(!snapshot)return;
 if(state.rolls>0&&!ask("Vraćanjem poteza odbaciće se trenutno započeto bacanje. Nastaviti?")){state.undoHistory.push(snapshot);return;}
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
function renderDiceSummary(maxRolls){
  const meter=app.querySelector("#rollMeter");
  if(meter)meter.innerHTML=Array.from({length:maxRolls},(_,i)=>'<i class="'+(i<state.rolls?'on':'')+'"></i>').join("");
  const holdLine=app.querySelector("#holdLine");
  if(holdLine)holdLine.textContent=state.rolls===0?"Baci kockice za početak poteza":state.selected.size?`Sačuvano ${state.selected.size} od 6 kockica`:"Klikni kockice koje želiš da zadržiš";
}
function scoreRowLabel(row){
 return row==="YAMB"?"Jamb":row;
}
function renderTurnHistory(){
 const box=app.querySelector("#turnHistory");if(!box)return;
 const moves=state.turnHistory.slice(-6).reverse();
 box.innerHTML='<h3>Poslednji potezi</h3>'+(moves.length?'<ol>'+moves.map(move=>{
  const name=state.players.find(player=>player.id===move.playerId)?.name||"Igrač";
  const column=COLUMN_DEFS.find(def=>def.id===move.columnId)?.name||move.columnId;
  const field=escapeHtml(scoreRowLabel(move.row)+" · "+column);
  return '<li><strong>'+escapeHtml(name)+'</strong><span>'+(move.crossOut?"Precrtano: ":"")+field+'</span><b>'+(move.crossOut?"×":Number(move.value))+'</b></li>';
 }).join("")+'</ol>':'<p>Upisani potezi će se pojaviti ovde.</p>');
}
function renderEndRecap(){
 const box=app.querySelector("#endRecap");if(!box)return;
 box.hidden=!state.gameOver;
 if(!state.gameOver){box.innerHTML="";return;}
 const ranked=summarizeFinalResults(state.players,state.columns);
 const note=app.querySelector(".sidebar-result .sidebar-note");
 if(note)note.textContent="Partija je završena. Konačni rezultati su otključani.";
 const leaders=ranked.filter(player=>player.total===ranked[0]?.total);
 const winnerText=state.mode==="online"?(leaders.length>1?"Pobednici: ":"Pobednik: ")+leaders.map(player=>player.name).join(", "):"Tvoja partija je završena.";
 box.innerHTML='<h3>Završni pregled</h3><p>'+escapeHtml(winnerText)+'</p><ol>'+ranked.map(player=>{
  const best=player.bestColumn;
  const bestName=COLUMN_DEFS.find(def=>def.id===best?.columnId)?.name||"—";
  const crosses=player.crossedCells.map(cell=>{
   const [columnId,row]=cell.split("::");
   const column=COLUMN_DEFS.find(def=>def.id===columnId)?.name||columnId;
   return '<li>'+escapeHtml(scoreRowLabel(row)+" · "+column)+'</li>';
  }).join("");
  return '<li><div class="recap-player"><strong>'+escapeHtml(player.name)+'</strong><b>'+player.total+' poena</b></div><p>Najbolja kolona: '+escapeHtml(bestName)+(best?' ('+best.points+')':'')+'</p><details><summary>Precrtana polja ('+player.crossedCells.length+')</summary>'+(crosses?'<ul>'+crosses+'</ul>':'<p>Nema precrtanih polja.</p>')+'</details></li>';
 }).join("")+'</ol>';
}

function renderSolo(){
 const dice=app.querySelector("#dice");if(!dice)return;
  dice.innerHTML=(state.dice.length?state.dice:Array(6).fill(0)).map((v,i)=>diceButtonMarkup(v,i,state.selected.has(i),!state.rolls||state.gameOver)).join("");
 dice.querySelectorAll(".die").forEach(b=>b.onclick=()=>{
   if(!state.rolls||state.gameOver)return;
   state.crossOutMode=false;
   const i=+b.dataset.i;
   if(state.selected.has(i))state.selected.delete(i);
   else if(state.selected.size<5)state.selected.add(i);
   renderSolo();
 });
 const count=app.querySelector("#count");if(count)count.textContent=`${state.rolls} od ${maxRollsForLocal()}`;
  renderDiceSummary(maxRollsForLocal());
 updateTurnStatus();
 const roll=app.querySelector("#roll");
 if(roll){roll.disabled=state.gameOver||state.rolls>=maxRollsForLocal();roll.textContent=state.rolls>=maxRollsForLocal()?"Bacanja iskorišćena":state.rolls===0?"Baci kockice":"Baci ponovo";}
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
 renderEndRecap();
 saveSoloGame();
}

function renderScoreSheet(player,isSelf=true){
 const sheet=app.querySelector("#sheet");if(!sheet)return;
 const scrollTop=sheet.parentElement.scrollTop,scrollLeft=sheet.parentElement.scrollLeft;
 const focusedCell=document.activeElement?.dataset?.cell;
 const columns=defs();
 const rows=[
   {id:"1",label:"Jedinice",type:"normal"},{id:"2",label:"Dvojke",type:"normal"},{id:"3",label:"Trojke",type:"normal"},
   {id:"4",label:"Četvorke",type:"normal"},{id:"5",label:"Petice",type:"normal"},{id:"6",label:"Šestice",type:"normal"},
   {id:"SUM_TOP",label:"Zbir 1–6",type:"sum"},{id:"MAX",label:"Maksimum",type:"normal"},{id:"MIN",label:"Minimum",type:"normal"},
   {id:"SUM_MID",label:"Razlika × 1",type:"sum"},
  {id:"KENTA",label:"KENTA",sub:"66, 56, 46",type:"combo"},
  {id:"TRILING",label:"TRILING",sub:"+20",type:"combo"},
  {id:"FUL",label:"FUL",sub:"+30",type:"combo"},
  {id:"POKER",label:"POKER",sub:"+40",type:"combo"},
   {id:"YAMB",label:"JAMB",sub:"+50",type:"combo"},
   {id:"SUM_TOTAL",label:"Kombinacije",type:"sum"}
 ];
 const canChoose=isSelf&&!state.gameOver&&state.rolls>0&&(state.crossOutMode||state.selected.size>0)&&(state.mode!=="online"||(current()?.id===net.playerId&&net.connected&&net.synced));
 const choices=canChoose?soloCandidates():[];
 const hideRow=!state.gameOver&&!isSelf;
  let html=`<table class="sheet premium-sheet" style="--sheet-min-width:${150+70*columns.length}px"><colgroup><col class="label-col">${columns.map(c=>`<col class="data-col col-${c.id}">`).join("")}</colgroup>
  <thead><tr><th class="corner-hatch" aria-label="Kategorija">Kombinacija</th>${columns.map(c=>`<th class="sheet-head ${c.id==="r"?"group-start":""}" title="${c.headerTitle}"><span class="head-symbol">${c.headerSymbol}</span><span class="head-name">${c.headerLabel}</span><span class="head-detail">${c.headerTitle===c.headerLabel?"":c.headerTitle}</span></th>`).join("")}</tr></thead><tbody>`;
 for(const row of rows){
   const hiddenSum=hideRow&&["SUM_TOP","SUM_MID","SUM_TOTAL"].includes(row.id);
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
   const total=columns.reduce((acc,col)=>acc+Number(player?.cells?.[cellKey(col.id,"SUM_TOP")]||0)+Number(player?.cells?.[cellKey(col.id,"SUM_MID")]||0)+Number(player?.cells?.[cellKey(col.id,"SUM_TOTAL")]||0),0);
   html+=`<tr class="final-total"><th class="row-label">UKUPNO</th><td colspan="${columns.length}" class="final-total-value">${state.gameOver?total:"🔒"}</td></tr>`;
 }
 html+="</tbody></table>";
 sheet.innerHTML=html;
 sheet.parentElement.scrollTop=scrollTop;sheet.parentElement.scrollLeft=scrollLeft;
 if(focusedCell){const cell=[...sheet.querySelectorAll("[data-cell]")].find(item=>item.dataset.cell===focusedCell&&item.tabIndex===0);cell?.focus({preventScroll:true});}
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
  const viewedPlayerId=state.players[state.viewPlayer]?.id;
 if((s.dice||[]).length>0&&s.rolls>state.rolls){state.diceRollAnimation=true;setTimeout(()=>{state.diceRollAnimation=false},240)}
 state.mode="online";state.onlineStarted=Boolean(s.started);state.hostId=s.hostId||null;state.gameOver=Boolean(s.gameOver);state.rolls=s.rolls;state.maxRolls=s.maxRolls||3;state.dice=s.dice||[];state.selected=new Set(s.selection||[]);state.announcedRow=s.announcedRow||null;state.contraTargetRow=s.contraTargetRow||null;state.turnHistory=Array.isArray(s.turnHistory)?s.turnHistory:[];
 const idx=s.players.findIndex(p=>p.id===s.currentPlayerId);if(idx>=0)state.currentPlayer=idx;
 state.players=s.players.map(p=>({id:p.id,name:p.name,cells:p.cells||{},crossedCells:p.crossedCells||[]}));
  const viewedIndex=state.players.findIndex(p=>p.id===viewedPlayerId);
  const ownIndex=state.players.findIndex(p=>p.id===net.playerId);
  state.viewPlayer=viewedIndex>=0?viewedIndex:ownIndex>=0?ownIndex:0;
 state.columns=normalizeColumnIds(s.config?.columns||state.columns);
 if(s.started){if(!app.querySelector("#dice"))game();renderOnline();}
 else renderLobbyState(s);
}
function renderLobbyState(s){
 const canStart=s.players.length>=2&&s.players.every(player=>player.connected);
 const slots=Array.from({length:4},(_,index)=>{
  const player=s.players[index];
  if(!player)return '<div class="lobby-player is-empty"><span class="lobby-avatar" aria-hidden="true">•</span><span>Čeka igrača...</span></div>';
  const initials=player.name.trim().slice(0,2).toUpperCase()||"I";
  return `<div class="lobby-player ${player.id===s.hostId?"is-host":""} ${player.connected?"":"is-offline"}"><span class="lobby-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div><strong>${escapeHtml(player.name)}${player.id===s.hostId?" ★":""}</strong><small>${player.connected?"Povezan":"Van mreže"}</small></div></div>`;
 }).join("");
 const status=s.players.length<2?"Čeka se još jedan igrač.":canStart?"Soba je spremna za početak.":"Čeka se da se svi igrači povežu.";
 app.innerHTML=`${appNavMarkup("ONLINE SOBA")}<section class="online-lobby"><div class="lobby-heading"><div><span class="eyebrow">ONLINE STO</span><h1>Tvoja soba</h1></div><span class="lobby-count">${s.players.length}/4 igrača</span></div>
  <div class="lobby-code-card"><span>Kod sobe</span><strong class="lobby-code">${escapeHtml(s.roomCode)}</strong><p>Podeli link sobe sa drugim igračima</p><div class="lobby-share-actions"><button class="btn lobby-copy" id="copyRoomCode" type="button">Kopiraj link sobe</button></div><div class="lobby-copy-status" id="copyStatus" role="status"></div></div>
  <div class="lobby-players" aria-label="Mesta za igrače">${slots}</div>
  ${s.hostId===net.playerId?`<button class="btn primary lobby-start" id="startOnline" ${canStart?"":"disabled"}>Počni igru</button>`:'<p class="lobby-wait">Čeka se da domaćin pokrene partiju.</p>'}
  <p class="lobby-wait">${status}</p><button class="btn lobby-leave" id="back" type="button">← Napusti sobu</button></section>`;
 app.querySelector("#back").onclick=leaveOnlineRoom;
 async function copyLobbyText(value,successMessage){
  const copyStatus=app.querySelector("#copyStatus");
  try{
   let copied=false;
   if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);copied=true;}catch{}}
   if(!copied){const input=document.createElement("textarea");input.value=value;document.body.append(input);input.select();copied=document.execCommand("copy");input.remove();}
   if(!copied)throw new Error("copy failed");
   if(copyStatus)copyStatus.textContent=successMessage;
  }catch{if(copyStatus)copyStatus.textContent="Kopiranje nije uspelo. Pokušaj ponovo.";}
 }
 app.querySelector("#copyRoomCode").onclick=()=>copyLobbyText(buildInviteUrl(window.location.href,s.roomCode),"Link sobe je kopiran.");
 
 const start=app.querySelector("#startOnline");if(start)start.onclick=()=>socket?.emit("room:start");
}

function game(){
  app.innerHTML=gameMarkup(true);
 bindRulesGuide();
 bindTableScale();
 app.querySelector("#leaveRoom").onclick=leaveOnlineRoom;
 const reconnect=app.querySelector("#reconnect");if(reconnect)reconnect.onclick=()=>{reconnect.disabled=true;reconnect.textContent="Povezivanje…";socket?.connect()};
 updateNetworkStatus();
 app.querySelector("#roll").onclick=()=>{if(!net.connected||!net.synced)return;state.crossOutMode=false;emitTurn("turn:roll")};
 app.querySelector("#clear").onclick=()=>{state.selected.clear();state.crossOutMode=false;emitTurn("turn:select",{indices:[]})};
 app.querySelector("#crossout").onclick=()=>{state.crossOutMode=!state.crossOutMode;if(state.crossOutMode){state.selected.clear();emitTurn("turn:select",{indices:[]})}renderOnline()};
 renderOnline();
}

function renderOnline(){
 const d=app.querySelector("#dice");if(!d)return;
 const focusedDie=document.activeElement?.matches?.("#dice .die")?document.activeElement.dataset.i:null;
 const activePlayer=state.players[state.currentPlayer];
 const isMyTurn=activePlayer?.id===net.playerId;
 const viewingSelf=state.players[state.viewPlayer]?.id===net.playerId;
 const canAct=isMyTurn&&net.connected&&net.synced;
 const diceOwnerLabel=app.querySelector("#diceOwnerLabel");
 if(diceOwnerLabel)diceOwnerLabel.textContent=activePlayer?activePlayer.name.toLocaleUpperCase("sr-Latn")+" · KOCKICE":"KOCKICE";
 updateNetworkStatus();
  d.innerHTML=(state.dice.length?state.dice:Array(6).fill(0)).map((v,i)=>diceButtonMarkup(v,i,state.selected.has(i),!canAct||state.gameOver||state.rolls===0)).join("");
 d.querySelectorAll(".die").forEach(b=>b.onclick=()=>{
   if(!canAct||state.gameOver||state.rolls===0)return;
   state.crossOutMode=false;
   const i=+b.dataset.i;
   state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);
   emitTurn("turn:select",{indices:[...state.selected]});
 });
 const c=app.querySelector("#count");if(c)c.textContent=`${state.rolls} od ${state.maxRolls||3}`;
  renderDiceSummary(state.maxRolls||3);
 const holdLine=app.querySelector("#holdLine");
 if(holdLine&&!isMyTurn){
   const name=activePlayer?.name||"Aktivni igrač";
   holdLine.textContent=state.rolls===0?"Čeka se prvo bacanje igrača "+name:state.selected.size?name+" čuva "+state.selected.size+" od 6 kockica":"Bacanje igrača "+name+" · kockice su prikazane uživo";
 }
 updateTurnStatus(canAct);
 const roll=app.querySelector("#roll"),clear=app.querySelector("#clear"),crossout=app.querySelector("#crossout");
 if(roll){roll.disabled=!canAct||state.gameOver||state.rolls>=(state.maxRolls||3);roll.textContent=state.rolls>=(state.maxRolls||3)?"Bacanja iskorišćena":state.rolls===0?"Baci kockice":"Baci ponovo";}
 if(clear)clear.disabled=!canAct||state.gameOver||state.rolls===0;
 if(crossout){crossout.disabled=!canAct||state.gameOver||state.rolls===0;crossout.classList.toggle("crossout-active",state.crossOutMode);crossout.textContent=state.crossOutMode?"Otkaži precrtavanje":"Precrtaj polje (0)";}
  const tabs=app.querySelector("#tabs");tabs.innerHTML=state.players.map((p,i)=>'<button type="button" class="player-tab '+(i===state.viewPlayer?'active':'')+'" data-player="'+i+'" aria-pressed="'+String(i===state.viewPlayer)+'">'+escapeHtml(p.name)+(i===state.currentPlayer?' · na potezu':'')+'</button>').join("");
  tabs.querySelectorAll("[data-player]").forEach(button=>button.onclick=()=>{state.viewPlayer=Number(button.dataset.player);renderOnline()});
 const box=app.querySelector("#options");
 if(box){
   let hint="";
   if(state.gameOver)hint="Partija je završena. Konačan rezultat je prikazan na tabeli.";
   else if(!canAct)hint=net.connected?"Sinhronizujem stanje sobe…":"Veza je prekinuta. Sačekaj ponovno povezivanje.";
   else if(!isMyTurn)hint="Sačekaj svoj potez.";
    else if(!viewingSelf)hint="Prikazana je tabela drugog igrača. Izaberi svoje ime za upis rezultata.";
   else if(state.rolls===0)hint="Prvo baci kockice. Za bodovanje izaberi 1–5 kockica.";
   else if(state.crossOutMode)hint="Izaberi dostupno polje koje želiš da precrtaš. U polje će biti upisana 0.";
   else if(state.selected.size===0)hint="Izaberi 1–5 kockica za bodovanje ili označi kockice za sledeće bacanje.";
   else hint=`Izabrano: ${state.selected.size}/5. Sa manje od 5 kockica prikazaće se upozorenje pri upisu.`;
    const ops=state.gameOver||!canAct||!viewingSelf?[]:soloCandidates();
   const cards=ops.map((o,i)=>'<button class="option" data-op="'+i+'"><b>'+escapeHtml(o.colName)+' · '+escapeHtml(o.row)+'</b><span>'+o.value+'</span></button>').join("");
   const empty=!state.gameOver&&canAct&&state.rolls>0&&!state.crossOutMode&&state.selected.size>0&&!ops.length?"Nema dostupnih polja za izabrani rezultat.":"";
   box.innerHTML='<span class="status">'+hint+'</span>'+(cards||(empty?'<span class="status options-empty">'+empty+'</span>':""));
   box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>commitOnlineCandidate(ops[+b.dataset.op]));
 }
 renderAnnouncementUi();
 renderTurnHistory();
 renderScoreSheet(state.players[state.viewPlayer],state.players[state.viewPlayer]?.id===net.playerId);
 renderEndRecap();
 if(focusedDie!==null)d.querySelector(`[data-i="${focusedDie}"]`)?.focus({preventScroll:true});
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
 if(invitedRoomCode())onlineSetup();
 else if(restoreSoloGame())soloGame();
 else setup();
}
startApp();

