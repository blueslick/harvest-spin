/**
 * HARVEST SPIN - Google Sheets receiver
 * ---------------------------------------------------------------
 * Paste this whole file into a Google Sheet's Apps Script editor
 * (Extensions > Apps Script) and deploy it as a Web app.
 * Step-by-step instructions are in the README ("Google Sheets sync").
 *
 * The game sends every spin here. Spins already in the sheet are
 * skipped, so it is always safe for the game to re-send.
 */

// Must match the "Secret token" you type into the game's Admin panel.
// Change it to your own made-up word or number before deploying.
var TOKEN = 'change-me';

var SPINS_SHEET = 'Spins';
var TEST_SHEET = 'Connection test';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return reply_({ ok: false, error: 'wrong token' });
    lock.waitLock(20000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.test) {
      var t = sheet_(ss, TEST_SHEET, ['received_at', 'message']);
      t.getRange(t.getLastRow() + 1, 1, 1, 2).setValues([[new Date().toISOString(), 'connection test OK']]);
      return reply_({ ok: true, test: true });
    }

    var rows = body.rows || [];
    var sh = sheet_(ss, SPINS_SHEET, body.header || []);
    // existing spins, identified by timestamp + spin number
    var seen = {};
    var last = sh.getLastRow();
    if (last > 1) {
      sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { seen[String(r[0]) + '|' + String(r[1])] = true; });
    }
    var fresh = rows.filter(function (r) { return !seen[String(r[0]) + '|' + String(r[1])]; });
    if (fresh.length) {
      sh.getRange(sh.getLastRow() + 1, 1, fresh.length, fresh[0].length).setValues(fresh);
    }
    return reply_({ ok: true, saved: fresh.length, skipped: rows.length - fresh.length });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

// Opening the URL in a browser just shows that it is alive.
function doGet() {
  return reply_({ ok: true, message: 'Harvest Spin receiver is running' });
}

function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:A').setNumberFormat('@');   // keep timestamps as plain text so de-duplication works
  }
  if (sh.getLastRow() === 0 && header.length) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
