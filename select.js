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
    const id = await chrome.runtime.sendMessage({ lensStream: true });
    if (id) openLens(r, id);
  });

  // 탭 화면을 실시간 영상으로 받아 선택 영역만 확대해 그리는 패널 (탭 안에 뜸).
  // 패널이 원본 영역을 가리면 자기 자신이 찍히므로, 영역 옆 빈 곳에 띄운다.
  async function openLens(r, streamId) {
    const vw = innerWidth, vh = innerHeight;
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2, mag = 200, step = 10;
    chrome.storage.local.get("wheelStep").then(({ wheelStep = 1 }) => (step = Math.max(1, wheelStep)));

    // 패널 크기: 영역의 2배, 화면 절반 이내
    const k = Math.min(2, (vw * 0.5) / r.w, (vh * 0.6) / r.h);
    const pw = Math.max(200, Math.round(r.w * k)), ph = Math.max(140, Math.round(r.h * k));
    const spots = [
      [r.x + r.w + 12, r.y], [r.x - pw - 12, r.y],
      [r.x, r.y + r.h + 12], [r.x, r.y - ph - 40],
    ];
    let [px, py] = spots.find(([x, y]) => x >= 0 && y >= 0 && x + pw <= vw && y + ph + 28 <= vh) || [vw - pw - 12, 12];

    const panel = document.createElement("div");
    panel.id = "__fzPanel";
    chrome.runtime.sendMessage({ injectPip: true });
    panel.style.cssText =
      `all:initial;position:fixed;left:${px}px;top:${py}px;z-index:${Z};display:flex;flex-direction:column;` +
      "background:#111;border:2px solid #8b5cf6;border-radius:8px;overflow:hidden;resize:both;" +
      `width:${pw}px;height:${ph + 28}px;min-width:140px;min-height:100px;box-shadow:0 10px 30px rgba(0,0,0,.4);`;
    const bar = document.createElement("div");
    bar.style.cssText =
      "all:initial;display:flex;align-items:center;gap:4px;height:28px;padding:0 6px;background:#1e1b4b;color:#fff;" +
      "cursor:move;font:600 12px 'Segoe UI',system-ui,sans-serif;flex:none;user-select:none;";
    const title = document.createElement("span");
    title.style.cssText = "all:initial;flex:1;color:#fff;font:inherit;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;";
    let status = "", pinBtn, pip = null, rafWin = window;
    const btn = (t, fn) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.style.cssText = "all:initial;border-radius:5px;background:#ffffff22;color:#fff;font:inherit;padding:2px 8px;cursor:pointer;";
      b.onmousedown = (e) => e.stopPropagation();
      b.onclick = fn;
      return b;
    };
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "all:initial;display:block;flex:1;min-height:0;width:100%;cursor:grab;";
    bar.append(title, btn("−", () => zoomBy(-step)), btn("+", () => zoomBy(step)), pinBtn = btn("📌", togglePin), btn("✕", close));
    pinBtn.id = "__fzPin";
    pinBtn.title = "항상 위 (다른 탭·프로그램 위에 띄우기)";
    panel.append(bar, canvas);
    document.documentElement.appendChild(panel);
    const ctx = canvas.getContext("2d");

    let stream, video, raf;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId,
                              maxWidth: 3840, maxHeight: 2160, maxFrameRate: 60 } },
      });
    } catch (e) {
      title.textContent = "화면을 가져오지 못함: " + e.message;
      return;
    }
    video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    function draw() {
      const dpr = devicePixelRatio;
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      if (video.videoWidth && W && H) {
        const scale = Math.min(cw / r.w, ch / r.h) * mag / 200; // 200% = 처음 패널 크기에 꼭 맞음
        const sw = cw / scale, sh = ch / scale;
        const kx = video.videoWidth / vw, ky = video.videoHeight / vh;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(video, (cx - sw / 2) * kx, (cy - sh / 2) * ky, sw * kx, sh * ky, 0, 0, W, H);
      }
      title.textContent = (status ? status + " · " : "") + mag + "%";
      rafWin = pip || window;
      raf = rafWin.requestAnimationFrame(draw); // PiP 창에선 그 창 기준으로 그림
    }
    draw();

    function zoomBy(d) { mag = Math.min(2000, Math.max(25, mag + d)); }
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      zoomBy((e.deltaY < 0 ? 1 : -1) * step);
    }, { passive: false, capture: true });

    function dragWith(e, onMove) {
      e.preventDefault();
      let lx = e.clientX, ly = e.clientY;
      const move = (ev) => { onMove(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
      const w = e.view || window; // PiP 창 안에서도 동작하도록 이벤트가 난 창 기준
      const up = () => {
        w.removeEventListener("mousemove", move, true);
        w.removeEventListener("mouseup", up, true);
      };
      w.addEventListener("mousemove", move, true);
      w.addEventListener("mouseup", up, true);
    }
    // 내용 이동
    canvas.addEventListener("mousedown", (e) => dragWith(e, (dx, dy) => {
      const scale = Math.min(canvas.clientWidth / r.w, canvas.clientHeight / r.h) * mag / 200;
      cx -= dx / scale; cy -= dy / scale;
    }));
    // 패널 이동
    bar.addEventListener("mousedown", (e) => !pip && dragWith(e, (dx, dy) => {
      px += dx; py += dy;
      panel.style.left = px + "px"; panel.style.top = py + "px";
    }));

    function onEsc(e) { if (e.key === "Escape") close(); }
    addEventListener("keydown", onEsc, true);
    // 항상 위: Document Picture-in-Picture 창으로 패널을 옮긴다.
    // 별도 창이라 원본 영역 위에 겹쳐도 자기 자신이 찍히지 않는다.
    // 📌 클릭 시 PiP 열기는 페이지 쪽 pip.js가 처리하고, 여기서는 열림/닫힘에 맞춰 상태만 바꾼다.
    let size;
    function togglePin() { if (pip) pip.close(); else size = [panel.offsetWidth, panel.offsetHeight]; }
    panel.addEventListener("__fzPipError", (e) => (status = e.detail));
    panel.addEventListener("__fzPipOpen", () => {
      pip = panel.ownerDocument.defaultView;
      Object.assign(panel.style, { position: "static", width: "100%", height: "100%", border: "0", borderRadius: "0", resize: "none" });
      bar.style.cursor = "default";
      pinBtn.style.background = "#8b5cf6";
      pip.addEventListener("keydown", onEsc, true);
      rafWin.cancelAnimationFrame(raf); draw();
    });
    function onPipClose() {
      pip = null;
      if (!stream?.active) return;
      const [w, h] = size;
      Object.assign(panel.style, { position: "fixed", left: px + "px", top: py + "px", width: w + "px", height: h + "px",
                                   border: "2px solid #8b5cf6", borderRadius: "8px", resize: "both" });
      bar.style.cursor = "move";
      pinBtn.style.background = "#ffffff22";
      document.documentElement.appendChild(panel);
      draw();
    }
    document.addEventListener("__fzPipClose", onPipClose);

    function close() {
      if (pip) { const p = pip; pip = null; p.close(); }
      rafWin.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      panel.remove();
      document.removeEventListener("__fzPipClose", onPipClose);
      removeEventListener("keydown", onEsc, true);
    }
    stream.getVideoTracks()[0].onended = close;
  }
})();
