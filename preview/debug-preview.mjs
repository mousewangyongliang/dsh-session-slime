// Debug the preview page over CDP: console errors + DOM probes.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const URL_ = "file:///C:/Users/Dell_wang/Documents/deepseek-harness/default-workspace/plugins/dsh-session-slime/preview/preview.html";
const PROFILE = "C:/Users/Dell_wang/Documents/deepseek-harness/default-workspace/plugins/dsh-session-slime/preview/.chrome-debug";

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
  "--window-size=1020,560", "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const res = await fetch("http://127.0.0.1:" + PORT + "/json/version");
    wsUrl = (await res.json()).webSocketDebuggerUrl;
  } catch { await sleep(150); }
}
if (!wsUrl) { console.log("no devtools"); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else events.push(msg);
});
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res) => pending.set(id, res));
}

const targets = (await send("Target.getTargets")).result.targetInfos;
const pageTarget = targets.find((t) => t.type === "page");
const { sessionId } = (await send("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true })).result;
await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
await sleep(2500);

const probe = await send("Runtime.evaluate", {
  expression: '(' + [
    '(function () {',
    '  var row = document.querySelector(\'[data-row-key^="session:"]\');',
    '  var cs = getComputedStyle(row, "::before");',
    '  var api = window.__DSH_SLIME_PREVIEW__;',
    '  var out = {',
    '    cssLen: document.getElementById("dsh-session-slime-style").textContent.length,',
    '    beforeWidth: cs.width,',
    '    beforeBg: (cs.backgroundImage || "").slice(0, 60),',
    '    styleAttr: (row.getAttribute("style") || "").slice(0, 120),',
    '    iconLen: api ? api.iconUri("preview-idle-1", "idle", 0).length : -1,',
    '    trySet: (function () { row.style.setProperty("--dsh-test", "x"); return row.style.getPropertyValue("--dsh-test"); })()',
    '  };',
    '  return out;',
    '})()'
  ].join("\n") + ')',
  returnByValue: true
}, sessionId);

console.log("PROBE", JSON.stringify(probe.result?.result?.value ?? probe).slice(0, 2000));
const errs = events.filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded");
console.log("ERRORS", JSON.stringify(errs.map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text).slice(0, 6), null, 1));
ws.close();
chrome.kill();
