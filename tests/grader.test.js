const test = require("node:test");
const assert = require("node:assert");
const TASK = require("../site/task.js");
const { grade } = require("../site/grader.js");
const ANSWERS = require("../site/test-answers.js");

for (const [key, a] of Object.entries(ANSWERS)) {
  test(`${key} reviewer gets the expected tier and score`, () => {
    const r = grade(TASK, a.response);
    assert.strictEqual(r.tier, a.expect.tier);
    if (a.expect.minScore != null) assert.ok(r.score >= a.expect.minScore, `score ${r.score}`);
    if (a.expect.maxScore != null) assert.ok(r.score <= a.expect.maxScore, `score ${r.score}`);
  });
}

test("answer key is internally consistent", () => {
  const adj = 18.0 + 1.5 - 0.6;
  const byId = Object.fromEntries(TASK.claims.map((c) => [c.id, c]));
  const inRange = (c, v) => v >= c.correct.min && v <= c.correct.max;
  assert.ok(inRange(byId.c6, adj));
  assert.ok(inRange(byId.c7, 180 / adj));
  assert.ok(inRange(byId.c8, 95 / adj));
  assert.ok(95 / adj > 4.5, "covenant should be breached");
  assert.strictEqual((120.0 / 111.1 - 1).toFixed(3), "0.080");
});

test("strong reviewer: every error caught with right figures, no false flags", () => {
  const r = grade(TASK, ANSWERS.strong.response);
  assert.strictEqual(r.caught, r.totalErrors);
  assert.strictEqual(r.falseFlags, 0);
  for (const i of r.items.filter((i) => i.correct)) assert.strictEqual(i.figure, "right", i.id);
  assert.strictEqual(r.gaps.length, 0);
});

test("average reviewer: misses are the gain, customer risk and multiple", () => {
  const r = grade(TASK, ANSWERS.average.response);
  const missed = r.items.filter((i) => i.outcome === "missed").map((i) => i.id).sort();
  assert.deepStrictEqual(missed, ["c10", "c5", "c7"]);
  const c8 = r.items.find((i) => i.id === "c8");
  assert.strictEqual(c8.figure, "wrong"); // 4.9x is not 5.0x
  assert.ok(r.criticalCaught);
});

test("weak reviewer: false flag on a correct claim is reported, critical missed", () => {
  const r = grade(TASK, ANSWERS.weak.response);
  assert.strictEqual(r.items.find((i) => i.id === "c1").outcome, "false-flag");
  assert.strictEqual(r.items.find((i) => i.id === "c7").outcome, "caught-mistyped");
  assert.ok(!r.criticalCaught);
  assert.strictEqual(r.firstTask, null);
});

test("empty review is not ready and does not crash", () => {
  const r = grade(TASK, { claims: {}, signoff: null });
  assert.strictEqual(r.tier, "not-yet");
  assert.strictEqual(r.score, 0);
});

test("flagging everything is penalised, not rewarded", () => {
  const claims = {};
  for (const c of TASK.claims) claims[c.id] = { flag: true, type: c.error ? c.error.types[0] : "calc" };
  const r = grade(TASK, { claims, signoff: "no" });
  assert.strictEqual(r.falseFlags, 4);
  assert.notStrictEqual(r.tier, "ready");
});
