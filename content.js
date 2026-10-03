if (!window.__fineZoom) {
  window.__fineZoom = true;

  chrome.storage.local.get("css").then(({ css = {} }) => {
    const f = css[location.origin];
    if (f && document.documentElement) document.documentElement.style.zoom = String(f);
  });

  // Ctrl+휠: 기본 10% 단위 줌을 막고 1%씩 조절
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey || e.deltaY === 0) return;
    e.preventDefault();
    chrome.runtime.sendMessage({ wheel: e.deltaY < 0 ? 1 : -1 }).catch(() => {});
  }, { passive: false, capture: true });
}
