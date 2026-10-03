// 크롬 자체 줌은 25%~500%만 지원하므로, 범위 밖은 페이지에 CSS zoom을 곱해서 처리한다.
const MIN = 5, MAX = 1000;
const NATIVE_MIN = 25, NATIVE_MAX = 500;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

async function getCss() {
  return (await chrome.storage.local.get("css")).css || {};
}

async function getZoom(tab) {
  const native = Math.round((await chrome.tabs.getZoom(tab.id)) * 100);
  const factor = (await getCss())[originOf(tab.url)] || 1;
  return Math.round(native * factor);
}

async function setZoom(tab, percent) {
  percent = clamp(Math.round(percent), MIN, MAX);
  const native = clamp(percent, NATIVE_MIN, NATIVE_MAX);
  const factor = percent / native;
  const origin = originOf(tab.url);

  const css = await getCss();
  if (origin) {
    if (factor === 1) delete css[origin]; else css[origin] = factor;
    await chrome.storage.local.set({ css });
  }
  await chrome.tabs.setZoom(tab.id, native / 100);
  // 메시지 대신 직접 주입: 설치 전에 열려 있던 탭에도 적용된다.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (f) => { document.documentElement.style.zoom = f === 1 ? "" : String(f); },
      args: [factor],
    });
  } catch {} // chrome:// 등 주입 불가 페이지는 25~500%만 적용
  return percent;
}
