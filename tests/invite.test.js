import test from "node:test";
import assert from "node:assert/strict";
import { readInviteCode, buildInviteUrl } from "../invite.js";

test("room invite links preserve the page URL and prefill a valid code",()=>{
 const link=buildInviteUrl("https://example.com/game?mode=online#rules","ab123");
 assert.equal(link,"https://example.com/game?mode=online&room=AB123");
 assert.equal(readInviteCode(new URL(link).search),"AB123");
 assert.equal(readInviteCode("?room=%3Cscript%3E"),"");
 assert.equal(readInviteCode("?room=AAAA"),"");
 assert.throws(()=>buildInviteUrl("https://example.com/","bad code"),TypeError);
});
