import test from "node:test";
import assert from "node:assert/strict";
import { analyse, availableEntries, combinationScore, directionOrder, frontierRows, rollDice, upperBonus, upperScore, normalizeColumnIds } from "../game.js";

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
test("analyse rejects selections that do not contain exactly five dice",()=>{
 assert.deepEqual(analyse([1,2,3,4]),{valid:false});assert.deepEqual(analyse([1,2,3,4,5,6]),{valid:false});
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
 assert.equal(combinationScore("TRILING",[4,4,4,1,2]),35);
 assert.equal(combinationScore("FUL",[3,3,3,5,5]),49);
 assert.equal(combinationScore("POKER",[2,2,2,2,5]),48);
 assert.equal(combinationScore("YAMB",[6,6,6,6,6]),80);
 assert.equal(combinationScore("FUL",[3,3,3,4,5]),null);
});
test("down and up columns advance in order",()=>{
 const cells={};assert.equal(directionOrder("down",cells),"1");cells["down::1"]=2;
 assert.equal(directionOrder("down",cells),"2");assert.equal(directionOrder("up",{}),"YAMB");
});
test("R and N columns expose their two documented frontiers",()=>{
 assert.deepEqual(frontierRows("r",{}),["MAX","MIN"]);
 assert.deepEqual(frontierRows("n",{}),["1","YAMB"]);
 const cells={"r::MAX":30,"n::1":3};
 assert.deepEqual(frontierRows("r",cells),["6","MIN"]);
 assert.deepEqual(frontierRows("n",cells),["2","YAMB"]);
});
test("fewer than five dice allow numeric and MAX/MIN entries but hide combinations",()=>{
 const entries=availableEntries(["free"],{},[1,3]);
 assert.ok(entries.some(e=>e.row==="1"&&e.value===1));assert.ok(entries.some(e=>e.row==="3"&&e.value===3));
 assert.ok(entries.some(e=>e.row==="MAX"&&e.value===4));assert.ok(entries.some(e=>e.row==="MIN"&&e.value===4));
 assert.ok(!entries.some(e=>["KENTA","TRILING","FUL","POKER","YAMB"].includes(e.row)));
});
test("manual D column can only be played after the first throw",()=>{
 const dice=[1,2,3,4,5];
 assert.ok(!availableEntries(["d"],{},dice,{rolls:2}).length);
 assert.ok(availableEntries(["d"],{},dice,{rolls:1}).some(e=>e.row==="KENTA"&&e.value===66));
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
test("M column is derived and is not directly selectable",()=>{
 assert.equal(availableEntries(["m"],{},[1,2,3,4,5]).length,0);
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
 assert.deepEqual(normalizeColumnIds(["m","o","d","r","unknown","o"]),["down","free","up","r","d","o","m"]);
 assert.deepEqual(normalizeColumnIds(null),["down","free","up"]);
});
