// 페이지(MAIN world)에서 실행: Document PiP는 content script에서 직접 열 수 없어서 여기서 연다.
// 📌 클릭(사용자 동작) 순간에 동기적으로 requestWindow를 호출해야 하므로 클릭 리스너로 처리한다.
(() => {
  if (window.__fzPipReady) return;
  window.__fzPipReady = true;
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest?.("#__fzPin");
    if (!btn) return;
    const panel = document.getElementById("__fzPanel");
    if (!panel || panel.ownerDocument !== document) return; // 이미 PiP 안이면 content script가 닫기 처리
    const say = (m) => panel.dispatchEvent(new CustomEvent("__fzPipError", { detail: m }));
    if (document.pictureInPictureElement) { document.exitPictureInPicture(); return; }
    let pip;
    try {
      if (!window.documentPictureInPicture) throw new Error("Document PiP 미지원");
      pip = await documentPictureInPicture.requestWindow({ width: panel.offsetWidth, height: panel.offsetHeight });
    } catch (err) {
      // 대체: 캔버스를 영상으로 바꿔 일반 동영상 PiP로 띄운다 (항상 위, 조작은 탭 안 패널에서).
      try {
        await videoPip(panel);
        say("동영상 PiP(⏮⏭로 줌) · 문서 PiP 실패: " + err.message);
      } catch (err2) {
        say("항상 위 실패: " + err.message + " / " + err2.message);
      }
      return;
    }
    pip.document.body.style.cssText = "margin:0;height:100vh;display:flex;background:#111;overflow:hidden;";
    pip.document.title = "Fine Zoom";
    pip.document.body.appendChild(panel);
    panel.dispatchEvent(new CustomEvent("__fzPipOpen"));
    pip.addEventListener("pagehide", () => document.dispatchEvent(new CustomEvent("__fzPipClose")));
  }, true);

  async function videoPip(panel) {
    const canvas = panel.querySelector("canvas");
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = canvas.captureStream(60);
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.documentElement.appendChild(video);
    await video.play();
    await video.requestPictureInPicture();
    // 동영상 PiP 창에는 휠 이벤트가 오지 않으므로, 이전/다음 트랙 버튼을 축소/확대로 쓴다.
    const zoom = (d) => panel.dispatchEvent(new CustomEvent("__fzZoom", { detail: d }));
    navigator.mediaSession.setActionHandler("previoustrack", () => zoom(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => zoom(1));
    video.addEventListener("leavepictureinpicture", () => {
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    }, { once: true });
    video.addEventListener("leavepictureinpicture", () => video.remove(), { once: true });
    new MutationObserver((_, o) => { // 패널이 닫히면 PiP도 닫기
      if (!panel.isConnected) { o.disconnect(); if (document.pictureInPictureElement === video) document.exitPictureInPicture(); }
    }).observe(document.documentElement, { childList: true });
  }
})();
