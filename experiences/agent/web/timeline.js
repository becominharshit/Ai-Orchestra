// The run as a timeline of orchestra events, built from the server's script. Pure module, shared by:
//   server.js  publishes these events to the counter TV itself (ctx.bus.publish), on this schedule (CHECK-19 F1:
//              TV-bound events come from the server only; the phone never posts to the TV)
//   app.js     plays the same events on the phone's own orchestra, so phone and TV move together
// Every string in it is registered public text that the server produced; numbers are bounded template slots.

/** Events at the start of a run, before the plan comes back (init + planner thinking). */
export function openingEvents(o) {
  return [
    { t: 'init', title: o.title, orchestrator: o.orchestrator, agents: o.agents },
    { t: 'assign', id: 'planner', task: o.planTask },
    { t: 'status', id: 'planner', state: 'thinking' },
  ];
}

/** [{ at: ms after the plan came back, ev }]. `done` is the registered "Task done in ..." line. */
export function buildTimeline(script, done) {
  const out = [];
  let t = 0;
  const at = (dt, ev) => { t += dt; out.push({ at: t, ev }); };
  const [plan, ...rest] = script;
  const check = rest.pop();
  at(0, { t: 'status', id: 'planner', state: 'working' });
  for (const l of plan.logs) at(230, { t: 'log', id: 'planner', text: l });
  at(230, { t: 'status', id: 'planner', state: 'done' });
  at(0, { t: 'handoff', from: 'planner', to: 'agent', label: plan.back });
  at(0, { t: 'custom', name: 'plan', data: { tags: plan.logs.filter((l) => /^\d\. /.test(l)) } });
  at(500, { t: 'progress', value: 0.05 });
  rest.forEach((turn, i) => {
    at(0, { t: 'handoff', from: 'agent', to: turn.id, label: turn.handoff });
    at(420, { t: 'assign', id: turn.id, task: turn.task });
    at(0, { t: 'status', id: turn.id, state: 'working' });
    for (const l of turn.logs) at(380, { t: 'log', id: turn.id, text: l });
    at(300, { t: 'status', id: turn.id, state: 'done' });
    at(0, { t: 'handoff', from: turn.id, to: 'agent', label: turn.back });
    at(0, { t: 'progress', value: Math.round(((i + 1) / (rest.length + 1)) * 100) / 100 });
    at(280, { t: 'progress', value: Math.round(((i + 1) / (rest.length + 1)) * 100) / 100 });
  });
  at(0, { t: 'handoff', from: 'agent', to: 'check', label: check.task });
  at(0, { t: 'assign', id: 'check', task: check.task });
  at(0, { t: 'status', id: 'check', state: 'working' });
  at(500, { t: 'log', id: 'check', text: check.logs[0] });
  at(400, { t: 'status', id: 'check', state: 'done' });
  at(0, { t: 'handoff', from: 'check', to: 'agent', label: check.back });
  at(0, { t: 'progress', value: 1 });
  at(0, { t: 'done', summary: done });
  return out;
}

/** How long the timeline runs (ms). */
export const timelineMs = (tl) => (tl.length ? tl[tl.length - 1].at : 0);
