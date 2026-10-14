# Expert onboarding

Can a new finance expert go from sign-up to ready-to-work without a person walking them through it?

**Live:** https://jakem-r.github.io/halluminate-partnership-intel/

A working prototype by Jake Makking-Robinson, built for Halluminate's Chief of Staff and People Platform Lead roles ("building from scratch HR, Onboarding, Ops"; "building systems to formalize sourcing, training, onboarding, and HR for experts").

## Expert view (about 10 minutes)

1. **Orientation:** what experts do and what a good review looks like.
2. **Sample task:** review a model's answer to a diligence question, claim by claim. Mark each claim sound or wrong, name the error type, give the right figure where there is one, and decide whether to sign it off.
3. **Feedback:** instant, per claim: what you caught, what you missed, and why it matters.
4. **Readiness:** ready, ready after one calibration task, or not yet, with strengths, gaps, a suggested first task type and the record that would go to the operator queue.

The sample task is **illustrative**. I wrote it from public descriptions of Westworld Finance Diligence Bench. It isn't a Halluminate task, and the company and every number are fictional.

## Operator view

A funnel (sourced → started → submitted → ready) with step drop-off, outcome split, and per-claim miss rates. **These are demo figures, labelled as such on the page.** The grader checks at the bottom are real and run in the browser.

The view sits behind a click-through gate ("Continue as demo operator"), because in production it would be behind company sign-in, and its miss-rate table shows which claims are wrong. `#operator` links straight past the gate.

## How the grading works

`site/grader.js` grades against the rubric and answer key in `site/task.js`. It doesn't call a model, so the same review always gets the same feedback and nothing freestyles on finance reasoning. Errors are weighted by severity (the covenant conclusion is critical), a right catch with the wrong label gets partial credit, and flagging sound claims costs points.

`site/test-answers.js` holds deliberately strong, average and weak reviews. `tests/grader.test.js` checks that each lands in the right tier and gets the right per-claim feedback, and that the answer key's own arithmetic holds. CI runs it before every deploy.

```bash
node --test tests/*.test.js
python3 -m http.server -d site
```

Static files only, no keys, no backend. GitHub Pages deploys on push to `main`.

## Next

A short screening step in front of onboarding that routes applicants to task types.
