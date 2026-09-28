import{COLUMN_DEFS,VALUE_ROWS,COMBINATION_ROWS,rollDice,analyse,combinationScore}from"./game.js";

const state={
 screen:"setup",rolls:0,dice:[],selected:new Set(),columns:COLUMN_DEFS.map(c=>c.id),
 currentPlayer:0,players:[{id:1,name:"Igrač 1",cells:{},announced:null},{id:2,name:"Igrač 2",cells:{},announced:null},{id:3,name:"Igrač 3",cells:{},announced:null},{id:4,name:"Igrač 4",cells:{},announced:null}],
 activePlayers:2
};
const app=document.getElementById("app");
const defs=()=>state.columns.map(id=>COLUMN_DEFS.find(c=>c.id===id)).filter(Boolean);
const current=()=>state.players[state.currentPlayer];
const cellKey=(col,row)=>col+"::"+row;
const isFilled=(p,col,row)=>p.cells[cellKey(col,row)]!==undefined;
const selectedValues=()=>[...state.selected].map(i=>state.dice[i]);

function setup(){
 app.innerHTML=`<section class="panel setup">
 <div class="brand"><h1>Jumbo Dice</h1><p>Nova partija</p></div>
 <div class="setup-card"><h2>Igrači</h2><div class="setup-grid player-grid">${[0,1,2,3].map(i=>`<label class="toggle"><span><input type="checkbox" data-player="${i}" ${i<state.activePlayers?"checked":""} ${i===0?"disabled":""}> ${state.players[i].name}</span><span>${i===0?"HOST":i<state.activePlayers?"AKTIVAN":"—"}</span></label>`).join("")}</div></div>
 <div class="setup-card"><h2>Kolone</h2><p class="status">Gore, Dole i Slobodna su obavezne. Ostale host uključuje ili isključuje pre početka partije.</p>
 <div class="setup-grid">${COLUMN_DEFS.map(c=>`<label class="toggle"><span>${c.name}</span><input type="checkbox" data-col="${c.id}" ${state.columns.includes(c.id)?"checked":""} ${c.mandatory?"disabled":""}></label>`).join("")}</div></div>
 <button class="btn primary" id="start">Pokreni partiju</button></section>`;
 app.querySelectorAll("[data-player]").forEach(x=>x.onchange=()=>{state.players[+x.dataset.player].enabled=x.checked;state.activePlayers=state.players.filter((p,i)=>i===0||p.enabled).length});
 app.querySelectorAll("[data-col]").forEach(x=>x.onchange=()=>{state.columns=x.checked?[...new Set([...state.columns,x.dataset.col])]:state.columns.filter(id=>id!==x.dataset.col)});
 app.querySelector("#start").onclick=()=>{state.players=state.players.filter((p,i)=>i===0||p.enabled);state.screen="game";newTurn();game()};
}
function newTurn(){state.rolls=0;state.dice=[];state.selected.clear()}
function game(){
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice</h1><p>6 kockica · biraš najviše 5 · do 3 bacanja</p></div><div class="toolbar"><button class="btn" id="setup">Podešavanja</button></div></header>
 <div class="layout">
 <section class="panel"><div class="meta"><span>Na potezu: <b>${current().name}</b></span><span>Bacanje <b id="count">0/3</b></span></div>
 <div class="dice-grid" id="dice"></div><div class="toolbar"><button class="btn primary" id="roll">Baci / ponovo baci</button><button class="btn" id="clear">Poništi</button><button class="btn" id="finish" disabled>Završi potez</button></div>
 <div class="options" id="options"></div></section>
 <section class="panel"><div class="tabs" id="tabs"></div><div class="sheet-wrap"><div id="sheet"></div></div></section>
 </div>`;
 app.querySelector("#setup").onclick=setup;app.querySelector("#roll").onclick=roll;app.querySelector("#clear").onclick=()=>{state.selected.clear();renderAll()};
 app.querySelector("#finish").onclick=finishTurn;renderAll();
}
function roll(){
 if(state.rolls>=3)return;
 const first=state.rolls===0; const fresh=rollDice(6);
 if(first)state.dice=fresh;else{
  state.dice=state.dice.map((v,i)=>state.selected.has(i)?v:fresh[i]);
 }
 state.rolls++;state.selected.clear();renderAll();
}
function finishTurn(){if(state.selected.size!==5)return;state.selected=new Set([...state.selected]);renderAll()}
function commit(row){
 const p=current(),col=state.pendingColumn,val=state.pendingValue;
 if(!col||val==null)return;
 const k=cellKey(col,row);if(isFilled(p,col,row))return;
 p.cells[k]=val;
 state.pendingColumn=null;state.pendingValue=null;
 const next=(state.currentPlayer+1)%state.players.length;state.currentPlayer=next;newTurn();
 renderAll();
}
function possibleOptions(){
 if(state.selected.size!==5)return [];
 const v=selectedValues(),a=analyse(v),p=current(),out=[];
 for(const d of defs()){
  if(d.id==="up"||d.id==="down"||d.id==="free"||d.id==="announced"||d.id==="contra"||d.id==="r"||d.id==="n"||d.id==="d"||d.id==="o"||d.id==="m"){
   let row=d.id==="free"?"FREE":d.id==="up"?"UP":d.id==="down"?"DOWN":d.id;
   if(!isFilled(p,d.id,row))out.push({col:d,row,value:a.total,label:d.name});
  }
 }
 for(const r of COMBINATION_ROWS){if(!isFilled(p,"normal",r)){const s=combinationScore(r,v);if(s!==null)out.push({col:"normal",row:r,value:s,label:r})}}
 return out;
}
function renderOptions(){
 const box=app.querySelector("#options");if(!box)return;
 const ops=possibleOptions();
 box.innerHTML=state.selected.size!==5?'<span class="status">Selektuj tačno 5 kockica.</span>':ops.map((o,i)=>`<button class="option" data-op="${i}"><b>${o.label}</b><span>${o.value}</span></button>`).join("");
 box.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>{const o=ops[+b.dataset.op];state.pendingColumn=o.col;state.pendingValue=o.value;document.getElementById("sheet").scrollIntoView({behavior:"smooth",block:"nearest"});highlightOpen(o)});
}
function highlightOpen(o){
 renderSheet();
 const node=app.querySelector(`[data-cell="${cellKey(o.col,o.row)}"]`);if(node){node.classList.add("candidate");node.onclick=()=>commit(o.row)}
}
function renderDice(){
 const d=app.querySelector("#dice");if(!d)return;
 d.innerHTML=state.dice.map((v,i)=>`<button class="die ${state.selected.has(i)?"selected":""}" data-i="${i}">${v}</button>`).join("");
 d.querySelectorAll(".die").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);renderAll()});
 const c=app.querySelector("#count");if(c)c.textContent=`${state.rolls}/3`;
}
function renderTabs(){const t=app.querySelector("#tabs");if(!t)return;t.innerHTML=state.players.map((p,i)=>`<button class="player-tab ${i===state.currentPlayer?"active":""}" data-p="${i}">${p.name}</button>`).join("");t.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{state.viewPlayer=+b.dataset.p;renderSheet()})}
function publicPlayer(p,isSelf=false){
 const topRows=VALUE_ROWS.map(x=>({row:String(x),label:String(x)}));
 const combo=[{row:"KENTA",label:"KENTA"},{row:"TRILING",label:"TRILING +20"},{row:"FUL",label:"FUL +30"},{row:"POKER",label:"POKER +40"},{row:"YAMB",label:"YAMB +50"}];
 const rows=[...topRows,{row:"SUM_TOP",label:"Σ"},{row:"MAX",label:"max"},{row:"MIN",label:"min"},{row:"SUM_MID",label:"Σ"},...combo,{row:"SUM_TOTAL",label:"Σ"}];
 let html="";
 for(const d of defs()){
  html+=`<tr class="col-head"><th colspan="2">${d.name}</th></tr>`;
  for(const r of rows){
   const k=cellKey(d.id,r.row),v=p.cells[k];const hidden=!isSelf&&["SUM_TOP","SUM_MID","SUM_TOTAL"].includes(r.row);
   const shown=hidden?(v===undefined?"": "•••"):(v===undefined?"—":v);
   html+=`<tr class="${hidden?"hidden-sum":""}"><td>${r.label}</td><td data-cell="${k}" class="${v===undefined?"empty":""}">${shown}</td></tr>`;
  }
 }
 if(isSelf)html+=`<tr class="total-own"><th>Ukupno</th><th>${Object.entries(p.cells).filter(([k])=>!k.includes("SUM_")).reduce((a,[,v])=>a+Number(v),0)}</th></tr>`;
 return `<table class="sheet"><thead><tr><th>Kategorija</th><th>${p.name}</th></tr></thead><tbody>${html}</tbody></table>`;
}
function renderSheet(){
 const p=state.viewPlayer==null?current():state.players[state.viewPlayer];const self=p===current();
 const sheet=app.querySelector("#sheet");if(sheet)sheet.innerHTML=publicPlayer(p,self);
}
function renderAll(){renderDice();renderOptions();renderTabs();renderSheet()}
setup();
