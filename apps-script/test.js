// Checks apps-script/Code.gs against an in-memory fake of the Google services.
// Run:  node apps-script/test.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function makeEnv() {
  const sheets = {};
  const fakeSheet = (name) => {
    const data = [];  // array of row arrays
    return {
      name, data, formats: {},
      getLastRow: () => data.length,
      getRange(r, c, nr, nc) {
        if (typeof r === "string") return { setNumberFormat: (f) => { sheets[name].formats[r] = f; } };
        return {
          getValues: () => data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
          setValues: (vals) => vals.forEach((row, i) => { data[r - 1 + i] = row.slice(); }),
        };
      },
    };
  };
  const ctx = {
    JSON, Date, String, Object, Array,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = fakeSheet(n)),
    }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8"), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  return { ctx, sheets, post };
}

let failed = 0;
const check = (name, cond) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name); if (!cond) failed++; };
const header = ["timestamp", "spin_number", "player_number"];
const row = (n) => ["2026-10-05T09:30:" + String(n).padStart(2, "0") + ".000Z", n, 1];

let { post, sheets, ctx } = makeEnv();
check("wrong token is rejected and writes nothing", post({ token: "nope", header, rows: [row(1)] }).error === "wrong token" && !sheets.Spins);
let r = post({ token: "change-me", header, rows: [row(1), row(2)] });
check("first batch saved, header written", r.ok && r.saved === 2 && sheets.Spins.data.length === 3 && sheets.Spins.data[0][0] === "timestamp");
r = post({ token: "change-me", header, rows: [row(1), row(2), row(3)] });
check("re-sending skips spins already in the sheet", r.ok && r.saved === 1 && r.skipped === 2 && sheets.Spins.data.length === 4);
r = post({ token: "change-me", header, rows: [row(1)] });
check("re-sending only duplicates adds nothing", r.ok && r.saved === 0 && sheets.Spins.data.length === 4);
check("timestamp column is forced to plain text", sheets.Spins.formats["A:A"] === "@");
r = post({ token: "change-me", test: true });
check("test request writes to the 'Connection test' tab, not Spins", r.ok && r.test && sheets["Connection test"].data.length === 2 && sheets.Spins.data.length === 4);
check("garbage input returns ok:false instead of crashing", JSON.parse(ctx.doPost({ postData: { contents: "not json" } }).s).ok === false);
check("GET shows the receiver is alive", JSON.parse(ctx.doGet().s).ok === true);
console.log(failed ? "\n" + failed + " FAILED" : "\nall passed");
process.exit(failed ? 1 : 0);
