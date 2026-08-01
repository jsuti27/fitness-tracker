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

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.secret !== SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }

    var sheet = getSheet();
    var rows = payload.rows || [];
    var index = buildIndex(sheet);
    var appended = 0;
    var updated = 0;

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
  }
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
