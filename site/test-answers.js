// Three deliberately strong, average and weak reviews of the sample task.
// The grader has to get all three right before anything ships (see tests/).
(function (root) {
  const TEST_ANSWERS = {
    strong: {
      label: "Strong reviewer",
      response: {
        claims: {
          c4: { flag: true, type: "adjustment" },
          c5: { flag: true, type: "adjustment" },
          c6: { flag: true, type: "carried", value: 18.9 },
          c7: { flag: true, type: "carried", value: 9.5 },
          c8: { flag: true, type: "conclusion", value: 5.0 },
          c10: { flag: true, type: "misread" },
        },
        signoff: "no",
      },
      expect: { tier: "ready", minScore: 0.99 },
    },
    average: {
      label: "Average reviewer",
      response: {
        // Spots the obvious pro forma add-back and the covenant, misses the asset
        // gain and the customer concentration, names one error loosely.
        claims: {
          c4: { flag: true, type: "adjustment" },
          c6: { flag: true, type: "calc" },
          c8: { flag: true, type: "carried", value: 4.9 },
        },
        signoff: "no",
      },
      expect: { tier: "calibrate", minScore: 0.5, maxScore: 0.6 },
    },
    weak: {
      label: "Weak reviewer",
      response: {
        // Second-guesses a correct growth figure, half-sees the multiple, signs off.
        claims: {
          c1: { flag: true, type: "calc" },
          c7: { flag: true, type: "misread" },
        },
        signoff: "yes",
      },
      expect: { tier: "not-yet", maxScore: 0.1 },
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TEST_ANSWERS;
  else root.HALLU_TEST_ANSWERS = TEST_ANSWERS;
})(this);
