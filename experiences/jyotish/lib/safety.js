// Adapter for core's shared safety (CONTRACT section 13). Uses ctx.safety when core provides it; until then a
// local fallback with the same shapes, so Jyotish can ship now and switch over without code changes.
//   const safety = safetyFor(ctx, { mode });
//   safety.registerAll(banks, templates)          -> registers every bank line and template (core + local copy)
//   safety.publicText(name, idOrSlots)            -> { pt, text }
//   await safety.judge([{ id, text }])            -> Set of APPROVED ids (fail closed: anything else is replaced)
//   safety.input(req, ...texts) / careResponse(res)
// TODO(core): drop the fallback branch once core/server/safety.js is in every deploy.
import { breaks } from './guard.js';
import { templateRegex } from './public.js';

let careDetect = null;
async function loadCare() {
  if (careDetect) return careDetect;
  try { careDetect = (await import('../../../core/web/care-words.js')).detect; } catch { careDetect = () => false; }
  return careDetect;
}

export function safetyFor(ctx, { mode = () => 'mock', exp = 'jyotish' } = {}) {
  const core = ctx.safety || null;
  const local = { banks: new Map(), templates: new Map() };

  function registerAll(banks, templates) {
    for (const [name, lines] of Object.entries(banks)) {
      local.banks.set(name, lines);
      core?.bank(name, lines);
    }
    for (const [id, [text, slots]] of Object.entries(templates)) {
      local.templates.set(id, { text, slots, ...templateRegex(text, slots) });
      core?.template(id, text, slots);
    }
  }

  function publicText(name, arg) {
    if (core) return core.publicText(name, arg);
    if (typeof arg === 'string') {
      const text = local.banks.get(name)?.[arg];
      if (text === undefined) throw new Error(`publicText: unknown ${name}.${arg}`);
      return { pt: `${exp}.${name}.${arg}`, text };
    }
    const t = local.templates.get(name);
    if (!t) throw new Error(`publicText: unknown template ${name}`);
    const text = t.text.replace(/\{(\w+)\}/g, (_, n) => String(arg?.[n]));
    if (!t.re.test(text)) throw new Error(`publicText: bad slot for ${name}`);
    return { pt: `${exp}.${name}`, text };
  }

  /**
   * Judge phone-only model lines. Returns the Set of ids that are APPROVED; every other line is replaced by the
   * caller with the curated line for its slot (fail closed, CHECK-02b R1).
   * Core: { ok, flagged }; approved = ok minus flagged. Fallback: mock/offline = rule pass, live = approve nothing.
   */
  async function judge(items) {
    const list = items.filter((x) => x.text);
    if (!list.length) return new Set();
    if (core) {
      try {
        const r = await core.judge(list);
        const ok = new Set((r?.ok || []).map((x) => (typeof x === 'string' ? x : x?.id)));
        for (const id of r?.flagged || []) ok.delete(id);
        return ok;
      } catch { return new Set(); }
    }
    if (mode() === 'live') return new Set(); // no shared judge yet: the phone shows curated lines only
    return new Set(list.filter((x) => !breaks(x.text)).map((x) => x.id));
  }

  async function input(req, ...texts) {
    if (core) return core.input(req, ...texts);
    const detect = await loadCare();
    return texts.some((t) => typeof t === 'string' && detect(t));
  }
  function careResponse(res) { return core ? core.careResponse(res) : res.json({ care: true }); }

  return { registerAll, publicText, judge, input, careResponse, core: !!core };
}
