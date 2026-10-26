// Each template's fixed output structure (CHANGE-02a), assembled from tool outputs and the curated lookup file.
// Phone only. Nothing here is written by the model: the model's wording (intro, step reasons, tip) is separate and
// judged. Personalised from the chips (class, subject, goal, interests); the optional first name is added in app.js.
// A section: { title, kind: 'list' | 'cards' | 'rows', items }. 'cards' items are { title, lines[] }, 'rows' are [a, b].
import { LOOKUP, itemLabel, paramLabel } from './jobs.js';
import { hm, topicsOf, planDate } from './tools.js';

const hmText = (min) => { const t = hm(min); return t.m ? `${t.h}h ${t.m}m` : `${t.h}h`; };
const PHASE = { pp: 'Powerplay', mid: 'Middle overs', death: 'Death overs' };
const rate = (t) => `${Math.floor(t / 10)}.${t % 10}`;
const fill = (s, topic) => s.replace('{topic}', topic);

export function compose(design, outputs, { today } = {}) {
  const { job, items, params } = design;
  const L = LOOKUP[job.id];
  const calc = outputs.calculator;
  const cal = outputs.calendar;
  const x = calc?.extra || {};
  const S = [];
  switch (job.id) {
    case 'jee': {
      const types = L.questionTypes;
      const w = L.weak[params.weak];
      S.push({ title: `Weak chapter: ${w.label}`, kind: 'list', items: w.topics });
      S.push({ title: 'Har din 3 practice question types', kind: 'rows', items: Array.from({ length: params.days }, (_, d) => [`Day ${d + 1}`, [0, 1, 2].map((k) => types[(d + k) % types.length]).join(', ')]) });
      break;
    }
    case 'boards': {
      S.push({ title: `Board: ${paramLabel(job, 'board', params.board)}`, kind: 'list', items: L.params.board[params.board] });
      if (x.cycles) S.push({ title: 'Revision rounds', kind: 'rows', items: x.cycles.map((c) => [`Day ${c.from} to ${c.to}`, c.name]) });
      if (cal?.days?.length) {
        const weeks = [];
        for (let i = 0; i < cal.days.length; i += 7) {
          const counts = items.map(() => 0);
          for (const d of cal.days.slice(i, i + 7)) for (const s of d.slots) counts[s.item] += 1;
          weeks.push([`Week ${weeks.length + 1}`, items.map((id, k) => `${itemLabel(job, id)} ${counts[k]}`).join(', ')]);
        }
        S.push({ title: 'Weekly grid (sessions)', kind: 'rows', items: weeks });
      }
      break;
    }
    case 'concept': {
      const c = L.items[items[0]];
      S.push({ title: '10 saal ke bachche ke liye', kind: 'list', items: [c.kid] });
      S.push({ title: 'Exam answer', kind: 'list', items: c.exam });
      S.push({ title: 'Real life mein', kind: 'list', items: [c.real] });
      S.push({ title: 'Quick check', kind: 'rows', items: [['Sawaal', c.check.q], ['Jawab', c.check.a]] });
      if (x.example) S.push({ title: 'Worked example (calculator)', kind: 'rows', items: [[`${c.calc.aName}${c.calc.bName ? `, ${c.calc.bName}` : ''}`, x.example.shown]] });
      break;
    }
    case 'lecture': {
      const ch = L.items[items[0]];
      const vis = L.visuals[ch.subject];
      S.push({ title: `5 episodes: ${ch.label}`, kind: 'cards', items: ch.episodes.map((t, i) => ({ title: `Episode ${i + 1}: ${t}`, lines: [`Hook: ${fill(L.hooks[i % L.hooks.length], t)}`, `Visual: ${vis[i % vis.length]}`, `Recap sawaal: ${fill(L.recaps[i % L.recaps.length], t)}`] })) });
      if (x.episodes) S.push({ title: 'Series numbers', kind: 'rows', items: [['Episodes', `${x.episodes} x ${x.secondsEach} second`], ['Script', `lagbhag ${x.wordsEach} words har episode`], ['Shots', `${x.shotsEach} shots har episode`], ['Class', paramLabel(job, 'cls', params.cls)]] });
      break;
    }
    case 'mock': {
      if (x.sections) S.push({ title: `Time split: ${x.mins} minute`, kind: 'rows', items: [...x.sections.map((s) => [s.label + (s.weak ? ' (weak, last)' : ''), `${s.minutes} min`]), ['Revision buffer', `${x.buffer} min`]] });
      if (x.sections) S.push({ title: 'Attempt order', kind: 'list', items: x.sections.map((s, i) => `${i + 1}. ${s.label}`) });
      S.push({ title: 'Do', kind: 'list', items: L.tips.do });
      S.push({ title: "Don't", kind: 'list', items: L.tips.dont });
      break;
    }
    case 'skill': {
      const weeks = [];
      for (let w = 0; w < 4; w++) weeks.push([`Week ${w + 1}`, items.map((id) => topicsOf(design, L.items[id])[w % topicsOf(design, L.items[id]).length]).join(', ')]);
      S.push({ title: `${paramLabel(job, 'skill', params.skill)}: 4 hafte ka roadmap`, kind: 'rows', items: weeks });
      S.push({ title: 'Mini project', kind: 'list', items: [L.projects[params.skill]] });
      break;
    }
    case 'mvp': {
      S.push({ title: `Must-have features: ${paramLabel(job, 'app', params.app)}`, kind: 'list', items: L.features[params.app].slice(0, design.sliders[2] >= 3 ? 5 : 3) });
      S.push({ title: 'Tool stack', kind: 'list', items: L.stack });
      S.push({ title: `Kis ke liye: ${paramLabel(job, 'user', params.user)}`, kind: 'list', items: L.params.user[params.user] });
      break;
    }
    case 'hackathon': {
      S.push({ title: `Theme: ${paramLabel(job, 'theme', params.theme)}`, kind: 'list', items: L.params.theme[params.theme] });
      if (cal?.agenda) S.push({ title: `Hackathon day plan: ${cal.agenda[0].start} to ${cal.agenda.at(-1).end}`, kind: 'rows', items: cal.agenda.map((b) => [`${b.start} to ${b.end}`, `${b.label} (${b.owner})`]) });
      S.push({ title: `Roles: ${params.team} log`, kind: 'list', items: L.roles.slice(0, Math.max(2, params.team)) });
      S.push({ title: 'Demo checklist', kind: 'list', items: L.demo });
      break;
    }
    case 'cofounder': {
      S.push({ title: `Problem area: ${paramLabel(job, 'area', params.area)}`, kind: 'list', items: L.params.area[params.area] });
      const weeks = [];
      for (let w = 0; w < 4; w++) weeks.push([`Week ${w + 1}`, items.map((id) => L.items[id].topics[w % L.items[id].topics.length]).join(', ')]);
      S.push({ title: 'Weekly sprint plan', kind: 'rows', items: weeks });
      const per = x.perWeek || [1, 2, 3, 4];
      S.push({ title: 'Pehle 10 customers', kind: 'rows', items: per.map((n, w) => [`Week ${w + 1}`, `${n} customers: ${L.customers[w % L.customers.length]}`]) });
      break;
    }
    case 'd2c': {
      const posts = [];
      if (x.postSplit) {
        let k = 0;
        for (const p of x.postSplit) for (let j = 0; j < p.posts; j++, k++) posts.push({ title: `Post ${k + 1}, Day ${x.postDays[k]}: ${p.label}`, lines: [L.items[p.id].topics[j % L.items[p.id].topics.length]] });
      } else items.forEach((id, i) => posts.push({ title: `Post ${i + 1}: ${itemLabel(job, id)}`, lines: [L.items[id].topics[0]] }));
      S.push({ title: '5 launch posts', kind: 'cards', items: posts });
      S.push({ title: '3 hooks', kind: 'list', items: L.hooks[params.product] });
      S.push({ title: 'Audience', kind: 'list', items: [L.audience[params.audience]] });
      break;
    }
    case 'creator': {
      S.push({ title: `7 reel ideas: ${paramLabel(job, 'niche', params.niche)}`, kind: 'cards', items: L.ideas[params.niche].slice(0, 7).map(([idea, hook], i) => ({ title: `${i + 1}. ${idea}`, lines: [`Hook: ${hook}`] })) });
      if (x.postDays) S.push({ title: 'Posting plan', kind: 'rows', items: x.postDays.map((d, i) => [`Day ${d}${today ? ` (${planDate(today, d - 1).label})` : ''}`, `Idea ${(i % 7) + 1}`]) });
      break;
    }
    case 'fest': {
      S.push({ title: paramLabel(job, 'event', params.event), kind: 'list', items: L.params.event[params.event] });
      if (cal?.agenda) S.push({ title: 'Run of show (event ka din)', kind: 'rows', items: cal.agenda.map((b) => [`${b.start} to ${b.end}`, b.label]) });
      if (x.split) S.push({ title: `Budget split: Rs ${x.budget}`, kind: 'rows', items: x.split.map((s) => [s.label, `Rs ${s.rupees}`]) });
      if (x.perPerson) S.push({ title: 'Team', kind: 'list', items: [`${x.tasks} team sessions, ${x.team} log, har ek ke ${x.perPerson}.`] });
      break;
    }
    case 'debate': {
      const t = L.topics[params.topic];
      const mine = params.side === 'for';
      S.push({ title: `Topic: ${t.label}`, kind: 'list', items: [`Tumhari side: ${mine ? 'For' : 'Against'}`] });
      S.push({ title: 'Opening line', kind: 'list', items: [mine ? t.openFor : t.openAgainst] });
      S.push({ title: 'For points', kind: 'list', items: t.for });
      S.push({ title: 'Against points', kind: 'list', items: t.against });
      S.push({ title: '2 rebuttals', kind: 'list', items: mine ? t.rebutFor : t.rebutAgainst });
      if (x.timing) S.push({ title: `Speech timing: ${x.speechSec / 60} minute`, kind: 'rows', items: x.timing.map((p) => [p.label, `${p.seconds} sec`]) });
      break;
    }
    case 'career': {
      const a = L.areas[params.area];
      S.push({ title: `3 careers: ${a.label}`, kind: 'cards', items: a.careers.map((c) => ({ title: c.title, lines: [`2030 mein kaam: Done by AI ${c.split[0]}%, Done with AI ${c.split[1]}%, Led by people ${c.split[2]}%`, `Skills that hold: ${c.holds.join(', ')}`, `Is mahine try karo: ${c.try}`] })) });
      S.push({ title: 'Source', kind: 'list', items: ['Work split: Zenith School of AI research, 2026. Yeh outlook hai, guarantee nahi.'] });
      break;
    }
    case 'collegeq': {
      const qs = [];
      const per = x.perPriority || items.map((id) => ({ id, count: Math.floor(10 / items.length) }));
      for (const p of per) for (const q of L.items[p.id].questions.slice(0, p.count)) qs.push(`${qs.length + 1}. ${q}`);
      S.push({ title: `${qs.length} sawaal, kisi bhi campus ke liye`, kind: 'list', items: qs });
      S.push({ title: `Tumhari field: ${paramLabel(job, 'interest', params.interest)}`, kind: 'list', items: L.params.interest[params.interest] });
      break;
    }
    case 'cricket': {
      if (x.phases) {
        const chase = x.situation === 'chase';
        S.push({ title: chase ? `Chase: ${x.target} runs, ${x.overs} overs` : `Defend: ${x.target} runs, ${x.overs} overs`, kind: 'rows', items: [['Required rate', `${rate(x.rrTenths)} per over`], ...x.phases.map((p) => [PHASE[p.id], `${p.runs} runs in ${p.overs} ${p.overs === 1 ? 'over' : 'overs'} (${rate(p.rrTenths)} per over)`])] });
        S.push({ title: chase ? 'Batting plan' : 'Bowling plan', kind: 'list', items: chase
          ? [`Powerplay: ${x.phases[0].runs} runs, wickets bachao.`, `Middle overs: singles aur doubles, ${rate(x.phases[1].rrTenths)} per over.`, `Death overs: set batsman strike pe, ${x.phases[2].runs} runs.`]
          : [`Powerplay: ${x.phases[0].runs} se kam do, line tight.`, `Middle overs: dot balls, ${rate(x.phases[1].rrTenths)} se kam per over.`, `Death overs: yorker aur slower ball, ${x.phases[2].runs} se kam.`] });
      }
      break;
    }
    default: break;
  }
  return S;
}
