// Verify the plugin against the real DSH web UI over CDP.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const PROFILE = "C:/Users/Dell_wang/Documents/deepseek-harness/default-workspace/plugins/dsh-session-slime/preview/.chrome-real";
const URL_ = process.env.DSH_URL;
const OUT = "C:/Users/Dell_wang/Documents/deepseek-harness/default-workspace/plugins/dsh-session-slime/preview/real-states.png";

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
  "--window-size=1100,820", "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
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
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 820, deviceScaleFactor: 2, mobile: false }, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
await sleep(12000);

async function evalJs(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (res.result && res.result.exceptionDetails) {
    return { __error: res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text };
  }
  return res.result?.result?.value;
}

const PROBE_BEFORE = [
  "(function () {",
  "  var rows = document.querySelectorAll('[data-row-key^=\"session:\"]');",
  "  return {",
  "    rows: rows.length,",
  "    painted: Array.from(rows).filter(function (r) { return !!r.getAttribute('data-dsh-slime-state'); }).length,",
  "    states: Array.from(rows).map(function (r) { return r.getAttribute('data-dsh-slime-state'); }),",
  "    styled: !!document.getElementById('dsh-session-slime-style'),",
  "    lead: Array.from(rows).filter(function (r) { return r.classList.contains('dsh-slime-lead'); }).length",
  "  };",
  "})()"
].join("\n");

const INJECT = [
  "(function () {",
  "  var rows = document.querySelectorAll('[data-row-key^=\"session:\"]');",
  "  var plan = [[0, 'ongoing'], [1, 'warning'], [2, 'done']];",
  "  var out = [];",
  "  plan.forEach(function (p) {",
  "    var row = rows[p[0]];",
  "    if (!row) return;",
  "    var slot = row.querySelector('[class*=\"_slot\"]');",
  "    if (!slot) return;",
  "    var olds = slot.querySelectorAll('[data-state]');",
  "    for (var i = 0; i < olds.length; i++) olds[i].remove();",
  "    var html = p[1] === 'ongoing'",
  "      ? '<svg data-state=\"ongoing\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9.5\" fill=\"none\" stroke=\"#4a7bf7\" stroke-width=\"2.4\"/></svg>'",
  "      : '<span data-state=\"' + p[1] + '\" style=\"width:10px;height:10px;border-radius:50%;display:inline-block;background:' + (p[1] === 'warning' ? '#f6a21c' : '#2fbf5b') + '\"></span>';",
  "    slot.insertAdjacentHTML('beforeend', html);",
  "    out.push({ row: p[0], wants: p[1] });",
  "  });",
  "  return out;",
  "})()"
].join("\n");

const PROBE_AFTER = [
  "(function () {",
  "  var rows = document.querySelectorAll('[data-row-key^=\"session:\"]');",
  "  return Array.from(rows).slice(0, 5).map(function (r) {",
  "    var cs = getComputedStyle(r, '::before');",
  "    return {",
  "      key: r.getAttribute('data-row-key').slice(0, 26),",
  "      state: r.getAttribute('data-dsh-slime-state'),",
  "      anim: cs.animationName,",
  "      icon: (r.style.getPropertyValue('--dsh-slime-icon') || '').slice(0, 24)",
  "    };",
  "  });",
  "})()"
].join("\n");

const DISMISS = [
  "(function () {",
  "  var btns = Array.from(document.querySelectorAll('button, [role=\"button\"]'));",
  "  var hit = btns.filter(function (b) { return (b.textContent || '').trim() === '继续'; })[0];",
  "  if (hit) { hit.click(); return 'clicked'; }",
  "  return 'no-modal';",
  "})()"
].join("\n");
console.log("DISMISS_RESULT", await evalJs(DISMISS));
await sleep(700);

console.log("BEFORE", JSON.stringify(await evalJs(PROBE_BEFORE)));
console.log("INJECTED", JSON.stringify(await evalJs(INJECT)));
await sleep(900);
const after = await evalJs(PROBE_AFTER);
console.log("AFTER", JSON.stringify(after, null, 1));

const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
if (shot.result?.data) {
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
  console.log("SHOT", OUT, fs.statSync(OUT).size);
}

const zoom = await send("Page.captureScreenshot", { format: "png", clip: { x: 8, y: 380, width: 350, height: 230, scale: 4 } }, sessionId);
if (zoom.result?.data) {
  const zPath = OUT.replace("real-states.png", "real-states-zoom.png");
  fs.writeFileSync(zPath, Buffer.from(zoom.result.data, "base64"));
  console.log("ZOOM", zPath, fs.statSync(zPath).size);
}

const errs = events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params?.entry?.level === "error"));
console.log("ERRORS", JSON.stringify(errs.map((e) => (e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text || "").slice(0, 200)).slice(0, 8), null, 1));

ws.close();
chrome.kill();
