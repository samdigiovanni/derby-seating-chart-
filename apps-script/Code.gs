const TOTAL_SEATS = 40;
const ASSET_BASE_URL = "https://samdigiovanni.github.io/derby-seating-chart-/";
const SHEET_NAMES = {
  guests: "Guests",
  seats: "Seats",
  rules: "Rules",
  meta: "Meta",
};

function doGet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensurePlannerSheets_(spreadsheet);

  const template = HtmlService.createTemplateFromFile("Index");
  template.assetBaseUrl = ASSET_BASE_URL.replace(/\/?$/, "/");

  return template
    .evaluate()
    .setTitle("Table Planner")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupPlannerSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensurePlannerSheets_(spreadsheet);
  return {
    ok: true,
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetName: spreadsheet.getName(),
  };
}

function getSharedPlan() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensurePlannerSheets_(spreadsheet);

  return {
    plan: readPlannerState_(spreadsheet),
    savedAt: readMetaValue_(spreadsheet, "savedAt"),
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetName: spreadsheet.getName(),
  };
}

function saveSharedPlan(plan) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensurePlannerSheets_(spreadsheet);

  const normalizedPlan = normalizePlannerState_(plan);
  writePlannerState_(spreadsheet, normalizedPlan);

  const savedAt = new Date().toISOString();
  writeMetaValues_(spreadsheet, {
    savedAt: savedAt,
    savedBy: Session.getActiveUser().getEmail() || "unknown",
  });

  return {
    ok: true,
    savedAt: savedAt,
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetName: spreadsheet.getName(),
  };
}

function ensurePlannerSheets_(spreadsheet) {
  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES.guests, ["id", "name", "group"]);
  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES.seats, ["seatNumber", "guestId", "locked"]);
  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES.rules, ["id", "guestAId", "guestBId", "type"]);
  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES.meta, ["key", "value"]);

  const seatsSheet = spreadsheet.getSheetByName(SHEET_NAMES.seats);
  if (seatsSheet.getLastRow() === 1) {
    const rows = [];
    for (var index = 1; index <= TOTAL_SEATS; index += 1) {
      rows.push([index, "", false]);
    }
    seatsSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return;
  }

  const existingSeatNumbers = readDataRows_(seatsSheet).map(function (row) {
    return Number(row[0]);
  });
  const rowsToAppend = [];
  for (var seatNumber = 1; seatNumber <= TOTAL_SEATS; seatNumber += 1) {
    if (!existingSeatNumbers.includes(seatNumber)) {
      rowsToAppend.push([seatNumber, "", false]);
    }
  }

  if (rowsToAppend.length) {
    seatsSheet
      .getRange(seatsSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length)
      .setValues(rowsToAppend);
  }
}

function ensureSheetWithHeaders_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = headers.some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeaders) {
    headerRange.setValues([headers]);
  }
}

function readPlannerState_(spreadsheet) {
  const guestsSheet = spreadsheet.getSheetByName(SHEET_NAMES.guests);
  const seatsSheet = spreadsheet.getSheetByName(SHEET_NAMES.seats);
  const rulesSheet = spreadsheet.getSheetByName(SHEET_NAMES.rules);

  const guests = readDataRows_(guestsSheet).map(function (row) {
    return {
      id: String(row[0] || ""),
      name: String(row[1] || ""),
      group: String(row[2] || ""),
    };
  });

  const seats = readDataRows_(seatsSheet).map(function (row) {
    return {
      seatNumber: Number(row[0]),
      guestId: String(row[1] || ""),
      locked: String(row[2]).toLowerCase() === "true" || row[2] === true,
    };
  });

  const rules = readDataRows_(rulesSheet).map(function (row) {
    return {
      id: String(row[0] || ""),
      guestAId: String(row[1] || ""),
      guestBId: String(row[2] || ""),
      type: String(row[3] || ""),
    };
  });

  return normalizePlannerState_({
    guests: guests,
    seats: seats,
    rules: rules,
  });
}

function writePlannerState_(spreadsheet, plan) {
  writeSheetRows_(
    spreadsheet.getSheetByName(SHEET_NAMES.guests),
    ["id", "name", "group"],
    plan.guests.map(function (guest) {
      return [guest.id, guest.name, guest.group];
    }),
  );

  writeSheetRows_(
    spreadsheet.getSheetByName(SHEET_NAMES.seats),
    ["seatNumber", "guestId", "locked"],
    plan.seats.map(function (seat) {
      return [seat.seatNumber, seat.guestId || "", seat.locked];
    }),
  );

  writeSheetRows_(
    spreadsheet.getSheetByName(SHEET_NAMES.rules),
    ["id", "guestAId", "guestBId", "type"],
    plan.rules.map(function (rule) {
      return [rule.id, rule.guestAId, rule.guestBId, rule.type];
    }),
  );
}

function writeSheetRows_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!rows.length) {
    return;
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function readDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1 || lastColumn === 0) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .getValues()
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "";
      });
    });
}

function readMetaValue_(spreadsheet, key) {
  const metaSheet = spreadsheet.getSheetByName(SHEET_NAMES.meta);
  const values = readDataRows_(metaSheet);
  const match = values.find(function (row) {
    return row[0] === key;
  });
  return match ? String(match[1] || "") : "";
}

function writeMetaValues_(spreadsheet, values) {
  const rows = Object.keys(values).map(function (key) {
    return [key, values[key]];
  });
  writeSheetRows_(spreadsheet.getSheetByName(SHEET_NAMES.meta), ["key", "value"], rows);
}

function normalizePlannerState_(rawState) {
  const guests = Array.isArray(rawState && rawState.guests)
    ? rawState.guests
        .filter(function (guest) {
          return guest && guest.id && guest.name;
        })
        .map(function (guest) {
          return {
            id: String(guest.id),
            name: String(guest.name).trim(),
            group: String(guest.group || "").trim(),
          };
        })
        .filter(function (guest) {
          return guest.name;
        })
    : [];

  const guestIds = guests.reduce(function (set, guest) {
    set[guest.id] = true;
    return set;
  }, {});

  const rawSeats = Array.isArray(rawState && rawState.seats) ? rawState.seats : [];
  const seats = [];
  for (var index = 1; index <= TOTAL_SEATS; index += 1) {
    const matchingSeat = rawSeats.find(function (seat) {
      return Number(seat.seatNumber) === index;
    });
    const guestId = matchingSeat && guestIds[String(matchingSeat.guestId)] ? String(matchingSeat.guestId) : "";

    seats.push({
      seatNumber: index,
      guestId: guestId,
      locked: Boolean(matchingSeat && matchingSeat.locked),
    });
  }

  const rules = Array.isArray(rawState && rawState.rules)
    ? rawState.rules
        .filter(function (rule) {
          return (
            rule &&
            rule.id &&
            guestIds[String(rule.guestAId)] &&
            guestIds[String(rule.guestBId)] &&
            rule.guestAId !== rule.guestBId &&
            (rule.type === "together" || rule.type === "apart")
          );
        })
        .map(function (rule) {
          return {
            id: String(rule.id),
            guestAId: String(rule.guestAId),
            guestBId: String(rule.guestBId),
            type: String(rule.type),
          };
        })
    : [];

  return {
    guests: guests,
    seats: seats,
    rules: rules,
  };
}
