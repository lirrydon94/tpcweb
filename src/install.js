const dialog = document.querySelector('#install-dialog');
const entry = document.querySelector('#install-entry');
const confirm = document.querySelector('#install-confirm');
const dismiss = document.querySelector('#install-dismiss');
const guide = document.querySelector('#install-guide');
const status = document.querySelector('#install-status');
const displayMode = window.matchMedia('(display-mode: standalone)');
const mobile = window.matchMedia('(max-width: 800px), (pointer: coarse)');
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = /Android/i.test(navigator.userAgent);
const dismissalKey = `rssb-install-dismissed:${new URL('../', import.meta.url).pathname}`;
const week = 7 * 24 * 60 * 60 * 1000;
let pendingPrompt;
let installed = false;
let shownThisVisit = false;
const standalone = () => installed || displayMode.matches || navigator.standalone === true;

function recentlyDismissed() {
  try { return Date.now() - Number(localStorage.getItem(dismissalKey) || 0) < week; }
  catch { return false; }
}
function rememberDismissal() {
  try { localStorage.setItem(dismissalKey, String(Date.now())); } catch {}
}
function update() {
  entry.hidden = standalone() || !mobile.matches || !(ios || android || pendingPrompt);
  confirm.textContent = pendingPrompt ? 'Installera appen' : 'Visa hur du installerar';
  if (standalone() && dialog.open) dialog.close();
}
function show(auto = false) {
  update();
  if (entry.hidden || dialog.open || document.visibilityState === 'hidden') return;
  if (auto && (shownThisVisit || recentlyDismissed() || document.querySelector('dialog[open]'))) return;
  shownThisVisit = true;
  guide.hidden = true;
  confirm.hidden = false;
  status.textContent = '';
  dismiss.textContent = 'Inte nu';
  dialog.showModal();
}
function showGuide() {
  guide.innerHTML = ios
    ? '<ol><li>Öppna sidan i <strong>Safari</strong> om den visas i en annan app.</li><li>Tryck på <strong>Dela</strong> (fyrkanten med pil uppåt). Den kan ligga under menyn med tre punkter.</li><li>Välj <strong>Lägg till på hemskärmen</strong>. Välj Visa mer om det behövs.</li><li>Låt <strong>Öppna som webbapp</strong> vara aktiverat om valet visas, och tryck på <strong>Lägg till</strong>.</li></ol>'
    : '<ol><li>Öppna sidan i <strong>Chrome</strong> om den visas i en annan app.</li><li>Öppna webbläsarens meny <strong>⋮</strong>.</li><li>Välj <strong>Installera appen</strong> eller <strong>Lägg till på startskärmen</strong> och sedan Installera om valet visas.</li><li>Öppna <strong>RSSB</strong> via den nya ikonen på hemskärmen.</li></ol>';
  guide.hidden = false;
  confirm.hidden = true;
  dismiss.textContent = 'Stäng';
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  update();
  if (dialog.open) {
    guide.hidden = true;
    confirm.hidden = false;
    dismiss.textContent = 'Inte nu';
    status.textContent = '';
  }
  show(true);
});
window.addEventListener('appinstalled', () => {
  installed = true;
  pendingPrompt = undefined;
  rememberDismissal();
  update();
});
displayMode.addEventListener('change', update);
mobile.addEventListener('change', update);
document.querySelector('#install-open').addEventListener('click', () => show());
dismiss.addEventListener('click', () => {
  rememberDismissal();
  dialog.close();
});
dialog.addEventListener('close', rememberDismissal);
dialog.addEventListener('cancel', rememberDismissal);
confirm.addEventListener('click', async () => {
  if (!pendingPrompt) { showGuide(); return; }
  const prompt = pendingPrompt;
  pendingPrompt = undefined;
  confirm.disabled = true;
  try {
    // Call directly from the tap so the browser permits the installation dialog.
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      entry.hidden = true;
      dialog.close();
    } else {
      dialog.close();
      update();
    }
  } catch {
    status.textContent = 'Installationsrutan kunde inte öppnas. Följ stegen nedan.';
    showGuide();
  } finally { confirm.disabled = false; }
});
// Relative URLs support both local hosting and the GitHub Pages /tpcweb/ path.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' })
    .catch(() => { /* Manual installation remains available. */ });
}
update();
setTimeout(() => show(true), 1800);
