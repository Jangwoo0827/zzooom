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
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); // 오버레이가 사라진 뒤 캡처
    const src = await chrome.runtime.sendMessage({ capture: true });
    if (src) openLens(r, src);
  });

  function openLens(r, src) {
    const vw = innerWidth, vh = innerHeight;
    let zoom = 200;                                   // 창 안의 배율(%)
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2;       // 창 가운데에 보일 화면 좌표

    const lens = document.createElement("div");
    lens.style.cssText =
      `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:${Z};` +
      "overflow:hidden;background:#fff;border:2px solid #8b5cf6;border-radius:6px;" +
      "box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:grab;";
    const img = document.createElement("img");
    img.src = src;
    img.draggable = false;
    img.style.cssText = "position:absolute;max-width:none;transform-origin:0 0;image-rendering:auto;";
    lens.appendChild(img);

    const bar = document.createElement("div");
    bar.style.cssText =
      `position:fixed;z-index:${Z};display:flex;gap:4px;align-items:center;padding:4px 6px;border-radius:8px;` +
      "background:#1e1b4b;color:#fff;font:600 12px 'Segoe UI',system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);";
    const btn = (t, fn) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.style.cssText = "border:0;border-radius:5px;background:#ffffff1f;color:#fff;font:inherit;padding:2px 8px;cursor:pointer;";
      b.onclick = fn;
      return b;
    };
    const label = document.createElement("span");
    label.style.cssText = "min-width:48px;text-align:center;";
    bar.append(
      btn("−", () => setZoomBy(-step)), label, btn("+", () => setZoomBy(step)),
      btn("↻", refresh), btn("✕", close),
    );
    document.documentElement.append(lens, bar);

    let step = 10;
    chrome.storage.local.get("wheelStep").then(({ wheelStep = 1 }) => (step = Math.max(wheelStep, 1)));

    function render() {
      const s = zoom / 100;
      img.style.width = vw + "px";
      img.style.height = vh + "px";
      img.style.transform = `translate(${r.w / 2 - cx * s}px, ${r.h / 2 - cy * s}px) scale(${s})`;
      label.textContent = zoom + "%";
      const top = r.y >= 34 ? r.y - 32 : r.y + r.h + 4;
      Object.assign(bar.style, { left: r.x + "px", top: top + "px" });
    }
    function setZoomBy(d) { zoom = Math.min(2000, Math.max(100, zoom + d)); render(); }

    lens.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      setZoomBy((e.deltaY < 0 ? 1 : -1) * step);
    }, { passive: false, capture: true });

    // 드래그로 창 안의 내용을 이동
    lens.addEventListener("mousedown", (e) => {
      e.preventDefault();
      lens.style.cursor = "grabbing";
      let lx = e.clientX, ly = e.clientY;
      const move = (ev) => {
        const s = zoom / 100;
        cx -= (ev.clientX - lx) / s; cy -= (ev.clientY - ly) / s;
        lx = ev.clientX; ly = ev.clientY;
        render();
      };
      const up = () => {
        lens.style.cursor = "grab";
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", up, true);
      };
      window.addEventListener("mousemove", move, true);
      window.addEventListener("mouseup", up, true);
    });
    lens.addEventListener("dblclick", close);

    // 화면이 바뀌었을 때 다시 캡처 (확대창은 잠깐 숨김)
    async function refresh() {
      lens.style.visibility = bar.style.visibility = "hidden";
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const s = await chrome.runtime.sendMessage({ capture: true });
      if (s) img.src = s;
      lens.style.visibility = bar.style.visibility = "";
    }
    function onEsc(e) { if (e.key === "Escape") close(); }
    function close() {
      lens.remove(); bar.remove();
      window.removeEventListener("keydown", onEsc, true);
    }
    window.addEventListener("keydown", onEsc, true);
    render();
  }
})();
