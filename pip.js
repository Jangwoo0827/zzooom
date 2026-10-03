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
    if (!window.documentPictureInPicture) {
      panel.dispatchEvent(new CustomEvent("__fzPipError", { detail: "이 브라우저는 항상 위를 지원하지 않음" }));
      return;
    }
    let pip;
    try {
      pip = await documentPictureInPicture.requestWindow({ width: panel.offsetWidth, height: panel.offsetHeight });
    } catch (err) {
      panel.dispatchEvent(new CustomEvent("__fzPipError", { detail: "항상 위 실패: " + err.message }));
      return;
    }
    pip.document.body.style.cssText = "margin:0;height:100vh;display:flex;background:#111;overflow:hidden;";
    pip.document.title = "Fine Zoom";
    pip.document.body.appendChild(panel);
    panel.dispatchEvent(new CustomEvent("__fzPipOpen"));
    pip.addEventListener("pagehide", () => document.dispatchEvent(new CustomEvent("__fzPipClose")));
  }, true);
})();
