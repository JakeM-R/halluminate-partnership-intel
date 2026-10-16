/* AR chaser UI. All parsing and aging happens here in the browser via ar.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 86400000;
  var WORKER_URL = (document.querySelector('meta[name="worker-url"]') || {}).content || "";

  var BUCKET_VARS = { current: "--b-current", b1: "--b-1", b31: "--b-31", b61: "--b-61", b90: "--b-90" };
  var TIER_COLORS = ["#6B7A90", "#8A6510", "#B85A1C", "#9A4422", "#34507A", "#34507A"];

  var state = {
    source: "demo", fileName: "", rows: [], headers: [], map: {},
    runDate: todayUTC(), settings: Object.assign({}, AR.DEFAULT_SETTINGS),
    result: null, drafts: {}, dirty: {}, open: {}, draftMode: "template", runId: 0
  };

  function todayUTC() { var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function isDemo() { return state.source === "demo"; }
  // Demo mode shows every dollar figure as $xx; an uploaded file shows real amounts.
  var MONEY_RE = /-?\$\s?[0-9][0-9,]*(?:\.[0-9]+)?k?/g;
  function mask(text) { return isDemo() ? String(text).replace(MONEY_RE, "$$xx") : String(text); }
  function money(n) { return isDemo() ? "$xx" : AR.fmtMoney(Math.round(n)); }
  function kMoney(n) { return isDemo() ? "$xx" : AR.fmtK(n); }
  function maskDraft(d) { if (isDemo()) { d.subject = mask(d.subject); d.body = mask(d.body); } return d; }

  // ---------- Data loading ----------

  function loadDemo() {
    var p = AR.parseCSV(DEMO.csv(todayUTC()));
    state.source = "demo"; state.fileName = "";
    state.headers = p.headers; state.rows = p.rows; state.map = AR.autoMap(p.headers);
    $("mapper").innerHTML = "";
    runAnalysis();
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var p = AR.parseCSV(reader.result);
      if (!p.headers.length || !p.rows.length) { showMapperError("That file has no rows."); return; }
      state.pending = { headers: p.headers, rows: p.rows, name: file.name };
      renderMapper(p.headers, AR.autoMap(p.headers), file.name, p.rows.length);
    };
    reader.readAsText(file);
  }

  function showMapperError(msg) {
    $("mapper").innerHTML = '<div class="mapper"><p class="err">' + esc(msg) + "</p></div>";
  }

  function renderMapper(headers, map, name, n) {
    var opts = function (sel) {
      return '<option value="">Not in file</option>' + headers.map(function (h) {
        return '<option value="' + esc(h) + '"' + (h === sel ? " selected" : "") + ">" + esc(h) + "</option>";
      }).join("");
    };
    $("mapper").innerHTML =
      '<div class="mapper"><h3>Match columns: ' + esc(name) + "</h3>" +
      "<p>" + n + " rows. Guessed from the headers; check anything marked required. Amount paid or open balance nets partial payments. Paid date powers the late-history modifier.</p>" +
      '<div class="mapgrid">' + AR.FIELDS.map(function (f) {
        return "<label>" + esc(f.label) + (f.required ? ' <span class="req">required</span>' : "") +
          '<select data-k="' + f.key + '">' + opts(map[f.key]) + "</select></label>";
      }).join("") + "</div>" +
      '<div class="actions"><button class="btn primary" id="applyMap" type="button">Run aging</button>' +
      '<button class="btn ghost" id="cancelMap" type="button">Cancel</button><span class="err" id="mapErr"></span></div></div>';
    $("applyMap").onclick = function () {
      var m = {};
      document.querySelectorAll("#mapper select").forEach(function (s) { if (s.value) m[s.dataset.k] = s.value; });
      var miss = AR.missingRequired(m);
      if (miss.length) { $("mapErr").textContent = "Still needed: " + miss.join(", "); return; }
      state.source = "file"; state.fileName = state.pending.name;
      state.headers = state.pending.headers; state.rows = state.pending.rows; state.map = m;
      $("mapper").innerHTML = "";
      runAnalysis();
    };
    $("cancelMap").onclick = function () { $("mapper").innerHTML = ""; };
    $("mapper").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Run ----------

  function runAnalysis() {
    state.result = AR.analyze(state.rows, state.map, state.runDate, state.settings);
    state.drafts = {}; state.dirty = {}; state.draftMode = "template";
    state.result.customers.forEach(function (c, i) { c.id = i; state.drafts[i] = maskDraft(AR.templateDraft(c, state.runDate, state.settings)); });
    render();
    requestModelDrafts();
  }

  function requestModelDrafts() {
    var res = state.result;
    var targets = res.customers.filter(function (c) { return c.action === "chase" || c.action === "billing"; });
    if (!WORKER_URL) { setStatus("", "Drafts: fixed templates per tier (Claude drafting not configured)"); return; }
    if (!targets.length) { setStatus("", "Nothing to draft this run"); return; }
    var runId = ++state.runId;
    setStatus("busy", "Drafting with Claude… templates shown meanwhile");
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 45000);
    fetch(WORKER_URL, {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ customers: targets.slice(0, 15).map(function (c) { return AR.modelSummary(c, state.runDate, state.settings); }) })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      clearTimeout(timer);
      if (runId !== state.runId) return;
      var used = 0, rejected = 0;
      (data.drafts || []).forEach(function (d) {
        var c = targets[d.index];
        if (!c || state.dirty[c.id]) return;
        var chosen = AR.chooseDraft(d, c, state.runDate, state.settings);
        if (chosen.source === "claude") used++; else rejected++;
        state.drafts[c.id] = maskDraft(chosen);
      });
      state.draftMode = "claude";
      renderCards();
      setStatus("ok", "Drafted by Claude: " + used + (rejected ? " · " + rejected + " fell back to template after failing a rule check" : "") + ". Every draft is checked against the rules before it's shown.");
    }).catch(function () {
      clearTimeout(timer);
      if (runId !== state.runId) return;
      setStatus("", "Claude unavailable right now, so these are the fixed templates per tier");
    });
  }

  function setStatus(cls, text) {
    var el = $("draftStatus");
    el.className = "status " + cls;
    el.lastElementChild.textContent = text;
  }

  // ---------- Render ----------

  function render() {
    var res = state.result;
    var pill = $("dataPill");
    pill.className = "pill " + (isDemo() ? "demo" : "file");
    pill.textContent = isDemo() ? "Demo data" : state.fileName;
    pill.title = isDemo() ? "Fictional customers and figures" : "Your file, processed in this browser";

    $("runDate").value = AR.isoDate(state.runDate);
    $("nextRun").textContent = "Next run " + AR.fmtDate(res.nextRun);

    var n = res.toChase;
    $("headline").innerHTML = n + " customer" + (n === 1 ? "" : "s") + " to chase" +
      '<span class="sep">·</span><small>' + kMoney(res.totalAR) + " outstanding</small>" +
      '<span class="sep">·</span><small>' + kMoney(res.over30) + " over 30 days</small>";
    $("dates").innerHTML = "Run <b>" + esc(AR.fmtDate(res.runDate)) + "</b><br>Next run <b>" + esc(AR.fmtDate(res.nextRun)) + "</b>";

    var needs = res.customers.filter(function (c) { return c.needsYou; });
    var chase = res.customers.filter(function (c) { return c.action === "chase"; }).length;
    var billing = res.customers.filter(function (c) { return c.action === "billing"; }).length;
    var co = [];
    if (needs.length) co.push('<span class="callout you"><b>' + needs.length + " need you</b>: " + needs.map(function (c) { return esc(c.name); }).join(", ") + "</span>");
    co.push('<span class="callout"><b>' + chase + "</b> chaser draft" + (chase === 1 ? "" : "s") + " ready</span>");
    if (billing) co.push('<span class="callout"><b>' + billing + "</b> billing repl" + (billing === 1 ? "y" : "ies") + "</span>");
    if (res.excludedTotal) co.push('<span class="callout"><b>' + res.excludedTotal + "</b> rows excluded</span>");
    $("callouts").innerHTML = co.join("");

    renderAging();
    renderCards();
    renderRubric();
    $("slack").textContent = slackText();
  }

  function slackText() {
    // ar.js escapes for Slack's API; the copy button wants plain text.
    return mask(AR.slackDigest(state.result).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }

  function renderAging() {
    var res = state.result;
    $("legend").innerHTML = AR.BUCKETS.map(function (b) {
      return '<span><i style="background:var(' + BUCKET_VARS[b.key] + ')"></i>' + b.label + (b.key === "current" ? "" : " days") + "</span>";
    }).join("");
    var head = "<thead><tr><th>Customer</th>" + AR.BUCKETS.map(function (b) { return "<th>" + b.label + "</th>"; }).join("") + "<th>Total</th><th></th></tr></thead>";
    var max = Math.max.apply(null, res.customers.map(function (c) { return c.balance; }).concat([1]));
    var body = res.customers.map(function (c) {
      var bar = AR.BUCKETS.map(function (b) {
        var v = c.buckets[b.key];
        return v ? '<span style="width:' + (v / max * 100).toFixed(2) + "%;background:var(" + BUCKET_VARS[b.key] + ')" title="' + b.label + ": " + money(v) + '"></span>' : "";
      }).join("");
      var meta = [];
      if (isDemo()) meta.push('<span class="tag demo">Demo</span>');
      if (c.needsYou) meta.push('<span class="tag you">Needs you</span>');
      meta.push("<span>" + (c.tier ? "Tier " + c.tier + " · oldest " + c.oldestDays + "d" : "Not yet due") + "</span>");
      return "<tr><td class=\"name\"><div class=\"n\">" + esc(c.name) + '</div><div class="meta">' + meta.join("") + "</div></td>" +
        AR.BUCKETS.map(function (b) { var v = c.buckets[b.key]; return '<td class="b' + (v ? "" : " zero") + '">' + (v ? money(v) : "–") + "</td>"; }).join("") +
        '<td class="tot">' + money(c.balance) + '</td><td class="barcell"><div class="bar" role="img" aria-label="' + esc(c.name) + " aging split\">" + bar + "</div></td></tr>";
    }).join("");
    var tot = { current: 0, b1: 0, b31: 0, b61: 0, b90: 0 };
    res.customers.forEach(function (c) { Object.keys(tot).forEach(function (k) { tot[k] += c.buckets[k]; }); });
    var foot = "<tfoot><tr><td>Total</td>" + AR.BUCKETS.map(function (b) { return '<td class="b">' + money(tot[b.key]) + "</td>"; }).join("") +
      '<td class="tot">' + money(res.totalAR) + "</td><td></td></tr></tfoot>";
    $("aging").innerHTML = head + "<tbody>" + body + "</tbody>" + foot;

    var ex = res.excluded, parts = [];
    if (ex.paid) parts.push(ex.paid + " paid or void");
    if (ex.nonPositive) parts.push(ex.nonPositive + " zero or negative balance (incl. credit notes)");
    if (ex.noDueDate) parts.push(ex.noDueDate + " missing a due date");
    if (ex.duplicate) parts.push(ex.duplicate + " duplicate invoice #");
    if (ex.unreadable) parts.push(ex.unreadable + " unreadable");
    $("excluded").textContent = res.excludedTotal
      ? "Excluded " + res.excludedTotal + " of " + state.rows.length + " rows: " + parts.join(", ") + "."
      : "No rows excluded (" + state.rows.length + " rows).";
  }

  function tierBadge(c) {
    var label = c.action === "billing" ? "Billing question" : AR.TIER_NAMES[c.tier];
    var col = TIER_COLORS[c.tier];
    return '<span class="tier" style="color:' + col + ";border-color:" + col + '55"><i style="background:' + col + '"></i>Tier ' + c.tier + " · " + esc(label) + "</span>";
  }

  function renderCards() {
    var res = state.result;
    var shown = res.customers.filter(function (c) { return c.tier >= 1; });
    shown.sort(function (a, b) { return (b.needsYou - a.needsYou) || (b.tier - a.tier) || (b.balance - a.balance); });
    $("cards").innerHTML = shown.map(function (c) {
      var d = state.drafts[c.id];
      var facts = money(c.balance) + " open · " + c.invoices.length + " invoice" + (c.invoices.length === 1 ? "" : "s") + " · oldest " + c.oldestDays + "d overdue";
      var flags = c.flags.map(function (f) { return "<li>" + esc(mask(f)) + "</li>"; });
      if (c.toneNote && c.action === "chase") flags.push('<li class="tone">' + esc(c.toneNote) + "</li>");
      if (d.rejected) flags.push("<li>Claude draft failed a rule check (" + esc(mask(d.rejected[0])) + "), template used</li>");
      var why = c.tier === 5 ? "Over 90 days. This needs a call from you, not another email."
        : !c.email ? "No contact email in the export. Fix the record and re-run."
        : "Check this account before anything goes out.";
      var preview = d.body ? d.subject : why;
      var summary = '<summary><div class="sl"><div class="cname">' + esc(c.name) + "</div>" +
        '<div class="facts num">' + (isDemo() ? '<span class="tag demo">Demo</span> ' : "") + facts + "</div>" +
        '<div class="preview">' + esc(preview) + "</div></div>" +
        '<div class="sr2">' + (c.needsYou ? '<span class="tag you">Needs you</span>' : "") + tierBadge(c) +
        '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div></summary>';
      var fl = flags.length ? '<ul class="flags">' + flags.join("") + "</ul>" : "";
      var bd;
      if (!d.body) {
        bd = '<div class="bd">' + fl + '<div class="needs"><b>Needs you</b><p>' + esc(why) + "</p></div></div>";
      } else {
        bd = '<div class="bd">' + fl + '<div class="addr"><b>To</b> ' + esc(d.to) + (d.cc ? " · <b>Cc</b> " + esc(d.cc) : "") +
          (c.tier === 4 ? " · <b>Send from founder</b>" : "") + "</div>" +
          '<input class="subj" data-id="' + c.id + '" aria-label="Subject" value="' + esc(d.subject) + '">' +
          '<textarea data-id="' + c.id + '" aria-label="Email body" spellcheck="true">' + esc(d.body) + "</textarea>" +
          '<div class="ft"><button class="btn primary" type="button" data-copy="' + c.id + '">Copy</button>' +
          '<a class="btn" target="_blank" rel="noopener" data-gmail="' + c.id + '" href="' + gmailUrl(d) + '">Open in Gmail</a>' +
          '<span class="src">' + (d.source === "claude" ? "Drafted by Claude" : "Template") + (state.dirty[c.id] ? " · edited" : "") + "</span></div></div>";
      }
      return '<details class="card' + (c.needsYou ? " you" : "") + '" data-card="' + c.id + '"' + (state.open[c.id] ? " open" : "") + ">" + summary + bd + "</details>";
    }).join("");

    document.querySelectorAll("#cards textarea").forEach(fit);

    var listed = res.customers.filter(function (c) { return c.tier === 0; });
    $("listed").innerHTML = listed.length
      ? "<b>Not yet due, no action:</b> " + listed.map(function (c) { return esc(c.name) + " (" + money(c.balance) + ")"; }).join(", ")
      : "";
  }

  function fit(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; }

  function gmailUrl(d) {
    var q = "view=cm&fs=1&to=" + encodeURIComponent(d.to || "") + (d.cc ? "&cc=" + encodeURIComponent(d.cc) : "") +
      "&su=" + encodeURIComponent(d.subject) + "&body=" + encodeURIComponent(d.body);
    return "https://mail.google.com/mail/?" + q;
  }

  function renderRubric() {
    if ($("rubric").dataset.done) return;
    $("rubric").dataset.done = "1";
    $("rubric").innerHTML = "<table><thead><tr><th>Tier</th><th>Days overdue</th><th>Tone</th><th>Must include</th><th>Ask</th></tr></thead><tbody>" +
      AR.RUBRIC.map(function (r) {
        return "<tr><td><b>" + r.tier + "</b></td><td>" + esc(r.days) + "</td><td>" + esc(r.tone) + "</td><td>" + esc(r.include) + "</td><td>" + esc(r.ask) + "</td></tr>";
      }).join("") + "</tbody></table>" +
      "<ul><li><b>Disputed:</b> no chaser; a billing-question reply instead.</li>" +
      "<li><b>Partial payment:</b> thanks them for what arrived and chases only the remainder.</li>" +
      "<li><b>No late payments in 12 months:</b> tone one step softer. <b>Two or more:</b> one step firmer. Tier stays for routing.</li>" +
      "<li><b>Over 20% of total AR:</b> flagged “Needs you”, still drafted.</li>" +
      "<li><b>Missing contact email:</b> no draft, flagged for data cleanup.</li>" +
      "<li><b>Hard rules:</b> figures only from the export, no legal or collections language, no fees unless the terms state one, under 120 words, no exclamation marks. Claude's drafts are checked against these and replaced by the template if they fail.</li></ul>";
  }

  // ---------- Copy helpers ----------

  function copy(text, btn) {
    var done = function () {
      var t = btn.textContent; btn.textContent = "Copied"; btn.classList.add("done");
      setTimeout(function () { btn.textContent = t; btn.classList.remove("done"); }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* leave text selectable */ }
      ta.remove();
    }
  }

  // ---------- Apps Script ----------

  var scriptText = "";
  function loadScript() {
    Promise.all([fetch("ar.js").then(function (r) { return r.text(); }), fetch("sheet-runner.js").then(function (r) { return r.text(); })])
      .then(function (parts) {
        scriptText = "/* SnapMagic AR chaser: Google Apps Script. Generated from the same core as the web page. */\n\n" + parts[0] + "\n\n" + parts[1];
        $("scriptCode").textContent = scriptText;
        $("scriptSize").textContent = "· " + scriptText.split("\n").length + " lines";
      })
      .catch(function () { $("scriptCode").textContent = "Couldn't load the script. Serve the page over http(s) rather than file://."; });
  }

  // ---------- Events ----------

  $("runDate").addEventListener("change", function (e) {
    var t = AR.parseDate(e.target.value);
    if (t == null) return;
    state.runDate = t;
    runAnalysis();
  });
  $("file").addEventListener("change", function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
  $("uploadBtn").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
  $("demoBtn").addEventListener("click", loadDemo);

  ["sName", "sRole", "fName", "fRole"].forEach(function (id, i) {
    $(id).value = state.settings[["senderName", "senderRole", "founderName", "founderRole"][i]];
  });
  $("saveSign").addEventListener("click", function () {
    state.settings.senderName = $("sName").value.trim() || AR.DEFAULT_SETTINGS.senderName;
    state.settings.senderRole = $("sRole").value.trim() || AR.DEFAULT_SETTINGS.senderRole;
    state.settings.founderName = $("fName").value.trim() || AR.DEFAULT_SETTINGS.founderName;
    state.settings.founderRole = $("fRole").value.trim() || AR.DEFAULT_SETTINGS.founderRole;
    $("settings").open = false;
    runAnalysis();
  });

  // Cards are collapsed by default; remember which are open across re-renders.
  $("cards").addEventListener("toggle", function (e) {
    var el = e.target; if (!el.dataset || el.dataset.card == null) return;
    state.open[el.dataset.card] = el.open;
    if (el.open) el.querySelectorAll("textarea").forEach(fit);
  }, true);

  $("cards").addEventListener("input", function (e) {
    var id = e.target.dataset.id; if (id == null) return;
    var d = state.drafts[id];
    if (e.target.tagName === "TEXTAREA") { d.body = e.target.value; fit(e.target); } else d.subject = e.target.value;
    state.dirty[id] = true;
    var a = document.querySelector('[data-gmail="' + id + '"]'); if (a) a.href = gmailUrl(d);
  });
  $("cards").addEventListener("click", function (e) {
    var id = e.target.dataset.copy; if (id == null) return;
    var d = state.drafts[id];
    copy("Subject: " + d.subject + "\n\n" + d.body, e.target);
  });
  $("copySlack").addEventListener("click", function (e) { copy(slackText(), e.target); });
  $("copyScript").addEventListener("click", function (e) { if (scriptText) copy(scriptText, e.target); });
  $("dlScript").addEventListener("click", function () {
    if (!scriptText) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([scriptText], { type: "text/javascript" }));
    a.download = "Code.gs"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  loadDemo();
  loadScript();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { document.querySelectorAll("#cards textarea").forEach(fit); });
})();
