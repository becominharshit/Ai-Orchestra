// The three AI sharks: stylised cartoon characters drawn in SVG (not real people, not any TV show's judges).
// Shared by the phone app (app.js) and the TV hook (tv.js).
//   avatar('vc')            -> <div class="sk-av" data-shark="vc"><svg>...</svg></div>
//   el.classList.add('talk') makes the mouth move, 'is-active' / 'is-dim' / 'is-in' / 'is-out' change the look.

export const SHARKS = [
  { id: 'vc', name: 'Shark VC', short: 'VC', role: 'Market + scale', icon: 'rocket', color: '#62BBF3', body: ['#9BDCFF', '#3C86D8', '#1F4F9E'] },
  { id: 'mkt', name: 'Shark Marketing', short: 'Marketing', role: 'Customer + brand', icon: 'heart', color: '#FF8FC0', body: ['#FFB3D6', '#E0539A', '#9C2A67'] },
  { id: 'fin', name: 'Shark Finance', short: 'Finance', role: 'Price + margin', icon: 'chart', color: '#FFC861', body: ['#FFE19A', '#F0A33A', '#B4661A'] },
];
// AI Sharks v2 personas: fictional archetypes (not real people, not parodies of anyone). Drawn as the same
// cartoon shark with their own colours and props. Names, bios and lenses also live in lib/v2/personas.js.
export const PERSONAS = [
  { id: 'seth', name: 'Seth Dhanraj', short: 'Seth', label: 'SETH', role: 'Margin + distribution', catch: 'Margin kitna hai, beta?', bio: 'Purane zamane ka business baron. 40 saal se dukaan se godown tak sab dekha hai.', icon: 'chart', color: '#FFC861', body: ['#FFE0A3', '#E0A04A', '#9A5A1C'] },
  { id: 'riya', name: 'Riya Rao', short: 'Riya', label: 'RIYA', role: 'Customer + brand', catch: 'Insta pe bikega?', bio: 'D2C beauty brand ki founder. Customer ki nas nas pehchaanti hai.', icon: 'heart', color: '#FF8FC0', body: ['#FFC2D6', '#E45B8F', '#9C2A5E'] },
  { id: 'kabir', name: "Kabir 'Scale' Mehta", short: 'Kabir', label: 'KABIR', role: 'Market + scale', catch: '10x kaise hoga?', bio: 'Bengaluru ka SaaS founder, ab VC. Har idea ko 10x karke dekhta hai.', icon: 'rocket', color: '#62BBF3', body: ['#9BDCFF', '#3C86D8', '#1F4F9E'] },
  { id: 'mummy', name: 'Mummy Angel Investor', short: 'Mummy', label: 'MUMMY', role: 'Risk + trust', catch: 'Safe hai na? Mera paisa doob toh nahi jayega?', bio: 'Ghar ki CFO. Har rupaye ka hisaab, aur sabse zyada pyaar.', icon: 'shield', color: '#C49BFF', body: ['#E3D0FF', '#9A6EE0', '#5B3A9E'] },
];
export const PERSONA = Object.fromEntries(PERSONAS.map((s) => [s.id, s]));
export const SHARK = Object.fromEntries([...SHARKS, ...PERSONAS].map((s) => [s.id, s]));

let n = 0;

// Accessories: VC wears aviator shades, Marketing a headset with mic, Finance round specs and a bow tie.
function extras(id, u) {
  if (id === 'seth') {
    return `
    <g fill="none" stroke="#7A4A0E" stroke-width="3.5">
      <circle cx="72" cy="106" r="18"/><circle cx="128" cy="106" r="18"/><path d="M90 104 Q100 98 110 104"/>
      <path d="M54 102 L36 96 M146 102 L164 96" stroke-linecap="round"/>
    </g>
    <circle cx="72" cy="106" r="16" fill="#FFE9A8" fill-opacity=".18"/><circle cx="128" cy="106" r="16" fill="#FFE9A8" fill-opacity=".18"/>
    <path class="sk-stache" d="M100 136 C92 128 74 128 62 138 C56 143 50 142 46 136 C48 150 66 154 80 146 C90 141 96 140 100 142 C104 140 110 141 120 146 C134 154 152 150 154 136 C150 142 144 143 138 138 C126 128 108 128 100 136 Z" fill="#E9E4DA" stroke="#9C958A" stroke-width="2"/>
    <path d="M56 186 L100 206 L144 186 L150 212 L50 212 Z" fill="#7A1F2B"/>
    <path d="M100 206 L100 214" stroke="#E9B44C" stroke-width="3"/><circle cx="100" cy="196" r="3" fill="#E9B44C"/>
    <circle cx="86" cy="200" r="2.6" fill="#E9B44C"/><circle cx="114" cy="200" r="2.6" fill="#E9B44C"/>`;
  }
  if (id === 'riya') {
    return `
    <g transform="translate(0 -4)">
      <path d="M52 60 Q54 52 64 52 L92 52 Q98 52 97 58 L95 66 Q93 74 82 74 L68 74 Q56 74 54 66 Z" fill="url(#${u}l)"/>
      <path d="M148 60 Q146 52 136 52 L108 52 Q102 52 103 58 L105 66 Q107 74 118 74 L132 74 Q144 74 146 66 Z" fill="url(#${u}l)"/>
      <path d="M97 58 Q100 55 103 58" stroke="#141033" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M60 58 L72 58 M110 58 L122 58" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round"/>
    </g>
    <circle cx="24" cy="146" r="9" fill="none" stroke="#FFD27A" stroke-width="3.5"/><circle cx="176" cy="146" r="9" fill="none" stroke="#FFD27A" stroke-width="3.5"/>
    <path class="sk-twinkle" d="M170 36 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#FFE08A"/>
    <path class="sk-twinkle b" d="M28 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff"/>
`;
  }
  if (id === 'kabir') {
    return `
    <g fill="none" stroke="#141033" stroke-width="4">
      <rect x="54" y="94" width="36" height="26" rx="7"/><rect x="110" y="94" width="36" height="26" rx="7"/><path d="M90 104 Q100 99 110 104"/>
    </g>
    <path d="M40 184 C60 200 140 200 160 184 L168 214 L32 214 Z" fill="#2B2F5E"/>
    <path d="M40 184 C60 200 140 200 160 184" fill="none" stroke="#3E4486" stroke-width="5"/>
    <path d="M88 196 L86 214 M112 196 L114 214" stroke="#EAF6FF" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 168 C34 196 166 196 170 168" fill="none" stroke="#141033" stroke-width="6" stroke-linecap="round"/>
    <rect x="22" y="160" width="16" height="20" rx="7" fill="#141033"/><rect x="162" y="160" width="16" height="20" rx="7" fill="#141033"/>
    <g transform="translate(140 202) rotate(18)">
      <circle r="10" fill="#141033" stroke="#FFD27A" stroke-width="2.5"/>
      <path d="M0 -6 C3 -2 3 3 2 5 L-2 5 C-3 3 -3 -2 0 -6 Z" fill="#fff"/>
    </g>`;
  }
  if (id === 'mummy') {
    return `
    <g fill="none" stroke="#5B3A9E" stroke-width="3">
      <path d="M58 118 Q60 110 72 110 Q84 110 86 118 Q84 128 72 128 Q60 128 58 118 Z"/>
      <path d="M114 118 Q116 110 128 110 Q140 110 142 118 Q140 128 128 128 Q116 128 114 118 Z"/>
      <path d="M86 116 Q100 110 114 116"/>
      <path d="M58 120 C44 140 40 160 46 176 M142 120 C156 140 160 160 154 176" stroke="#E9B44C" stroke-width="2" stroke-dasharray="2 4"/>
    </g>
    <path d="M30 170 C70 160 110 186 176 160 L180 186 C120 210 70 196 26 200 Z" fill="#FF8F5E" fill-opacity=".9"/>
    <path d="M30 176 C70 166 110 192 178 166" fill="none" stroke="#FFE08A" stroke-width="3" stroke-dasharray="6 5"/>
    <path d="M60 196 c-6-8 6-14 9-6 c3-8 15-2 9 6 l-9 9 z" fill="#FF5C8A"/>`;
  }
  if (id === 'vc') {
    return `
    <g class="sk-shades">
      <path d="M48 98 Q49 93 56 93 L90 93 Q96 93 95 99 L93 112 Q91 124 78 124 L66 124 Q52 124 50 112 Z" fill="url(#${u}l)"/>
      <path d="M152 98 Q151 93 144 93 L110 93 Q104 93 105 99 L107 112 Q109 124 122 124 L134 124 Q148 124 150 112 Z" fill="url(#${u}l)"/>
      <path d="M95 99 Q100 95 105 99" stroke="#141033" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M56 98 L70 98" stroke="#ffffff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
      <path d="M112 98 L126 98" stroke="#ffffff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
      <path d="M48 99 L30 94 M152 99 L170 94" stroke="#141033" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g transform="translate(146 176) rotate(18)">
      <circle r="13" fill="#141033" stroke="#FFD27A" stroke-width="3"/>
      <path d="M0 -7 C4 -3 4 3 2 6 L-2 6 C-4 3 -4 -3 0 -7 Z" fill="#fff"/><path d="M-2 6 L0 10 L2 6 Z" fill="#FF8F5E"/>
    </g>`;
  }
  if (id === 'mkt') {
    return `
    <path d="M34 112 C30 56 66 30 100 30 C134 30 170 56 166 112" fill="none" stroke="#1d1747" stroke-width="7" stroke-linecap="round"/>
    <rect x="22" y="100" width="20" height="30" rx="9" fill="#1d1747"/><rect x="158" y="100" width="20" height="30" rx="9" fill="#1d1747"/>
    <rect x="26" y="106" width="8" height="18" rx="4" fill="#FF8FC0"/><rect x="166" y="106" width="8" height="18" rx="4" fill="#FF8FC0"/>
    <path d="M34 128 C38 150 52 160 70 160" fill="none" stroke="#1d1747" stroke-width="4" stroke-linecap="round"/>
    <circle cx="72" cy="160" r="6" fill="#1d1747"/><circle cx="72" cy="160" r="2.5" fill="#FF8FC0"/>
    <path class="sk-twinkle" d="M168 44 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#FFE08A"/>
    <path class="sk-twinkle b" d="M30 54 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff"/>`;
  }
  return `
    <g fill="none" stroke="#7A4A0E" stroke-width="3.5">
      <circle cx="72" cy="108" r="19"/><circle cx="128" cy="108" r="19"/><path d="M91 106 Q100 100 109 106"/>
      <path d="M53 104 L36 98 M147 104 L164 98" stroke-linecap="round"/>
    </g>
    <circle cx="72" cy="108" r="17" fill="#ffffff" fill-opacity=".12"/><circle cx="128" cy="108" r="17" fill="#ffffff" fill-opacity=".12"/>
    <g transform="translate(100 196)">
      <path d="M0 0 L-24 -12 L-24 12 Z M0 0 L24 -12 L24 12 Z" fill="#4E308D" stroke="#2c1b5e" stroke-width="2" stroke-linejoin="round"/>
      <circle r="6" fill="#8F6BFF" stroke="#2c1b5e" stroke-width="2"/>
    </g>`;
}

function brows(id) {
  if (id === 'seth') return '<path d="M54 82 Q72 74 90 82" stroke-width="7" stroke="#E9E4DA"/><path d="M110 82 Q128 74 146 82" stroke-width="7" stroke="#E9E4DA"/>';
  if (id === 'riya') return '<path d="M58 88 Q72 80 88 86" /><path d="M112 86 Q128 80 142 88" />';
  if (id === 'kabir') return '<path d="M54 84 Q70 78 90 84" /><path d="M110 82 Q130 72 148 80" />';
  if (id === 'mummy') return '<path d="M58 96 Q72 90 86 96" /><path d="M114 96 Q128 90 142 96" />';
  if (id === 'vc') return '<path d="M52 86 Q70 76 90 84" /><path d="M110 82 Q130 74 148 84" />';
  if (id === 'mkt') return '<path d="M56 86 Q72 74 88 84" /><path d="M112 84 Q128 74 144 86" />';
  return '<path d="M56 84 L88 86" /><path d="M112 86 L144 84" />';
}

/** SVG markup for one shark. Gradient ids are unique per call so many avatars can share a page. */
export function sharkSvg(id) {
  const s = SHARK[id] || SHARKS[0];
  const u = `sk${s.id}${++n}`;
  const [c1, c2, c3] = s.body;
  const eyes = id === 'vc' ? '' : `
    <g class="sk-eyes">
      <circle cx="72" cy="108" r="15" fill="#fff"/><circle cx="128" cy="108" r="15" fill="#fff"/>
      <circle class="sk-pupil" cx="75" cy="110" r="8" fill="#141033"/><circle class="sk-pupil" cx="131" cy="110" r="8" fill="#141033"/>
      <circle cx="78" cy="106" r="3" fill="#fff"/><circle cx="134" cy="106" r="3" fill="#fff"/>
    </g>`;
  return `<svg viewBox="0 0 200 222" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${s.name}, a cartoon AI shark">
  <defs>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
    <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
    <linearGradient id="${u}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2370"/><stop offset=".5" stop-color="#141033"/><stop offset="1" stop-color="#4E308D"/></linearGradient>
    <radialGradient id="${u}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${s.color}" stop-opacity=".55"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse class="sk-glow" cx="100" cy="128" rx="100" ry="96" fill="url(#${u}g)"/>
  <ellipse cx="100" cy="214" rx="62" ry="7" fill="#000" fill-opacity=".35"/>
  <g class="sk-body">
    <path class="sk-fin" d="M110 6 C98 28 86 46 66 64 L134 64 C124 46 116 28 110 6 Z" fill="url(#${u}f)"/>
    <path d="M44 150 C26 160 14 178 8 198 C30 192 48 182 62 168 Z" fill="url(#${u}f)"/>
    <path d="M156 150 C174 160 186 178 192 198 C170 192 152 182 138 168 Z" fill="url(#${u}f)"/>
    <path d="M100 40 C150 40 178 84 178 132 C178 180 144 208 100 208 C56 208 22 180 22 132 C22 84 50 40 100 40 Z" fill="url(#${u}b)"/>
    <ellipse cx="70" cy="64" rx="24" ry="10" transform="rotate(-24 70 64)" fill="#fff" fill-opacity=".28"/>
    <path d="M100 120 C138 120 160 146 160 170 C160 194 134 208 100 208 C66 208 40 194 40 170 C40 146 62 120 100 120 Z" fill="#EEF6FF" fill-opacity=".93"/>
    <g fill="none" stroke="${c3}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round">
      <path d="M33 118 q6 8 0 16"/><path d="M41 114 q7 10 0 22"/><path d="M167 118 q-6 8 0 16"/><path d="M159 114 q-7 10 0 22"/>
    </g>
    <ellipse cx="50" cy="142" rx="9" ry="5" fill="#FF7AB6" fill-opacity=".45"/><ellipse cx="150" cy="142" rx="9" ry="5" fill="#FF7AB6" fill-opacity=".45"/>
    ${eyes}
    <g class="sk-brows" fill="none" stroke="#141033" stroke-width="5" stroke-linecap="round">${brows(s.id)}</g>
    <g class="sk-mouth">
      <path d="M64 150 Q100 186 136 150 Q100 166 64 150 Z" fill="#2a1747"/>
      <ellipse cx="100" cy="165" rx="11" ry="3.5" fill="#FF7AA8"/>
      <path d="M71 152.6 L76 160 L81 155 Z M83 156.5 L88 164 L93 157.6 Z M95 157.8 L100 165 L105 157.8 Z M107 157.6 L112 164 L117 156.5 Z M119 155 L124 160 L129 152.6 Z" fill="#fff"/>
    </g>
    ${extras(s.id, u)}
  </g>
</svg>`;
}

/** Avatar element. opts.label adds the name plate under it. */
export function avatar(id, { label = false, cls = '' } = {}) {
  const s = SHARK[id] || SHARKS[0];
  const wrap = document.createElement('div');
  wrap.className = `sk-av ${cls}`.trim();
  wrap.dataset.shark = s.id;
  wrap.style.setProperty('--sk-c', s.color);
  wrap.innerHTML = sharkSvg(s.id);
  if (label) {
    const p = document.createElement('div');
    p.className = 'sk-plate';
    const b = document.createElement('b'); b.textContent = s.name;
    const sm = document.createElement('small'); sm.textContent = s.role;
    p.append(b, sm);
    wrap.appendChild(p);
  }
  return wrap;
}

/** Make a shark "talk" for ms milliseconds (mouth animation). */
export function talk(el, ms) {
  if (!el) return;
  el.classList.add('talk');
  clearTimeout(el._talkT);
  el._talkT = setTimeout(() => el.classList.remove('talk'), ms);
}

/** Typewriter into an element. Resolves when done (or cancelled by a newer call on the same element). */
export function typeInto(el, text, { cps = 38, speed = 1 } = {}) {
  const token = {};
  el._typeToken = token;
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      if (el._typeToken !== token) return resolve(false);
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) return resolve(true);
      setTimeout(step, 1000 / cps / speed);
    };
    el.textContent = '';
    step();
  });
}
