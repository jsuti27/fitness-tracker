/**
 * Receives logged gym sessions from the Macros & Gym app and writes them into
 * this spreadsheet — one row per set.
 *
 * Idempotent: rows are keyed on Date|Day|Exercise|Set. Sending the same session
 * again updates those rows instead of appending duplicates, so a retry after a
 * dropped connection, or an edit made on the phone, corrects the sheet.
 *
 * Setup instructions live in README.md next to this file.
 */

// Change this to any random string, then paste the same string into the app's
// Settings screen. It stops a stray copy of the URL from writing to your sheet.
var SECRET = 'change-me';

var SHEET_NAME = 'Sets';
var HEADERS = ['Date', 'Week', 'Day', 'Exercise', 'Set', 'Kg', 'Reps', 'In range?', 'Note'];

// The program is the only thing that lives solely on the phone, so this tab is
// its only backup. The Exercise ID column is what makes an export/edit/import
// round-trip safe — reimporting with ids intact keeps logged history attached.
var PROGRAM_SHEET_NAME = 'Program';
var PROGRAM_HEADERS = ['Day', 'Order', 'Exercise', 'Target Sets', 'Rep Range', 'Increment', 'Exercise ID'];

function doPost(e) {
  // Two syncs firing at once (the app autosaves as you type, so a flush can
  // overlap the previous one) would both build the index before either wrote,
  // both conclude the row is new, and both append it. Serialising the whole
  // read-then-write makes the idempotency check mean what it claims.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, error: 'busy, retry' });
  }

  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.secret !== SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }

    // An older app build sends no `kind` at all, and everything it sends is a
    // session. Defaulting that way keeps a stale phone working against a new
    // script. The lock is still held here — releasing it early would need a
    // second exit path, and a program write is rare enough not to matter.
    if (payload.kind === 'program') {
      return writeProgram(payload.rows || []);
    }

    var sheet = getSheet();
    var rows = payload.rows || [];
    var index = buildIndex(sheet);
    var appended = 0;
    var updated = 0;

    // The session was deleted in the app — clear its rows so the sheet stays
    // in step. Deleting bottom-up keeps the remaining row numbers valid.
    if (payload.deleted && payload.date && payload.day) {
      var toDelete = [];
      for (var key in index) {
        var parts = key.split('|');
        if (parts[0] === String(payload.date) && parts[1] === String(payload.day)) {
          toDelete.push(index[key]);
        }
      }
      toDelete.sort(function (a, b) { return b - a; });
      for (var d = 0; d < toDelete.length; d++) {
        sheet.deleteRow(toDelete[d]);
      }
      return json({ ok: true, deleted: toDelete.length });
    }

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var values = [r.date, r.week, r.day, r.exercise, r.set, r.kg, r.reps, r.inRange, r.note];
      var key = rowKey(r.date, r.day, r.exercise, r.set);

      if (index[key]) {
        sheet.getRange(index[key], 1, 1, HEADERS.length).setValues([values]);
        updated++;
      } else {
        sheet.appendRow(values);
        index[key] = sheet.getLastRow();
        appended++;
      }
    }

    return json({ ok: true, appended: appended, updated: updated });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * One-off tidy-up. Run this by hand from the Apps Script editor (pick
 * `cleanUpSheet` from the function dropdown and press Run) — it is never
 * called by the app.
 *
 * Removes, bottom-up so row numbers stay valid as we go:
 *   1. the CONNECTION TEST row from first setting sync up
 *   2. duplicate rows sharing a Date|Day|Exercise|Set key, keeping the row
 *      with reps filled in — a blank-reps row is a half-finished send that a
 *      later one superseded
 *
 * Logs what it removed. Take a copy of the sheet first if you want a safety net
 * (File -> Make a copy); this deletes rows in place.
 */
function cleanUpSheet() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  // Best row seen so far per key. "Best" = has reps; ties keep the first.
  var best = {};
  var doomed = [];

  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var rowNumber = i + 2;

    if (String(v[3]).toUpperCase() === 'CONNECTION TEST') {
      doomed.push(rowNumber);
      continue;
    }

    var key = rowKey(formatDate(v[0]), v[2], v[3], v[4]);
    var hasReps = v[6] !== '' && v[6] !== null;

    if (!best[key]) {
      best[key] = { row: rowNumber, hasReps: hasReps };
    } else if (!best[key].hasReps && hasReps) {
      doomed.push(best[key].row);          // the blank one loses
      best[key] = { row: rowNumber, hasReps: hasReps };
    } else {
      doomed.push(rowNumber);              // keeper already found
    }
  }

  doomed.sort(function (a, b) { return b - a; });
  for (var d = 0; d < doomed.length; d++) {
    sheet.deleteRow(doomed[d]);
  }

  Logger.log('Removed ' + doomed.length + ' row(s).');
}

/**
 * Replaces the Program tab wholesale. The program is ~20 rows with a single
 * writer, and deletions have to propagate, so a full rewrite is both simpler
 * and more correct than the keyed upsert the Sets tab uses.
 *
 * Hand-edits to this tab are lost on the next program change in the app.
 */
function writeProgram(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PROGRAM_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROGRAM_SHEET_NAME);
  }

  sheet.clear();
  sheet.appendRow(PROGRAM_HEADERS);
  sheet.getRange(1, 1, 1, PROGRAM_HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (rows.length) {
    var values = rows.map(function (r) {
      return [r.day, r.order, r.exercise, r.targetSets, r.repRange, r.increment, r.exerciseId];
    });
    sheet.getRange(2, 1, values.length, PROGRAM_HEADERS.length).setValues(values);
  }

  return json({ ok: true, program: rows.length });
}

/** Lets you check the deployment is live by opening the URL in a browser. */
function doGet() {
  return json({ ok: true, message: 'Gym log endpoint is running.' });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Map of "date|day|exercise|set" -> sheet row number, for in-place updates. */
function buildIndex(sheet) {
  var index = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    index[rowKey(formatDate(v[0]), v[2], v[3], v[4])] = i + 2;
  }
  return index;
}

function rowKey(date, day, exercise, set) {
  return [date, day, exercise, set].join('|');
}

/**
 * Sheets hands back a Date object for the date column, but the app sends
 * "2026-08-01" strings. Normalise so the two forms match in the index.
 */
function formatDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
