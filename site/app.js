(function () {
  const TASK = window.HALLU_TASK;
  const { grade } = window.HALLU_GRADER;
  const TESTS = window.HALLU_TEST_ANSWERS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (x) => Math.round(x * 100) + "%";
  const fig = (v, unit) => unit === "£m" ? `£${(+v).toFixed(1)}m` : `${(+v).toFixed(1)}${unit}`;

  const state = { claims: {}, signoff: null, result: null, step: 1 };
  const TIER = {
    ready: { label: "Ready for live tasks", sub: "Caught the errors that matter, including the covenant breach, without over-flagging. Route straight to a first live task." },
    calibrate: { label: "Ready after one calibration task", sub: "The instincts are there but some errors got through. One more graded task in the gap area, then live work." },
    "not-yet": { label: "Not ready yet", sub: "Key errors got through, or the answer was signed off. Repeat with a guided walkthrough before any live work." },
  };

  // ---------- tabs and steps ----------
  // The operator view sits behind a click-through gate: in production it would be
  // behind company sign-in, and its miss-rate table gives away the answer key.
  // #operator skips the gate so a reviewer can be linked straight to it.
  let unlocked = false;
  try { unlocked = sessionStorage.getItem("hallu-operator") === "1"; } catch (e) {}
  function unlock() {
    unlocked = true;
    try { sessionStorage.setItem("hallu-operator", "1"); } catch (e) {}
  }

  function showTab(name) {
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    const op = name === "operator";
    $("#expert").hidden = op;
    $("#gate").hidden = !op || unlocked;
    $("#operator").hidden = !op || !unlocked;
    if (op && !unlocked) $("#gate-spoiler").hidden = !!state.result;
    if (op && unlocked) renderOperator();
    history.replaceState(null, "", op && unlocked ? "#operator" : location.pathname + location.search);
    window.scrollTo({ top: 0 });
  }
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) goStep(+go.dataset.go);
    const tg = e.target.closest("[data-tab-go]");
    if (tg) showTab(tg.dataset.tabGo);
  });
  $("#gate-continue").addEventListener("click", () => { unlock(); showTab("operator"); });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#operator") { unlock(); showTab("operator"); }
  });

  function goStep(n, scroll = true) {
    state.step = n;
    $$("[data-panel]").forEach((p) => (p.hidden = +p.dataset.panel !== n));
    $$("#steps li").forEach((li) => {
      const s = +li.dataset.step;
      li.classList.toggle("on", s === n);
      li.classList.toggle("done", s < n);
    });
    if (scroll) $(".steps").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- step 2: task ----------
  function renderTask() {
    $("#task-title").textContent = TASK.title;
    $("#task-brief").textContent = TASK.brief;
    $("#task-q").textContent = TASK.question;
    $("#pack").innerHTML = TASK.dataPack.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
    $("#signoff-q").textContent = TASK.signoff.question;

    const typeOpts = `<option value="">Choose…</option>` + TASK.errorTypes.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join("");
    $("#claims").innerHTML = TASK.claims.map((c, i) => `
      <div class="claim" data-id="${c.id}">
        <div class="head">
          <span class="num">${String(i + 1).padStart(2, "0")}</span>
          <span class="txt">${esc(c.text)}</span>
          <div class="seg" role="group" aria-label="Claim ${i + 1}">
            <button class="ok" data-v="sound" aria-pressed="false">Sound</button>
            <button class="bad" data-v="wrong" aria-pressed="false">Wrong</button>
          </div>
        </div>
        <div class="detail" hidden>
          <label>Error type<select data-f="type">${typeOpts}</select></label>
          ${c.correct ? `<label>Right figure (${esc(c.correct.unit)}), optional<input type="number" step="0.1" inputmode="decimal" data-f="value"></label>` : ""}
        </div>
      </div>`).join("");

    $$("#claims .claim").forEach((el) => {
      const id = el.dataset.id;
      el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
        const wrong = b.dataset.v === "wrong";
        el.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        el.querySelector(".detail").hidden = !wrong;
        state.claims[id] = { ...(state.claims[id] || {}), flag: wrong };
      }));
      const sel = el.querySelector("select");
      sel.addEventListener("change", () => (state.claims[id] = { ...(state.claims[id] || {}), type: sel.value || null }));
      const num = el.querySelector("input");
      if (num) num.addEventListener("input", () => {
        const v = parseFloat(num.value);
        state.claims[id] = { ...(state.claims[id] || {}), value: isFinite(v) ? v : null };
      });
    });

    $$("#signoff button").forEach((b) => b.addEventListener("click", () => {
      $$("#signoff button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      state.signoff = b.dataset.v;
      $("#submit").disabled = false;
      $("#submit-hint").textContent = unmarkedCount() ? `${unmarkedCount()} claim(s) unmarked will count as sound.` : "";
    }));
    $("#claims").addEventListener("click", () => {
      if (state.signoff) $("#submit-hint").textContent = unmarkedCount() ? `${unmarkedCount()} claim(s) unmarked will count as sound.` : "";
    });
    $("#submit").addEventListener("click", submit);
  }
  const unmarkedCount = () => TASK.claims.filter((c) => !(c.id in state.claims) || state.claims[c.id].flag === undefined).length;

  function submit() {
    state.result = grade(TASK, { claims: state.claims, signoff: state.signoff });
    try { localStorage.setItem("hallu-onboard-last", JSON.stringify({ tier: state.result.tier, score: state.result.score, at: Date.now() })); } catch (e) {}
    renderFeedback();
    renderReadiness();
    goStep(3);
  }

  // ---------- step 3: feedback ----------
  function renderFeedback() {
    const r = state.result;
    const crit = r.criticalCaught ? "including the covenant breach" : "but not the covenant breach, which is the error that matters most";
    const ff = r.falseFlags ? ` You flagged ${r.falseFlags} sound claim${r.falseFlags > 1 ? "s" : ""}.` : " No sound claims flagged.";
    const so = r.signoffOk ? " You were right not to sign it off." : ` You'd sign it off, but it shouldn't go out: ${TASK.signoff.why}`;
    $("#fb-summary").textContent = `You caught ${r.caught} of ${r.totalErrors} errors, ${crit}.${ff}${so}`;
    $("#fb-score").innerHTML = `
      <div><div class="v">${r.caught}/${r.totalErrors}</div><div class="l">errors caught</div></div>
      <div><div class="v">${pct(r.score)}</div><div class="l">weighted score</div></div>
      <div><div class="v">${r.falseFlags}</div><div class="l">false flags</div></div>`;

    const TAG = {
      caught: ["caught", "Caught"], "caught-mistyped": ["partial", "Caught, mislabelled"],
      missed: ["missed", "Missed"], "false-flag": ["false", "False flag"], agreed: ["agreed", "Sound, agreed"],
    };
    const order = { missed: 0, "false-flag": 1, "caught-mistyped": 2, caught: 3, agreed: 4 };
    const items = [...r.items].sort((a, b) => order[a.outcome] - order[b.outcome] || (b.severity || 0) - (a.severity || 0));
    $("#fb-items").innerHTML = items.map((i) => {
      const [cls, label] = TAG[i.outcome];
      const extras = [];
      if (i.outcome === "caught-mistyped") extras.push(`You called it "${esc(i.typeGiven)}". Better described as: ${esc(i.typeExpected.join(" or "))}.`);
      if (i.figure === "right") extras.push(`Your figure, ${fig(i.figureGiven, i.correct.unit)}, is right.`);
      if (i.figure === "wrong") extras.push(`Your figure, ${fig(i.figureGiven, i.correct.unit)}, is off: it should be ${fig(i.correct.value, i.correct.unit)}.`);
      if (i.outcome === "missed" && i.severity === 3) extras.push("Critical: this is the conclusion the reader acts on.");
      if (i.outcome === "false-flag") extras.push("Flagging sound work sends a trainer chasing a problem that isn't there.");
      return `<div class="fb">
        <span class="tag ${cls}">${label}</span>
        <span class="claimtxt">${esc(i.text)}</span>
        <span class="why">${esc(i.note)}</span>
        ${extras.length ? `<span class="extra">${extras.join(" ")}</span>` : ""}
      </div>`;
    }).join("");
  }

  // ---------- step 4: readiness ----------
  function renderReadiness() {
    const r = state.result;
    const t = TIER[r.tier];
    const v = $("#rd-verdict");
    v.textContent = t.label;
    v.className = "verdict " + r.tier;
    $("#rd-sub").textContent = t.sub;

    const areaRow = (a) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:14px"><span>${esc(a.label)}</span><span class="mono faint">${pct(a.pct)}</span></div><div class="bar"><i style="width:${Math.round(a.pct * 100)}%"></i></div></div>`;
    $("#rd-strengths").innerHTML = r.strengths.length ? r.strengths.map(areaRow).join("") : `<p class="faint">None clear yet.</p>`;
    $("#rd-gaps").innerHTML = r.gaps.length ? r.gaps.map(areaRow).join("") : `<p class="faint">No gaps on this task.</p>`;

    $("#rd-first").innerHTML = r.firstTask
      ? `${esc(r.firstTask)}.${r.tier === "calibrate" && r.gaps.length ? ` <span class="muted">Calibration task first, in: ${esc(r.gaps.map((g) => g.label.toLowerCase()).join(", "))}.</span>` : ""}`
      : `<span class="muted">None yet. Assign the guided walkthrough, then a second practice task.</span>`;

    const missed = r.items.filter((i) => i.outcome === "missed").map((i) => i.id);
    const record = {
      expert: "new-applicant",
      task: TASK.id,
      tier: r.tier,
      score: +r.score.toFixed(2),
      errors_caught: `${r.caught}/${r.totalErrors}`,
      critical_caught: r.criticalCaught,
      false_flags: r.falseFlags,
      missed,
      strengths: r.strengths.map((a) => a.id),
      gaps: r.gaps.map((a) => a.id),
      first_task: r.firstTask,
      next_step: { ready: "assign_first_live_task", calibrate: "assign_calibration_task", "not-yet": "assign_walkthrough" }[r.tier],
    };
    $("#rd-record").textContent = JSON.stringify(record, null, 2);
  }

  $("#copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#rd-record").textContent); $("#copy").textContent = "Copied"; }
    catch (e) { $("#copy").textContent = "Copy failed"; }
    setTimeout(() => ($("#copy").textContent = "Copy record"), 1500);
  });
  $("#restart").addEventListener("click", () => {
    state.claims = {}; state.signoff = null; state.result = null;
    renderTask();
    $("#submit").disabled = true;
    $("#submit-hint").textContent = "Answer the sign-off question to submit.";
    goStep(1);
  });

  // ---------- operator view ----------
  // DEMO DATA: illustrative only, not Halluminate figures.
  const DEMO = {
    funnel: [
      ["Sourced", 400], ["Started orientation", 248], ["Submitted sample task", 163], ["Ready for live work", 141],
    ],
    outcomes: { ready: 97, calibrate: 44, "not-yet": 22 },
    missRate: { c4: 0.12, c5: 0.41, c6: 0.15, c7: 0.28, c8: 0.19, c10: 0.46 },
    falseFlagRate: { c1: 0.06, c2: 0.01, c3: 0.09, c9: 0.04 },
  };

  function renderOperator() {
    const top = DEMO.funnel[0][1];
    let worst = { i: -1, d: 0 };
    DEMO.funnel.forEach(([, n], i) => {
      if (i === 0) return;
      const d = 1 - n / DEMO.funnel[i - 1][1];
      if (d > worst.d) worst = { i, d };
    });
    $("#funnel").innerHTML = DEMO.funnel.map(([name, n], i) => {
      const prev = i ? DEMO.funnel[i - 1][1] : null;
      const drop = prev ? `<div class="drop" style="${i === worst.i ? "font-weight:600" : "color:var(--ink-3)"}">−${pct(1 - n / prev)} from previous step${i === worst.i ? " · biggest drop" : ""}</div>` : "";
      return `<div class="fstep"><span class="name">${esc(name)}</span><span class="track"><i style="width:${(n / top) * 100}%"></i></span><span class="n">${n}</span>${drop}</div>`;
    }).join("");

    const tot = Object.values(DEMO.outcomes).reduce((a, b) => a + b, 0);
    $("#outcomes").innerHTML = `<tr><th>Outcome</th><th>Next step, automatic</th><th class="num">Experts</th><th class="num">Share</th></tr>` +
      Object.entries(DEMO.outcomes).map(([k, n]) => `<tr><td>${TIER[k].label}</td><td class="muted">${{ ready: "Assigned first live task", calibrate: "Calibration task in gap area", "not-yet": "Guided walkthrough, then retry" }[k]}</td><td class="num">${n}</td><td class="num">${pct(n / tot)}</td></tr>`).join("");

    const rows = TASK.claims.map((c, i) => {
      const isErr = !!c.error;
      const rate = isErr ? DEMO.missRate[c.id] : DEMO.falseFlagRate[c.id];
      return { n: i + 1, c, isErr, rate };
    }).sort((a, b) => b.rate - a.rate);
    $("#misses").innerHTML = `<tr><th>#</th><th>Claim</th><th>Measure</th><th class="num">Rate</th></tr>` +
      rows.map((r) => `<tr><td class="mono faint">${String(r.n).padStart(2, "0")}</td><td>${esc(r.c.text)}</td><td class="muted" style="white-space:nowrap">${r.isErr ? "missed" : "false flag"}</td><td class="num">${pct(r.rate)}</td></tr>`).join("");

    const checks = Object.values(TESTS).map((t) => {
      const r = grade(TASK, t.response);
      const ok = r.tier === t.expect.tier
        && (t.expect.minScore == null || r.score >= t.expect.minScore)
        && (t.expect.maxScore == null || r.score <= t.expect.maxScore);
      return `<tr><td>${esc(t.label)}</td><td>${TIER[t.expect.tier].label}</td><td>${TIER[r.tier].label}</td><td class="num">${pct(r.score)}</td><td class="num"><span class="${ok ? "pass" : "fail"}">${ok ? "pass" : "fail"}</span></td></tr>`;
    });
    let you = "";
    if (state.result) you = `<tr><td><b>Your review</b></td><td class="faint">n/a</td><td>${TIER[state.result.tier].label}</td><td class="num">${pct(state.result.score)}</td><td></td></tr>`;
    $("#checks").innerHTML = `<tr><th>Test review</th><th>Expected</th><th>Grader says</th><th class="num">Score</th><th class="num">Check</th></tr>` + checks.join("") + you;
  }

  renderTask();
  goStep(1, false);
  if (location.hash === "#operator") { unlock(); showTab("operator"); }
})();
