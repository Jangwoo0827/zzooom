// 탭 화면을 실시간 영상으로 받아, 선택한 영역만 잘라서 확대해 그린다.
const p = new URLSearchParams(location.search);
const num = (k) => +p.get(k);
const vw = num("vw"), vh = num("vh"), rw = num("w"), rh = num("h");
let cx = num("x") + rw / 2, cy = num("y") + rh / 2; // 가운데에 보일 페이지 좌표(CSS px)
let mag = 200;                                       // 영역 대비 배율(%)
let step = 10;

const video = document.getElementById("v");
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const pct = document.getElementById("pct");

chrome.storage.local.get("wheelStep").then(({ wheelStep = 1 }) => (step = Math.max(1, wheelStep)));

function fail(text) {
  const m = document.getElementById("msg");
  m.textContent = text;
  m.style.display = "grid";
}

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: p.get("id"),
          maxWidth: 3840, maxHeight: 2160, maxFrameRate: 60,
        },
      },
    });
    video.srcObject = stream;
    stream.getVideoTracks()[0].onended = () => window.close();
    await video.play();
    draw();
  } catch (e) {
    fail("화면을 가져오지 못했어요. 확대할 탭에서 다시 시도해 주세요.\n" + e.message);
  }
}

function draw() {
  const dpr = devicePixelRatio;
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

  if (video.videoWidth) {
    // 창 크기 기준으로, 처음 선택한 영역이 100%일 때 창을 꽉 채우도록 맞춘다.
    const fit = Math.min(innerWidth / rw, innerHeight / rh);
    const scale = fit * mag / 100;                         // 페이지 CSS px → 창 CSS px
    const sw = innerWidth / scale, sh = innerHeight / scale; // 보이는 페이지 범위
    const kx = video.videoWidth / vw, ky = video.videoHeight / vh;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(video, (cx - sw / 2) * kx, (cy - sh / 2) * ky, sw * kx, sh * ky, 0, 0, W, H);
  }
  pct.textContent = mag + "%";
  requestAnimationFrame(draw);
}

function zoomBy(d) { mag = Math.min(2000, Math.max(25, mag + d)); }

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomBy((e.deltaY < 0 ? 1 : -1) * step);
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  canvas.classList.add("drag");
  let lx = e.clientX, ly = e.clientY;
  const move = (ev) => {
    const scale = Math.min(innerWidth / rw, innerHeight / rh) * mag / 100;
    cx -= (ev.clientX - lx) / scale; cy -= (ev.clientY - ly) / scale;
    lx = ev.clientX; ly = ev.clientY;
  };
  const up = () => {
    canvas.classList.remove("drag");
    removeEventListener("mousemove", move);
    removeEventListener("mouseup", up);
  };
  addEventListener("mousemove", move);
  addEventListener("mouseup", up);
});

document.getElementById("minus").onclick = () => zoomBy(-step);
document.getElementById("plus").onclick = () => zoomBy(step);
document.getElementById("close").onclick = () => window.close();
addEventListener("keydown", (e) => { if (e.key === "Escape") window.close(); });

start();
