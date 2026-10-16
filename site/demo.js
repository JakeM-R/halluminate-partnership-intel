/* Demo data. Generic customers (A to L) with edge cases seeded. The page masks amounts as $xx in demo mode.
 * Dates are generated relative to the run date so the demo reads the same on any day. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DEMO = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var DAY = 86400000;

  // [invoice, customer, email, apEmail, amount, paid, daysOverdue, status, paidDaysAfterDue]
  // daysOverdue: positive = past due at run date; negative = due in future; null = missing due date.
  var ROWS = [
    ["INV-2201", "Customer A", "billing@customer-a.example", "", 2400, 0, 10, "Open", null],
    ["INV-2102", "Customer A", "billing@customer-a.example", "", 1950, 1950, 160, "Paid", -2],
    ["INV-2150", "Customer A", "billing@customer-a.example", "", 2100, 2100, 95, "Paid", 0],

    ["INV-2215", "Customer B", "billing@customer-b.example", "", 1850, 0, 5, "Open", null],
    ["INV-2160", "Customer B", "billing@customer-b.example", "", 3200, 0, 40, "Open", null],
    ["INV-2131", "Customer B", "billing@customer-b.example", "", 2950, 0, 70, "Open", null],
    ["INV-2080", "Customer B", "billing@customer-b.example", "", 2600, 2600, 190, "Paid", 12],
    ["INV-2095", "Customer B", "billing@customer-b.example", "", 2750, 2750, 150, "Paid", 20],

    ["INV-2190", "Customer C", "billing@customer-c.example", "", 5000, 2000, 22, "Partially paid", null],

    ["INV-2172", "Customer D", "billing@customer-d.example", "", 4100, 0, 35, "Disputed", null],

    ["INV-2088", "Customer E", "billing@customer-e.example", "", 6200, 0, 120, "Open", null],

    ["INV-2168", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 2800, 0, 45, "Open", null],
    ["INV-2230", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 1500, 0, -12, "Open", null],
    ["INV-2110", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 2300, 2300, 140, "Paid", 9],

    ["INV-2196", "Customer G", "", "", 1900, 0, 18, "Open", null],

    ["INV-2235", "Customer H", "billing@customer-h.example", "", 3400, 0, -20, "Open", null],
    ["INV-2240", "Customer H", "billing@customer-h.example", "", 2600, 0, -25, "Open", null],
    ["INV-2117", "Customer H", "billing@customer-h.example", "", 2900, 2900, 135, "Paid", -3],

    ["INV-2238", "Customer I", "billing@customer-i.example", "", 1800, 0, -15, "Open", null],
    ["INV-2246", "Customer I", "billing@customer-i.example", "", 1200, 0, -5, "Open", null],

    ["INV-2205", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 10400, 0, 8, "Open", null],
    ["INV-2071", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 8800, 8800, 200, "Paid", 16],
    ["INV-2125", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 9100, 9100, 110, "Paid", 7],

    ["INV-2120", "Customer K", "billing@customer-k.example", "", 1600, 1600, 130, "Paid", 0],
    ["INV-2199", "Customer K", "billing@customer-k.example", "", -450, 0, 20, "Open", null],
    ["INV-2185", "Customer K", "billing@customer-k.example", "", 1200, 1200, 25, "Open", null],

    ["INV-2222", "Customer L", "billing@customer-l.example", "", 1200, 0, 3, "Open", null],
    ["INV-2222", "Customer L", "billing@customer-l.example", "", 1200, 0, 3, "Open", null],
    ["INV-2228", "Customer L", "billing@customer-l.example", "", 900, 0, null, "Open", null],
    ["INV-2141", "Customer L", "billing@customer-l.example", "", 1350, 1350, 120, "Paid", -1]

  ];

  var HEADERS = ["Invoice number", "Company name", "Contact email", "AP email", "Amount", "Amount paid", "Invoice date", "Due date", "Status", "Terms", "Paid date"];

  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function csv(runDate) {
    var run = runDate;
    var lines = [HEADERS.join(",")];
    ROWS.forEach(function (r) {
      var due = r[6] == null ? null : run - r[6] * DAY;
      var issue = (due == null ? run - 40 * DAY : due - 30 * DAY);
      var paidDate = r[8] == null ? "" : iso(due + r[8] * DAY);
      lines.push([r[0], r[1], r[2], r[3], r[4].toFixed(2), r[5].toFixed(2), iso(issue), due == null ? "" : iso(due), r[7], "Net 30", paidDate].map(q).join(","));
    });
    return lines.join("\n");
  }

  return { csv: csv, HEADERS: HEADERS, count: ROWS.length };
});
