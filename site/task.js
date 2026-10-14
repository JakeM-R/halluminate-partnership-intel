// Illustrative sample task, rubric and answer key. Written by Jake Makking-Robinson
// from public descriptions of Westworld Finance Diligence Bench. Not a Halluminate task.
// The company, deal and every number below are fictional.
(function (root) {
  const TASK = {
    id: "harbour-qoe-v1",
    title: "Harbour Freight: quality of earnings and leverage check",

    brief:
      "A private equity fund is buying Harbour Freight Services, a UK contract logistics business. " +
      "An AI model was asked to answer the question below from the data pack. Your job is to review " +
      "its answer line by line: mark each claim as sound or wrong, and say what kind of error it is.",

    question:
      "Calculate FY24 Adjusted EBITDA, the entry EV/EBITDA multiple, and whether the proposed debt " +
      "fits the lender's leverage covenant. Flag any key diligence risks.",

    dataPack: [
      ["Revenue", "FY23 £111.1m · FY24 £120.0m"],
      ["Reported EBITDA, FY24", "£18.0m"],
      ["Note A", "£1.5m restructuring cost for closing the Leeds depot. Completed March 2024, invoices provided."],
      ["Note B", "£0.6m gain on the sale of the Bristol warehouse, booked in other operating income."],
      ["Note C", "Management proposes adding £2.0m of run-rate EBITDA from a national grocer contract signed in February 2025, after the year end."],
      ["Customers", "Largest customer is 34% of FY24 revenue. Its contract expires seven months after the planned close."],
      ["Debtor days", "FY23 52 · FY24 47"],
      ["Deal terms", "Enterprise value £180m. Senior debt £95m."],
      ["Covenant", "Total leverage no higher than 4.5x Adjusted EBITDA. The lender accepts documented one-off costs as add-backs; it does not accept pro forma or forward-looking EBITDA."],
    ],

    errorTypes: [
      { id: "adjustment", label: "Wrong add-back or adjustment" },
      { id: "calc", label: "Arithmetic or calculation" },
      { id: "misread", label: "Misread or missed source data" },
      { id: "conclusion", label: "Unsupported conclusion" },
      { id: "carried", label: "Carried forward from an earlier error" },
    ],

    // severity: critical 3, major 2, minor 1. A claim with no `error` is sound.
    claims: [
      {
        id: "c1", area: "data",
        text: "Revenue grew 8.0% year on year, from £111.1m to £120.0m.",
        sound: "Correct: 120.0 / 111.1 is 1.080, so 8.0% growth. Nothing to flag here.",
      },
      {
        id: "c2", area: "data",
        text: "Reported FY24 EBITDA is £18.0m.",
        sound: "Correct: taken straight from the data pack.",
      },
      {
        id: "c3", area: "adjustments",
        text: "Add back the £1.5m Leeds depot restructuring as a non-recurring cost.",
        sound: "Correct: a completed, documented one-off cost (Note A), and the covenant explicitly accepts it.",
      },
      {
        id: "c4", area: "adjustments",
        text: "Add back £2.0m of run-rate EBITDA from the new grocer contract, since it is signed.",
        error: {
          severity: 2, types: ["adjustment"],
          why: "The contract was signed after the year end, so the £2.0m is forward-looking pro forma EBITDA, not FY24 earnings. The covenant says in terms that the lender does not accept it. Being signed does not make it earned.",
        },
      },
      {
        id: "c5", area: "adjustments",
        text: "The £0.6m Bristol warehouse gain sits in operating income, so it stays in EBITDA.",
        error: {
          severity: 2, types: ["adjustment"],
          why: "A one-off gain on an asset sale should come out of Adjusted EBITDA, for the same reason the one-off Leeds cost is added back. Where it was booked does not matter. Leaving it in overstates recurring earnings by £0.6m.",
        },
      },
      {
        id: "c6", area: "propagation",
        text: "Adjusted EBITDA is therefore £21.5m.",
        correct: { value: 18.9, min: 18.85, max: 18.95, unit: "£m" },
        error: {
          severity: 1, types: ["carried", "calc"],
          why: "The arithmetic follows from the two bad adjustments above. The right figure is 18.0 + 1.5 − 0.6 = £18.9m.",
        },
      },
      {
        id: "c7", area: "propagation",
        text: "At £180m EV, the entry multiple is 8.4x Adjusted EBITDA.",
        correct: { value: 9.5, min: 9.45, max: 9.6, unit: "x" },
        error: {
          severity: 1, types: ["carried", "calc"],
          why: "180 / 21.5 is 8.4x, so the division is fine, but the base is wrong. On £18.9m the buyer is paying 9.5x, more than a turn higher than the model says.",
        },
      },
      {
        id: "c8", area: "propagation",
        text: "Debt of £95m is 4.4x Adjusted EBITDA, inside the 4.5x covenant, so the structure works.",
        correct: { value: 5.0, min: 4.95, max: 5.1, unit: "x" },
        error: {
          severity: 3, types: ["carried", "conclusion"],
          why: "This is the line that matters. On £18.9m, £95m of debt is 5.0x, which breaches the 4.5x covenant. The deal as structured does not work, and the model has told the reader the opposite. Missing this is how a model ends up confidently wrong on the one question the reader cares about.",
        },
      },
      {
        id: "c9", area: "data",
        text: "Working capital is improving: debtor days fell from 52 to 47.",
        sound: "Correct: debtor days fell from 52 to 47, as the data pack says. A fair, if minor, positive.",
      },
      {
        id: "c10", area: "data",
        text: "No material customer concentration risk identified.",
        error: {
          severity: 2, types: ["misread", "conclusion"],
          why: "One customer is 34% of revenue and its contract expires seven months after close. That is the most important commercial risk in the pack, and the model missed it.",
        },
      },
    ],

    signoff: {
      question: "Would you sign off this answer as it stands?",
      expected: "no",
      why: "the covenant conclusion is wrong and a major risk is missing. A reviewer's job on an answer like this is to stop it.",
    },

    areas: {
      adjustments: { label: "Accounting adjustments", firstTask: "Quality-of-earnings reviews: checking add-backs and normalisations" },
      data: { label: "Reading the data pack", firstTask: "Source-data checks: verifying figures and facts against the documents" },
      propagation: { label: "Following an error through", firstTask: "Valuation and leverage reviews: multi-step calculations where one early mistake moves the answer" },
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TASK;
  else root.HALLU_TASK = TASK;
})(this);
