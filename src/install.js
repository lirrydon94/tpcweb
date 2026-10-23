const dialog = document.querySelector('#install-dialog');
const entry = document.querySelector('#install-entry');
const confirm = document.querySelector('#install-confirm');
const help = document.querySelector('#install-help');
const dismiss = document.querySelector('#install-dismiss');
const guide = document.querySelector('#install-guide');
const status = document.querySelector('#install-status');
const displayMode = window.matchMedia('(display-mode: standalone)');
const mobile = window.matchMedia('(max-width: 800px), (pointer: coarse)');
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = /Android/i.test(navigator.userAgent);
const samsung = /SamsungBrowser/i.test(navigator.userAgent);
const dismissalKey = `rssb-install-dismissed:${new URL('../', import.meta.url).pathname}`;
const week = 7 * 24 * 60 * 60 * 1000;
let pendingPrompt;
let installed = false;
let installationRequested = false;
let prompting = false;
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
  document.querySelector('#install-open').textContent = installationRequested
    ? 'Installationshjälp för RSSB' : 'Lägg till RSSB på hemskärmen';
  confirm.textContent = pendingPrompt ? 'Installera appen' : 'Visa hur du installerar';
  if (standalone() && dialog.open) dialog.close();
}
function show(auto = false) {
  update();
  if (entry.hidden || dialog.open || document.visibilityState === 'hidden') return;
  if (auto && (installationRequested || shownThisVisit || recentlyDismissed() || document.querySelector('dialog[open]'))) return;
  shownThisVisit = true;
  guide.hidden = true;
  confirm.hidden = false;
  help.hidden = !android;
  status.textContent = '';
  dismiss.textContent = 'Inte nu';
  if (installationRequested) showRequested();
  dialog.showModal();
}
function showRequested() {
  installationRequested = true;
  guide.hidden = true;
  confirm.hidden = true;
  help.hidden = false;
  status.textContent = 'Installationen har begärts. Följ statusen i telefonens aviseringar. När den är klar hittar du RSSB på hemskärmen eller i applistan. Om ingen ikon dyker upp eller installationen misslyckas, tryck på Problem med installationen?';
  dismiss.textContent = 'Fortsätt till schemat';
  update();
}
function showGuide(troubleshooting = false) {
  guide.innerHTML = ios
    ? '<ol><li>Öppna sidan i <strong>Safari</strong> om den visas i en annan app.</li><li>Tryck på <strong>Dela</strong> (fyrkanten med pil uppåt). Den kan ligga under menyn med tre punkter.</li><li>Välj <strong>Lägg till på hemskärmen</strong>. Välj Visa mer om det behövs.</li><li>Låt <strong>Öppna som webbapp</strong> vara aktiverat om valet visas, och tryck på <strong>Lägg till</strong>.</li></ol>'
    : samsung
      ? '<ol><li>I <strong>Samsung Internet</strong>: tryck på installationsikonen i adressfältet om den visas, eller öppna menyn <strong>☰</strong> och välj <strong>Lägg till sida i → Hemskärm</strong> om valet finns.</li><li>Bekräfta och följ statusen i telefonens aviseringar. Öppna sedan <strong>RSSB</strong> från hemskärmen eller applistan.</li><li>Om installationen misslyckas: kopiera sidans adress, öppna samma adress i <strong>Google Chrome</strong> och välj <strong>⋮ → Lägg till på startskärmen → Installera</strong>. Menyn kan också heta <strong>Installera appen</strong>.</li></ol>'
      : '<ol><li>Öppna sidans adress direkt i <strong>Google Chrome</strong> om sidan visas inne i kamera- eller QR-appen.</li><li>Öppna webbläsarens meny <strong>⋮</strong>.</li><li>Välj <strong>Installera appen</strong> eller <strong>Lägg till på startskärmen</strong> och sedan Installera om valet visas.</li><li>Följ statusen i telefonens aviseringar. Öppna sedan <strong>RSSB</strong> från hemskärmen eller applistan.</li></ol>';
  if (android) {
    guide.innerHTML += '<p>Om installationen fortfarande misslyckas: uppdatera webbläsaren och försök igen, eller prova samma adress i en annan webbläsare, till exempel Chrome eller Samsung Internet. Schemat går att använda direkt på den här sidan under tiden.</p>';
  }
  if (troubleshooting) status.textContent = 'Ingen RSSB-ikon eller ett meddelande om att installationen misslyckades? Prova stegen nedan.';
  guide.hidden = false;
  confirm.hidden = true;
  help.hidden = true;
  dismiss.textContent = 'Stäng';
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  installationRequested = false;
  update();
  if (dialog.open) {
    guide.hidden = true;
    confirm.hidden = false;
    help.hidden = !android;
    dismiss.textContent = 'Inte nu';
    status.textContent = '';
  }
  show(true);
});
window.addEventListener('appinstalled', () => {
  pendingPrompt = undefined;
  rememberDismissal();
  // Android fires this before its app package is ready, and installation can
  // still fail later. Keep recovery help available in the browser tab.
  if (android) {
    installationRequested = true;
    if (dialog.open) showRequested();
  } else installed = true;
  update();
});
displayMode.addEventListener('change', update);
mobile.addEventListener('change', update);
document.querySelector('#install-open').addEventListener('click', () => show());
help.addEventListener('click', () => showGuide(true));
dismiss.addEventListener('click', () => {
  rememberDismissal();
  dialog.close();
});
dialog.addEventListener('close', rememberDismissal);
dialog.addEventListener('cancel', rememberDismissal);
confirm.addEventListener('click', async () => {
  if (prompting) return;
  if (!pendingPrompt) { showGuide(); return; }
  const prompt = pendingPrompt;
  pendingPrompt = undefined;
  prompting = true;
  confirm.disabled = true;
  try {
    // Call directly from the tap so the browser permits the installation dialog.
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      if (android) showRequested();
      else { entry.hidden = true; dialog.close(); }
    } else {
      dialog.close();
      update();
    }
  } catch {
    status.textContent = 'Installationsrutan kunde inte öppnas. Följ stegen nedan.';
    showGuide();
  } finally { prompting = false; confirm.disabled = false; }
});
// Relative URLs support both local hosting and the GitHub Pages /tpcweb/ path.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' })
    .catch(() => { /* Manual installation remains available. */ });
}
update();
setTimeout(() => show(true), 1800);
