import test from "node:test";
import assert from "node:assert/strict";
import { analyse, availableEntries, combinationScore, directionOrder, rollDice, upperScore } from "../game.js";

test("rollDice returns the requested number of valid die values", () => {
  const dice=rollDice(6); assert.equal(dice.length,6);
  assert.ok(dice.every(value=>Number.isInteger(value)&&value>=1&&value<=6));
});
test("upper rows count only dice matching the row face", () => {
  assert.equal(upperScore([1,2,2,5,2],2),6); assert.equal(upperScore([1,2,2,5,2],6),0);
});
test("analyse rejects selections that do not contain exactly five dice", () => {
  assert.deepEqual(analyse([1,2,3,4]),{valid:false}); assert.deepEqual(analyse([1,2,3,4,5,6]),{valid:false});
});
test("Kenta scores are correct for both sequences", () => {
  assert.equal(combinationScore("KENTA",[1,2,3,4,5]),66); assert.equal(combinationScore("KENTA",[2,3,4,5,6]),56);
  assert.equal(combinationScore("KENTA",[1,2,2,4,5]),null);
});
test("combination rows require the right dice pattern and apply their bonus", () => {
  assert.equal(combinationScore("TRILING",[4,4,4,1,2]),35); assert.equal(combinationScore("FUL",[3,3,3,5,5]),49);
  assert.equal(combinationScore("POKER",[2,2,2,2,5]),53); assert.equal(combinationScore("YAMB",[6,6,6,6,6]),80);
  assert.equal(combinationScore("FUL",[3,3,3,4,5]),null);
});
test("down column advances through playable rows using column-scoped cells", () => {
  const cells={}; assert.equal(directionOrder("down",cells),"1"); cells["down::1"]=2;
  assert.equal(directionOrder("down",cells),"2"); cells["down::2"]=4; assert.equal(directionOrder("down",cells),"3");
});
test("up column starts at Yamb and advances in reverse order", () => {
  const cells={}; assert.equal(directionOrder("up",cells),"YAMB"); cells["up::YAMB"]=80;
  assert.equal(directionOrder("up",cells),"POKER"); cells["up::POKER"]=53; assert.equal(directionOrder("up",cells),"FUL");
});
test("directional columns ignore derived total rows", () => {
  const cells={"down::SUM_TOP":10,"down::SUM_MID":20,"down::SUM_TOTAL":30}; assert.equal(directionOrder("down",cells),"1");
});
test("fewer than five dice allow numeric and MAX/MIN entries but hide combinations", () => {
  const entries=availableEntries(["free"],{},[1,3]);
  assert.ok(entries.some(e=>e.row==="1"&&e.value===1)); assert.ok(entries.some(e=>e.row==="3"&&e.value===3));
  assert.ok(entries.some(e=>e.row==="MAX"&&e.value===4)); assert.ok(entries.some(e=>e.row==="MIN"&&e.value===4));
  assert.ok(!entries.some(e=>["KENTA","TRILING","FUL","POKER","YAMB"].includes(e.row)));
});
test("combination choices appear only for matching groups of five", () => {
  const short=availableEntries(["free"],{},[2,2,2]); assert.ok(!short.some(e=>e.row==="TRILING"));
  const full=availableEntries(["free"],{},[2,2,2,3,3]);
  assert.ok(full.some(e=>e.row==="TRILING"&&e.value===32)); assert.ok(full.some(e=>e.row==="FUL"&&e.value===42));
  assert.ok(!full.some(e=>e.row==="POKER"||e.row==="YAMB"));
});
test("cross-outs score zero and obey directional column order", () => {
  const cells={}; const down=availableEntries(["down"],cells,[],{crossOut:true});
  assert.deepEqual(down.map(e=>e.row),["1"]); assert.equal(down[0].value,0);
  cells["down::1"]=0; assert.deepEqual(availableEntries(["down"],cells,[],{crossOut:true}).map(e=>e.row),["2"]);
  assert.deepEqual(availableEntries(["up"],{},[],{crossOut:true}).map(e=>e.row),["YAMB"]);
});
