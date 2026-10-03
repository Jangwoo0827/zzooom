const num = document.getElementById("num");
const range = document.getElementById("range");
let tab, cur = 100, busy = Promise.resolve();

function show(v) {
  cur = v;
  num.value = v;
  range.value = v;
  range.style.setProperty("--p", ((v - MIN) / (MAX - MIN)) * 100 + "%");
  document.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", +b.dataset.v === v));
}

function apply(v) {
  if (!Number.isFinite(v)) return;
  v = clamp(Math.round(v), MIN, MAX);
  show(v);
  busy = busy.then(() => setZoom(tab, v)).catch(() => {});
}

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  show(await getZoom(tab));
  num.focus(); num.select();
})();

num.addEventListener("change", () => apply(+num.value));
num.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    apply(cur + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
  } else if (e.key === "Enter") apply(+num.value);
});
document.querySelector(".display").addEventListener("wheel", (e) => {
  e.preventDefault();
  apply(cur + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });
range.addEventListener("input", () => apply(+range.value));
document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => apply(cur + +b.dataset.d)));
document.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => apply(+b.dataset.v)));
const wstep = document.getElementById("wstep");
chrome.storage.local.get("wheelStep").then(({ wheelStep = 1 }) => (wstep.value = wheelStep));
wstep.addEventListener("change", () => {
  const v = clamp(Math.round(+wstep.value) || 1, 1, 100);
  wstep.value = v;
  chrome.storage.local.set({ wheelStep: v });
});

document.getElementById("area").onclick = async () => {
  await chrome.runtime.sendMessage({ startArea: tab.id });
  window.close();
};

document.getElementById("reset").onclick = () => apply(100);
