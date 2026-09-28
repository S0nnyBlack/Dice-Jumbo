import{rollDice,evaluate,score,MANDATORY_COLUMNS,OPTIONAL_COLUMNS}from"./game.js";
const state={screen:"setup",rolls:0,dice:[1,1,1,1,1,1],selected:new Set(),enabled:[...MANDATORY_COLUMNS,...OPTIONAL_COLUMNS],scores:{},used:new Set()};
const app=document.getElementById("app");
function setup(){
 app.innerHTML=`<section class="panel setup"><div class="brand"><h1>Jumbo Dice</h1><p>Podešavanje partije</p></div>
 <p>Obavezne kolone: Gore, Dole i Slobodna. Host bira ostale kolone.</p>
 <div class="setup-grid">
 <div class="toggle"><span>Gore</span><span>🔒</span></div><div class="toggle"><span>Dole</span><span>🔒</span></div><div class="toggle"><span>Slobodna</span><span>🔒</span></div>
 ${OPTIONAL_COLUMNS.map(c=>`<label class="toggle"><span>${c}</span><input data-col="${c}" type="checkbox" ${state.enabled.includes(c)?"checked":""}></label>`).join("")}
 </div><button class="btn primary" id="start">Kreiraj partiju</button></section>`;
 app.querySelectorAll("[data-col]").forEach(i=>i.onchange=()=>{const c=i.dataset.col;i.checked?state.enabled.push(c):state.enabled=state.enabled.filter(x=>x!==c)});
 app.querySelector("#start").onclick=()=>{state.screen="game";game()};
}
function game(){
 app.innerHTML=`<header><div class="brand"><h1>Jumbo Dice</h1><p>6 kockica · najviše 5 za rezultat · do 3 bacanja</p></div><div class="toolbar"><button class="btn" id="setup">Podešavanja</button></div></header>
 <div class="layout"><section class="panel"><div class="meta"><span>Na potezu: <b>Igrač 1</b></span><span>Bacanje: <b id="count">0/3</b></span></div>
 <div class="dice-grid" id="dice"></div><div class="toolbar"><button class="btn primary" id="roll">Baci 6 kockica</button><button class="btn" id="clear">Poništi</button></div><div class="options" id="options"></div>
 </section><section class="panel sheet-wrap"><div id="sheet"></div></section></div>`;
 app.querySelector("#setup").onclick=setup;app.querySelector("#roll").onclick=roll;app.querySelector("#clear").onclick=()=>{state.selected.clear();render()};
 render();
}
function roll(){if(state.rolls>=3)return;state.dice=rollDice(6);state.rolls++;state.selected.clear();render()}
function render(){
 const dice=app.querySelector("#dice");if(dice){dice.innerHTML=state.dice.map((v,i)=>`<button class="die ${state.selected.has(i)?"selected":""}" data-i="${i}">${v}</button>`).join("");dice.querySelectorAll("button").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;state.selected.has(i)?state.selected.delete(i):state.selected.size<5&&state.selected.add(i);render()})}
 const count=app.querySelector("#count");if(count)count.textContent=`${state.rolls}/3`;
 const box=app.querySelector("#options");if(box){if(state.selected.size!==5){box.innerHTML='<span class="status">Selektuj tačno 5 kockica da vidiš validne upise.</span>'}else{const vals=[...state.selected].map(i=>state.dice[i]),ev=evaluate(vals),cats=[...new Set([...ev.categories,"MAXIMUM","MINIMUM",...state.enabled])];box.innerHTML=cats.map(c=>{const s=score(c,vals),u=state.used.has(c);return`<button class="option ${u?"used":""}" data-cat="${c}" ${s==null||u?"disabled":""}>${c}: ${s??"—"}</button>`}).join("");box.querySelectorAll("button[data-cat]").forEach(b=>b.onclick=()=>{const c=b.dataset.cat,s=score(c,vals);if(s==null||state.used.has(c))return;state.scores[c]=s;state.used.add(c);renderSheet();render()})}}
 renderSheet();
}
function renderSheet(){
 const rows=["1","2","3","4","5","6","Σ","max","min","Σ","KENTA","TRILING +20","FUL +30","POKER +40","YAMB +50","Σ"];
 const labels=state.enabled;
 app.querySelector("#sheet").innerHTML=`<table class="sheet"><thead><tr><th>Kategorija</th><th>Igrač 1</th></tr></thead><tbody>${rows.map(r=>{const key=r.split(" ")[0].toLowerCase();const v=state.scores[key]??state.scores[r]??"—";return`<tr class="${r==="Σ"?"sum":""}"><td>${r}</td><td>${v}</td></tr>`}).join("")}</tbody></table>`;
}
setup();
