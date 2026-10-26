// Voice input with the browser's Web Speech API (en-IN). The browser turns speech into text; our server only
// ever receives the text. Nothing is recorded or stored by us. Typing is always available as the fallback.
//
//   const mic = listen({ onText: (t) => box.value = t, onState: (s) => ..., base: box.value });
//   mic.stop();
// States: 'listening' | 'stopped' | 'denied' | 'network' | 'error'.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechSupported = () => !!SR && !/[?&]voice=off\b/.test(location.search);

export function listen({ lang = 'en-IN', onText = () => {}, onState = () => {}, base = '' } = {}) {
  if (!SR) { onState('error'); return { stop() {}, get active() { return false; } }; }
  let active = true;
  let finals = base ? `${base.trim()} ` : '';
  let rec = null;
  let restarts = 0;

  const start = () => {
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += `${r[0].transcript.trim()} `;
        else interim += r[0].transcript;
      }
      onText(`${finals}${interim}`.replace(/\s+/g, ' ').trimStart(), { interim: !!interim });
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; onState('denied'); }
      else if (e.error === 'network') { active = false; onState('network'); }
      else if (e.error === 'aborted' || e.error === 'no-speech') { /* restart in onend */ }
      else { active = false; onState('error'); }
    };
    // Mobile Chrome ends a session after a pause; keep listening until the visitor (or the timer) stops.
    rec.onend = () => {
      if (active && restarts < 30) { restarts += 1; try { start(); } catch { active = false; onState('stopped'); } return; }
      active = false;
      onState('stopped');
    };
    rec.start();
  };

  try { start(); onState('listening'); } catch { active = false; onState('error'); }
  return {
    stop() { if (!active) return; active = false; try { rec?.stop(); } catch { /* ignore */ } },
    get active() { return active; },
    get text() { return finals.trim(); },
  };
}
