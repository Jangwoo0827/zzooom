importScripts("zoom.js");

// 탭별로 요청을 직렬화해서 빠른 휠 입력에도 값이 꼬이지 않게 한다.
const queues = new Map();
// 휠/단축키는 브라우저 기본 범위(25~500%) 안에서만 움직인다. 범위 밖은 팝업 전용.
// 팝업으로 범위 밖에 있을 때: 범위 쪽으로는 경계값으로 들어오고, 바깥쪽으로는 무시.
function nudge(dir) {
  return async (z) => {
    const { wheelStep = 1 } = await chrome.storage.local.get("wheelStep");
    if ((z < NATIVE_MIN && dir < 0) || (z > NATIVE_MAX && dir > 0)) return z;
    return clamp(z + dir * wheelStep, NATIVE_MIN, NATIVE_MAX);
  };
}

function step(tab, fn) {
  const prev = queues.get(tab.id) || Promise.resolve();
  const next = prev.then(async () => setZoom(tab, await fn(await getZoom(tab)))).catch(() => {});
  queues.set(tab.id, next);
  return next;
}

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (cmd === "zoom-in") step(tab, nudge(1));
  else if (cmd === "zoom-out") step(tab, nudge(-1));
  else if (cmd === "zoom-reset") step(tab, () => 100);
  else if (cmd === "zoom-area") startAreaSelect(tab.id);
});

function startAreaSelect(tabId) {
  return chrome.scripting.executeScript({ target: { tabId }, files: ["select.js"] }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.wheel && sender.tab) step(sender.tab, nudge(msg.wheel));
  else if (msg.startArea) startAreaSelect(msg.startArea);
  else if (msg.lens && sender.tab) openLens(sender.tab, msg.lens);
});

// 선택 영역 위에 실시간 확대창(별도 팝업 창)을 띄운다.
async function openLens(tab, r) {
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    console.warn("tabCapture 실패", e);
    return;
  }
  // 페이지 CSS px → 화면 좌표(DIP). 크롬 자체 줌 배율만 화면 크기에 영향을 준다.
  const z = await chrome.tabs.getZoom(tab.id);
  const win = await chrome.windows.get(tab.windowId);
  const contentW = r.vw * z, contentH = r.vh * z;
  const left = win.left + Math.max(0, (win.width - contentW) / 2);
  const top = win.top + Math.max(0, win.height - contentH - 8);
  const q = new URLSearchParams({ id: streamId, tab: tab.id, x: r.x, y: r.y, w: r.w, h: r.h, vw: r.vw, vh: r.vh });
  await chrome.windows.create({
    url: "lens.html?" + q,
    type: "popup",
    left: Math.round(left + r.x * z),
    top: Math.round(top + r.y * z) - 31,      // 창 제목 표시줄 높이만큼 위로
    width: Math.max(160, Math.round(r.w * z) + 16),
    height: Math.max(120, Math.round(r.h * z) + 39),
  });
}

// 설치/업데이트 시 이미 열린 탭에도 content script 주입 (Ctrl+휠 바로 사용 가능)
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({})) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }
});
