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
  else if (msg.capture && sender.tab) {
    // 영역 확대창용: 현재 보이는 화면을 캡처해서 돌려준다.
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" })
      .then(reply, () => reply(null));
    return true;
  }
});

// 설치/업데이트 시 이미 열린 탭에도 content script 주입 (Ctrl+휠 바로 사용 가능)
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({})) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }
});
