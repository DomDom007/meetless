// Meetless: scores every recurring meeting by decisions made per hour and cost, and suggests which to end or shrink.
import { useState } from "react";
import { moneyFmt } from "./lib/money";
import { uid, useStored } from "./lib/store";
import { todayISO } from "./lib/time";
import { CurrencySelect, Section, Stat, Stats } from "./ui/kit";

const T = "meetless";
type Meeting = { id: string; name: string; people: number; minutes: number; perMonth: number; log: { date: string; decisions: number; attended: number }[] };
const SAMPLE: Meeting[] = [
  { id: "m1", name: "Monday all-hands", people: 42, minutes: 60, perMonth: 4, log: [{ date: "2026-09-07", decisions: 1, attended: 38 }, { date: "2026-09-14", decisions: 0, attended: 35 }, { date: "2026-09-21", decisions: 2, attended: 36 }] },
  { id: "m2", name: "Product weekly", people: 9, minutes: 45, perMonth: 4, log: [{ date: "2026-09-08", decisions: 4, attended: 9 }, { date: "2026-09-15", decisions: 3, attended: 8 }, { date: "2026-09-22", decisions: 5, attended: 9 }] },
  { id: "m3", name: "Daily standup", people: 7, minutes: 30, perMonth: 21, log: [{ date: "2026-09-21", decisions: 0, attended: 7 }, { date: "2026-09-22", decisions: 1, attended: 6 }, { date: "2026-09-23", decisions: 0, attended: 7 }] },
  { id: "m4", name: "Marketing sync", people: 6, minutes: 60, perMonth: 4, log: [{ date: "2026-09-09", decisions: 0, attended: 4 }, { date: "2026-09-16", decisions: 1, attended: 3 }] },
];

function verdict(m: Meeting, rate: number) {
  const n = m.log.length;
  const decisions = n ? m.log.reduce((a, l) => a + l.decisions, 0) / n : 0;
  const attendance = n ? m.log.reduce((a, l) => a + l.attended, 0) / n / m.people : 1;
  const hours = (m.minutes / 60) * m.people;
  const cost = hours * rate;
  const perDecision = decisions ? cost / decisions : Infinity;
  const perHour = decisions / (m.minutes / 60);
  let advice: [string, string];
  if (!n) advice = ["Log a few sessions to get a verdict.", ""];
  else if (decisions < 0.5 && m.people > 10) advice = ["Replace with a written update. Big room, almost no decisions.", "bad"];
  else if (decisions < 0.5) advice = ["End it or make it fortnightly. It rarely decides anything.", "bad"];
  else if (attendance < 0.7) advice = [`Shrink the invite list. Only ${Math.round(attendance * 100)}% turn up.`, "warn"];
  else if (perHour < 1.5 && m.minutes >= 45) advice = [`Cut it to ${Math.max(15, Math.round(m.minutes / 2 / 5) * 5)} minutes.`, "warn"];
  else advice = ["Worth keeping.", "good"];
  return { decisions, attendance, cost, perDecision, perHour, monthly: cost * m.perMonth, advice };
}

export default function Meetless() {
  const [meetings, setMeetings] = useStored<Meeting[]>(T, "meetings", SAMPLE);
  const [rate, setRate] = useStored(T, "rate", 25);
  const [cur, setCur] = useStored(T, "cur", "USD");
  const [log, setLog] = useState<{ id: string; decisions: string; attended: string }>({ id: "", decisions: "", attended: "" });
  const [nm, setNm] = useState({ name: "", people: "6", minutes: "30", perMonth: "4" });
  const money = moneyFmt(cur);
  const rows = meetings.map(m => ({ m, v: verdict(m, rate) })).sort((a, b) => b.v.monthly - a.v.monthly);
  const monthly = rows.reduce((a, r) => a + r.v.monthly, 0);
  const saveable = rows.filter(r => r.v.advice[1] === "bad").reduce((a, r) => a + r.v.monthly, 0) + rows.filter(r => r.v.advice[1] === "warn").reduce((a, r) => a + r.v.monthly * 0.4, 0);
  const hoursMonth = meetings.reduce((a, m) => a + (m.minutes / 60) * m.people * m.perMonth, 0);

  return (
    <div className="stack">
      <Section title="What your meetings cost" aside={<>
        <label className="field" style={{ flex: "0 0 150px" }}><span>Average hourly cost</span><input id="ml-rate" className="input num" value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} /></label>
        <CurrencySelect id="ml-cur" value={cur} onChange={setCur} />
      </>}>
        <Stats><Stat value={money(monthly)} label="Per month" /><Stat value={Math.round(hoursMonth)} label="People-hours per month" /><Stat value={money(saveable)} label="Could save per month" tone="good" /></Stats>
      </Section>

      <Section title="Every recurring meeting">
        <div className="stack" style={{ gap: 14 }}>
          {rows.map(({ m, v }) => (
            <div key={m.id} className="ml-m" style={{ borderLeftColor: v.advice[1] ? `var(--${v.advice[1]})` : "var(--line)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ fontSize: 22 }}>{m.name}</h3>
                <span className="note">{m.people} people · {m.minutes} min · {m.perMonth}× a month</span>
              </div>
              <div className="row" style={{ gap: 26, margin: "10px 0" }}>
                <Stat value={money(v.cost)} label="Per session" />
                <Stat value={v.decisions.toFixed(1)} label="Decisions per session" />
                <Stat value={v.perDecision === Infinity ? "–" : money(v.perDecision)} label="Cost per decision" />
                <Stat value={`${Math.round(v.attendance * 100)}%`} label="Attendance" />
              </div>
              <p><span className={"pill " + v.advice[1]}>{v.advice[0]}</span></p>
              {log.id === m.id ? (
                <form className="row" style={{ marginTop: 10, alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); setMeetings(meetings.map(x => x.id === m.id ? { ...x, log: [...x.log, { date: todayISO(), decisions: parseInt(log.decisions) || 0, attended: parseInt(log.attended) || m.people }] } : x)); setLog({ id: "", decisions: "", attended: "" }); }}>
                  <label className="field"><span>Decisions made today</span><input id={`ml-d-${m.id}`} className="input num" autoFocus value={log.decisions} onChange={e => setLog({ ...log, decisions: e.target.value })} /></label>
                  <label className="field"><span>People who came</span><input id={`ml-a-${m.id}`} className="input num" value={log.attended} placeholder={String(m.people)} onChange={e => setLog({ ...log, attended: e.target.value })} /></label>
                  <button className="btn primary small" type="submit">Save</button>
                </form>
              ) : (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn small" onClick={() => setLog({ id: m.id, decisions: "", attended: "" })}>Log today's session</button>
                  <button className="btn ghost small danger" onClick={() => setMeetings(meetings.filter(x => x.id !== m.id))}>Delete</button>
                  <span className="note">{m.log.length} sessions logged</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Add a recurring meeting">
        <form className="row" style={{ alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); if (!nm.name.trim()) return; setMeetings([...meetings, { id: uid(), name: nm.name.trim(), people: +nm.people || 1, minutes: +nm.minutes || 30, perMonth: +nm.perMonth || 4, log: [] }]); setNm({ ...nm, name: "" }); }}>
          <label className="field" style={{ flexGrow: 3 }}><span>Name</span><input id="ml-nn" className="input" value={nm.name} onChange={e => setNm({ ...nm, name: e.target.value })} /></label>
          <label className="field"><span>People invited</span><input id="ml-np" className="input num" value={nm.people} onChange={e => setNm({ ...nm, people: e.target.value })} /></label>
          <label className="field"><span>Minutes</span><input id="ml-nm" className="input num" value={nm.minutes} onChange={e => setNm({ ...nm, minutes: e.target.value })} /></label>
          <label className="field"><span>Times a month</span><input id="ml-nf" className="input num" value={nm.perMonth} onChange={e => setNm({ ...nm, perMonth: e.target.value })} /></label>
          <button className="btn primary" type="submit">Add</button>
        </form>
        <p className="note" style={{ marginTop: 10 }}>A decision is anything that changes what someone will do next: approved, rejected, assigned or scheduled.</p>
      </Section>
      <style>{`.ml-m{border-left:4px solid;padding:4px 0 12px 14px;border-bottom:1px solid var(--line)}.ml-m .stat b{font-size:24px}`}</style>
    </div>
  );
}
