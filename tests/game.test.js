import test from "node:test";
import assert from "node:assert/strict";
import { analyse, availableEntries, combinationScore, directionOrder, frontierRows, rollDice, upperBonus, upperScore, normalizeColumnIds, COLUMN_DEFS, calculateColumnSums, visibleCellsForPlayer, summarizeFinalResults, maximumRowScore } from "../game.js";

test("rollDice returns the requested number of valid die values",()=>{
 const dice=rollDice(6);assert.equal(dice.length,6);
 assert.ok(dice.every(value=>Number.isInteger(value)&&value>=1&&value<=6));
});
test("upper rows count only dice matching the row face",()=>{
 assert.equal(upperScore([1,2,2,5,2],2),6);assert.equal(upperScore([1,2,2,5,2],6),0);
});
test("upper section bonus begins at 60",()=>{
 assert.equal(upperBonus(59),0);assert.equal(upperBonus(60),30);assert.equal(upperBonus(63),30);
});
test("analyse accepts valid selections from one to five dice and rejects larger selections",()=>{
 assert.equal(analyse([1,2,3,4]).valid,true);assert.deepEqual(analyse([]),{valid:false});assert.deepEqual(analyse([1,2,3,4,5,6]),{valid:false});
});
test("Kenta varies with roll count and manual Kenta is always 66",()=>{
 const straight=[1,2,3,4,5];
 assert.equal(combinationScore("KENTA",straight,{rolls:1}),66);
 assert.equal(combinationScore("KENTA",straight,{rolls:2}),56);
 assert.equal(combinationScore("KENTA",straight,{rolls:3}),46);
 assert.equal(combinationScore("KENTA",straight,{rolls:3,manual:true}),66);
 assert.equal(combinationScore("KENTA",[1,2,2,4,5],{rolls:1}),null);
});
test("combination rows apply the documented bonuses and poker sums only four matching dice",()=>{
 assert.equal(combinationScore("TRILING",[4,4,4]),32);
 assert.equal(combinationScore("TRILING",[4,4,4,1]),32);
 assert.equal(combinationScore("POKER",[4,4,4,4]),56);
 assert.equal(combinationScore("TRILING",[4,4,4,4,4]),32);
 assert.equal(combinationScore("POKER",[4,4,4,4,4]),56);
 assert.equal(combinationScore("YAMB",[4,4,4,4,4]),70);
 assert.equal(combinationScore("TRILING",[4,4,3]),null);
 assert.equal(combinationScore("POKER",[4,4,4,3]),null);
 assert.equal(combinationScore("TRILING",[4,4,4,1,2]),32);
 assert.equal(combinationScore("TRILING",[6,6,6,1,2]),38);
 assert.equal(combinationScore("FUL",[3,3,3,5,5]),49);
 assert.equal(combinationScore("POKER",[2,2,2,2,5]),48);
 assert.equal(combinationScore("YAMB",[6,6,6,6,6]),80);
 assert.equal(combinationScore("FUL",[3,3,3,4,5]),null);
});
test("down and up columns advance in order",()=>{
 const cells={};assert.equal(directionOrder("down",cells),"1");cells["down::1"]=2;
 assert.equal(directionOrder("down",cells),"2");assert.equal(directionOrder("up",{}),"YAMB");
});
test("N column exposes its two documented frontiers while R is manual",()=>{
 assert.deepEqual(frontierRows("r",{}),[]);
 assert.deepEqual(frontierRows("n",{}),["1","YAMB"]);
 const cells={"n::1":3};
 assert.deepEqual(frontierRows("n",cells),["2","YAMB"]);
});
test("short selections suggest Triling and Poker only after the required matching dice",()=>{
 const three=availableEntries(["free"],{},[4,4,4]);
 assert.ok(three.some(e=>e.row==="TRILING"&&e.value===32));
 assert.ok(!three.some(e=>e.row==="POKER"));
 const four=availableEntries(["free"],{},[4,4,4,4]);
 assert.ok(four.some(e=>e.row==="TRILING"&&e.value===32));
 assert.ok(four.some(e=>e.row==="POKER"&&e.value===56));
 const five=availableEntries(["free"],{},[4,4,4,4,4]);
 for(const row of ["TRILING","POKER","YAMB"])assert.ok(five.some(e=>e.row===row));
 const unrelated=availableEntries(["free"],{},[4,4,3]);
 assert.ok(!unrelated.some(e=>e.row==="TRILING"));
});

test("MAX and MIN require exactly five selected dice",()=>{
 for(const dice of [[1],[1,2],[1,2,3],[1,2,3,4]]){
  const entries=availableEntries(["free"],{},dice);
  assert.ok(!entries.some(entry=>entry.row==="MAX"||entry.row==="MIN"));
 }
 const entries=availableEntries(["free"],{},[1,2,3,4,5]);
 assert.ok(entries.some(entry=>entry.row==="MAX"&&entry.value===15));
 assert.ok(entries.some(entry=>entry.row==="MIN"&&entry.value===15));
});
test("zero scores are not suggested unless the player is crossing out a cell",()=>{
 const scoring=availableEntries(["free"],{},[1]);
 assert.ok(scoring.some(entry=>entry.row==="1"&&entry.value===1));
 assert.ok(!scoring.some(entry=>entry.row==="2"));
 assert.ok(scoring.every(entry=>entry.value!==0));
 const crossing=availableEntries(["free"],{},[],{crossOut:true});
 assert.ok(crossing.length>0);
 assert.ok(crossing.every(entry=>entry.value===0&&entry.crossOut===true));
});
test("manual R column can only be played after the first throw",()=>{
 const dice=[1,2,3,4,5];
 assert.ok(!availableEntries(["r"],{},dice,{rolls:2}).length);
 assert.ok(availableEntries(["r"],{},dice,{rolls:1}).some(e=>e.row==="KENTA"&&e.value===66));
});
test("O stays locked until earlier enabled columns are complete",()=>{
 const rows=["1","2","3","4","5","6","MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"];
 const cells={};assert.equal(availableEntries(["free","o"],cells,[1]).some(e=>e.colId==="o"),false);
 for(const row of rows)cells["free::"+row]=0;
 assert.equal(availableEntries(["free","o"],cells,[1]).some(e=>e.colId==="o"),true);
});
test("contra can be played freely once the enabled announcement column is full",()=>{
 const rows=["1","2","3","4","5","6","MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"];
 const cells=Object.fromEntries(rows.map(row=>["announced::"+row,0]));
 assert.ok(availableEntries(["announced","contra"],cells,[1]).some(e=>e.colId==="contra"));
});
test("M column accepts only theoretical maximum scores for each row",()=>{
 const expected={"1":5,"2":10,"3":15,"4":20,"5":25,"6":30,MAX:30,MIN:30,KENTA:66,TRILING:38,FUL:58,POKER:64,YAMB:80};
 for(const [row,score] of Object.entries(expected))assert.equal(maximumRowScore(row),score);
 const entries=(dice,rolls=1)=>availableEntries(["m"],{},dice,{rolls});
 assert.ok(entries([1,1,1,1,1]).some(entry=>entry.row==="1"&&entry.value===5));
 assert.ok(entries([6,6,6]).some(entry=>entry.row==="TRILING"&&entry.value===38));
 assert.ok(entries([6,6,6,5,5]).some(entry=>entry.row==="FUL"&&entry.value===58));
 assert.ok(entries([6,6,6,6]).some(entry=>entry.row==="POKER"&&entry.value===64));
 assert.ok(entries([6,6,6,6,6]).some(entry=>entry.row==="YAMB"&&entry.value===80));
 assert.ok(entries([2,3,4,5,6],1).some(entry=>entry.row==="KENTA"&&entry.value===66));
 assert.ok(!entries([2,3,4,5,6],2).some(entry=>entry.row==="KENTA"));
 assert.ok(!entries([5,5,5]).some(entry=>entry.row==="TRILING"));
 assert.ok(!entries([6,6,6,4,4]).some(entry=>entry.row==="FUL"));
 assert.ok(entries([1],1).every(entry=>entry.row!=="1"));
 assert.ok(availableEntries(["m"],{},[],{crossOut:true}).some(entry=>entry.row==="1"&&entry.crossOut));
});
test("announced score is restricted to its declared row",()=>{
 const entries=availableEntries(["free","announced"],{},[2,2,2,3,3],{announcedRow:"FUL"});
 assert.equal(entries.length,1);assert.equal(entries[0].colId,"announced");assert.equal(entries[0].row,"FUL");
 assert.equal(entries[0].value,42);
});
test("contra score is restricted to the opponent's announced row",()=>{
 const entries=availableEntries(["free","contra"],{},[2,2,2,3,3],{contraRow:"FUL"});
 assert.equal(entries.length,1);assert.equal(entries[0].colId,"contra");assert.equal(entries[0].row,"FUL");
});

test("enabled columns retain canonical order regardless of selection order",()=>{
 assert.deepEqual(normalizeColumnIds(["m","o","d","r","unknown","o"]),["down","free","up","r","o","m"]);
 assert.deepEqual(normalizeColumnIds(null),["down","free","up"]);
});


test("column symbols match their gameplay labels",()=>{
 const columns=Object.fromEntries(COLUMN_DEFS.map(column=>[column.id,column]));
 assert.equal(columns.announced.headerSymbol,"N");
 assert.equal(columns.contra.name,"Dirigovano");assert.equal(columns.contra.headerSymbol,"D");
 assert.equal(columns.r.direction,"manual");assert.equal(columns.r.name,"Ručna");
 assert.equal(columns.n.name,"Naniže–naviše");assert.equal(columns.n.headerSymbol,"↓↑");
 assert.equal(columns.o.name,"Obavezna");assert.equal(columns.m.name,"Maksimalna");
 assert.equal(columns.d,undefined);
});

test("column sums separate upper, max-min weighted by ones, and combinations",()=>{
 const cells={
  "free::1":6,"free::2":8,"free::3":9,"free::4":10,"free::5":10,"free::6":18,
  "free::MAX":25,"free::MIN":5,
  "free::KENTA":66,"free::TRILING":42,"free::FUL":0,"free::POKER":56,"free::YAMB":80
 };
 assert.deepEqual(calculateColumnSums(cells,"free"),{SUM_TOP:91,SUM_MID:120,SUM_TOTAL:244});
});

test("online subtotals are private to their owner until the game ends",()=>{
 const cells={"free::1":2,"free::SUM_TOP":32,"free::SUM_MID":12,"free::SUM_TOTAL":66};
 const own=visibleCellsForPlayer(cells,{isSelf:true,gameOver:false});
 const opponent=visibleCellsForPlayer(cells,{isSelf:false,gameOver:false});
 const final=visibleCellsForPlayer(cells,{isSelf:false,gameOver:true});
 assert.equal(own["free::SUM_TOTAL"],66);
 assert.equal(opponent["free::1"],2);
 for(const row of ["SUM_TOP","SUM_MID","SUM_TOTAL"]){
  assert.equal(opponent["free::"+row],undefined);
  assert.equal(final["free::"+row],cells["free::"+row]);
 }
});


test("final recap ranks players and identifies their strongest column after applying all three sums",()=>{
 const players=[
  {id:"a",name:"Ana",cells:{"free::1":3,"free::MAX":20,"free::MIN":10,"free::TRILING":29},crossedCells:["down::YAMB"]},
  {id:"b",name:"Bojan",cells:{"free::1":2,"free::MAX":10,"free::MIN":5},crossedCells:[]}
 ];
 const results=summarizeFinalResults(players,["down","free"]);
 assert.equal(results[0].id,"a");
 assert.equal(results[0].total,62);
 assert.deepEqual(results[0].bestColumn,{columnId:"free",points:62});
 assert.deepEqual(results[0].crossedCells,["down::YAMB"]);
 assert.equal(results[1].total,12);
});
