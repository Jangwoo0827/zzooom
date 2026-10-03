// 드래그로 영역을 고르면, 페이지는 그대로 두고 그 자리에 확대된 창을 띄운다.
(() => {
  if (window.__fineZoomSelecting) return;
  window.__fineZoomSelecting = true;

  const Z = 2147483647;
  const overlay = document.createElement("div");
  overlay.style.cssText = `position:fixed;inset:0;z-index:${Z};cursor:crosshair;background:rgba(15,10,40,.35);`;
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;display:none;border:2px solid #8b5cf6;box-shadow:0 0 0 99999px rgba(15,10,40,.35);pointer-events:none;";
  const tip = document.createElement("div");
  tip.textContent = "확대할 영역을 드래그하세요 · Esc 취소";
  tip.style.cssText =
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;" +
    "background:#1e1b4b;color:#fff;font:600 13px 'Segoe UI',system-ui,sans-serif;pointer-events:none;";
  overlay.append(box, tip);
  document.documentElement.appendChild(overlay);

  let sx, sy, dragging = false;
  function cleanup() {
    overlay.remove();
    window.removeEventListener("keydown", onKey, true);
    window.__fineZoomSelecting = false;
  }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); cleanup(); } }
  window.addEventListener("keydown", onKey, true);

  overlay.addEventListener("mousedown", (e) => {
    e.preventDefault();
    sx = e.clientX; sy = e.clientY; dragging = true;
    overlay.style.background = "transparent";
    Object.assign(box.style, { display: "block", left: sx + "px", top: sy + "px", width: "0", height: "0" });
  });
  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    Object.assign(box.style, {
      left: Math.min(sx, e.clientX) + "px", top: Math.min(sy, e.clientY) + "px",
      width: Math.abs(e.clientX - sx) + "px", height: Math.abs(e.clientY - sy) + "px",
    });
  });
  overlay.addEventListener("mouseup", async (e) => {
    if (!dragging) return;
    const r = {
      x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
      w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
    };
    cleanup();
    if (r.w < 10 || r.h < 10) return;
    // 실시간 확대창은 별도 창에서 탭 화면 스트림을 받아 보여준다 (페이지는 건드리지 않음).
    chrome.runtime.sendMessage({ lens: { ...r, vw: innerWidth, vh: innerHeight } });
  });
})();
