// Grades an expert's review against the answer key in task.js. Deterministic:
// no model call, so the same review always gets the same feedback.
//
// response = {
//   claims: { [claimId]: { flag: bool, type: errorTypeId, value: number|null } },
//   signoff: "yes" | "no" | null,
// }
(function (root) {
  const PARTIAL = 0.75; // caught, but named the wrong kind of error
  const FALSE_FLAG = 1; // points lost for flagging a sound claim

  function grade(task, response) {
    const typeLabel = Object.fromEntries(task.errorTypes.map((t) => [t.id, t.label]));
    const items = [];
    let earned = 0, possible = 0, falseFlags = 0;
    const area = {};
    for (const k of Object.keys(task.areas)) area[k] = { earned: 0, possible: 0, falseFlags: 0 };

    for (const c of task.claims) {
      const r = (response.claims && response.claims[c.id]) || {};
      const flagged = !!r.flag;
      const a = area[c.area];

      if (!c.error) {
        if (flagged) {
          falseFlags++; a.falseFlags++;
          items.push({ id: c.id, outcome: "false-flag", text: c.text, note: c.sound });
        } else {
          items.push({ id: c.id, outcome: "agreed", text: c.text, note: c.sound });
        }
        continue;
      }

      const w = c.error.severity;
      possible += w; a.possible += w;
      if (!flagged) {
        items.push({ id: c.id, outcome: "missed", severity: w, text: c.text, note: c.error.why });
        continue;
      }

      const typeOk = c.error.types.includes(r.type);
      const pts = typeOk ? w : w * PARTIAL;
      earned += pts; a.earned += pts;

      let figure = null;
      if (c.correct) {
        const v = typeof r.value === "number" && isFinite(r.value) ? r.value : null;
        figure = v === null ? "none"
          : v >= c.correct.min && v <= c.correct.max ? "right" : "wrong";
      }

      items.push({
        id: c.id, outcome: typeOk ? "caught" : "caught-mistyped", severity: w,
        text: c.text, note: c.error.why,
        typeGiven: r.type ? typeLabel[r.type] || r.type : "not given",
        typeExpected: c.error.types.map((t) => typeLabel[t]),
        figure, figureGiven: r.value ?? null, correct: c.correct || null,
      });
    }

    const raw = Math.max(0, earned - falseFlags * FALSE_FLAG);
    const score = possible ? raw / possible : 0;

    const critical = task.claims.filter((c) => c.error && c.error.severity === 3);
    const criticalCaught = critical.every((c) => response.claims?.[c.id]?.flag);
    const signoffOk = response.signoff === task.signoff.expected;

    let tier;
    if (score >= 0.8 && criticalCaught && signoffOk && falseFlags <= 1) tier = "ready";
    else if (score >= 0.5 && (criticalCaught || signoffOk)) tier = "calibrate";
    else tier = "not-yet";

    // Strengths and gaps by area. An area with false flags counts as a gap even if
    // every error in it was caught: over-flagging costs reviewers' time too.
    const areaRows = Object.entries(task.areas).map(([id, meta]) => {
      const s = area[id];
      const pct = s.possible ? Math.max(0, s.earned - s.falseFlags) / s.possible : (s.falseFlags ? 0 : 1);
      return { id, label: meta.label, firstTask: meta.firstTask, pct, falseFlags: s.falseFlags };
    });
    const strengths = areaRows.filter((r) => r.pct >= 0.75);
    const gaps = areaRows.filter((r) => r.pct < 0.75);
    const best = [...areaRows].sort((x, y) => y.pct - x.pct)[0];

    return {
      score, earned, possible, falseFlags,
      caught: items.filter((i) => i.outcome.startsWith("caught")).length,
      totalErrors: task.claims.filter((c) => c.error).length,
      criticalCaught, signoffOk, tier, items, areas: areaRows, strengths, gaps,
      firstTask: tier === "not-yet" ? null : best.firstTask,
    };
  }

  const api = { grade, PARTIAL, FALSE_FLAG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HALLU_GRADER = api;
})(this);
