import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_DESTINATIONS, navigateToGame } from "../game-navigation.js";
import { translateText } from "../i18n.js";
test("cross-game navigation goes directly to Ludo while All games opens the hub", () => {
  assert.equal(GAME_DESTINATIONS.hub,"/");
  assert.equal(GAME_DESTINATIONS.ludo,"https://ne-ljuti-se-covece-2.onrender.com/covece");
  assert.equal(translateText("Ne ljuti se","en"),"Ludo");
  for (const destination of Object.values(GAME_DESTINATIONS)) {
    const effects=[];
    assert.equal(navigateToGame(destination,{confirmLeave:()=>true,saveSolo:()=>effects.push("save"),navigate:url=>effects.push(url)}),true);
    assert.deepEqual(effects,["save",destination]);
    const canceled=[];
    assert.equal(navigateToGame(destination,{confirmLeave:()=>false,saveSolo:()=>canceled.push("save"),navigate:url=>canceled.push(url)}),false);
    assert.deepEqual(canceled,[]);
  }
  assert.throws(()=>navigateToGame("https://example.com",{}),/Unknown navigation/);
});
test("both game menu and Serbian/English hub entries wire direct destinations", async () => {
  const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
  assert.match(app,/data-nav="ludo"/);
  assert.match(app,/navigateToGame\(GAME_DESTINATIONS\[button.dataset.nav\]/);
  assert.match(app,/leavingForHub=true;window.location.assign\(destination\)/);
  for(const path of ["../hub/index.html","../hub/en.html"]) {
    const page=await readFile(new URL(path,import.meta.url),"utf8");
    const links=[...page.matchAll(/href="(https:[^"]+)"/g)].map(match=>match[1]);
    assert.equal(links.length,2);
    assert.ok(links.every(link=>link===GAME_DESTINATIONS.ludo));
    assert.equal([...page.matchAll(/href="\/jamb"/g)].length,2);
  }
});

test("mobile navigation buttons use their content width instead of full rail width", async () => {
  const css=await readFile(new URL("../arena.css",import.meta.url),"utf8");
  assert.match(css,/\.main-nav button \{ flex:1 0 auto; width:auto; \}/);
});
