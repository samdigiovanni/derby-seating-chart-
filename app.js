const LONG_SIDE_SEAT_COUNT = 17;
const END_SIDE_SEAT_COUNT = 2;
const TOTAL_SEATS = LONG_SIDE_SEAT_COUNT * 2 + END_SIDE_SEAT_COUNT * 2;
const STORAGE_KEY = "derby-studio-seating-chart";
const GROUP_COLORS = [
  "#D76C50",
  "#CA8A04",
  "#6E8B3D",
  "#4C956C",
  "#4F86C6",
  "#7B6ED6",
  "#B85C8E",
  "#A46C3D",
  "#3F8A8A",
  "#D95D39",
];
const SVG_LAYOUT = {
  width: 2600,
  height: 900,
  tableX: 210,
  tableY: 250,
  tableWidth: 2180,
  tableHeight: 300,
  seatWidth: 118,
  seatHeight: 56,
  columnStep: 128,
};

const seatSummary = document.getElementById("seat-summary");
const selectedSeatSummary = document.getElementById("selected-seat-summary");
const guestSummary = document.getElementById("guest-summary");
const legendSummary = document.getElementById("legend-summary");
const ruleSummary = document.getElementById("rule-summary");
const storageStatus = document.getElementById("storage-status");
const tableMap = document.getElementById("table-map");
const guestList = document.getElementById("guest-list");
const guestForm = document.getElementById("guest-form");
const guestNameInput = document.getElementById("guest-name-input");
const guestGroupInput = document.getElementById("guest-group-input");
const bulkNamesInput = document.getElementById("bulk-names-input");
const addBulkButton = document.getElementById("add-bulk-button");
const groupLegend = document.getElementById("group-legend");
const ruleForm = document.getElementById("rule-form");
const ruleGuestA = document.getElementById("rule-guest-a");
const ruleGuestB = document.getElementById("rule-guest-b");
const ruleType = document.getElementById("rule-type");
const ruleStatus = document.getElementById("rule-status");
const ruleList = document.getElementById("rule-list");
const unseatedDropzone = document.getElementById("unseated-dropzone");
const clearSeatsButton = document.getElementById("clear-seats-button");
const resetAllButton = document.getElementById("reset-all-button");
const undoButton = document.getElementById("undo-button");
const redoButton = document.getElementById("redo-button");
const exportButton = document.getElementById("export-button");
const exportSvgButton = document.getElementById("export-svg-button");
const autoArrangeButton = document.getElementById("auto-arrange-button");
const importFileInput = document.getElementById("import-file-input");
const printButton = document.getElementById("print-button");
const toggleLockButton = document.getElementById("toggle-lock-button");

const defaultState = {
  guests: [],
  seats: Array.from({ length: TOTAL_SEATS }, (_, index) => ({
    seatNumber: index + 1,
    guestId: null,
    locked: false,
  })),
  rules: [],
};

let state = loadState();
let activeGuestEditorId = null;
let selectedSeatNumber = null;
let draggedGuestId = null;
let undoStack = [];
let redoStack = [];
let sharedSaveTimeoutId = null;
let isHydratingSharedState = false;
let hasHydratedSharedState = false;
const isAppsScriptEnvironment =
  typeof google !== "undefined" &&
  typeof google.script !== "undefined" &&
  typeof google.script.run !== "undefined";

function updateViewportFitMode() {
  const shouldUseViewportFit =
    !isAppsScriptEnvironment &&
    window.innerWidth >= 1101 &&
    window.innerHeight >= 860;

  document.body.classList.toggle("viewport-fit", shouldUseViewportFit);
}

function clonePlannerState(sourceState = state) {
  return structuredClone(sourceState);
}

function snapshotHistoryEntry() {
  return {
    state: clonePlannerState(),
    activeGuestEditorId,
    selectedSeatNumber,
  };
}

function restoreHistoryEntry(entry) {
  state = clonePlannerState(entry.state);
  activeGuestEditorId = entry.activeGuestEditorId ?? null;
  selectedSeatNumber = entry.selectedSeatNumber ?? null;
}

function commitStateChange(mutator) {
  const before = snapshotHistoryEntry();
  mutator();
  undoStack.push(before);
  redoStack = [];
  render();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultState);
    }

    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to restore seating chart state.", error);
    return structuredClone(defaultState);
  }
}

function normalizeState(rawState) {
  if (!rawState || !Array.isArray(rawState.guests) || !Array.isArray(rawState.seats)) {
    return structuredClone(defaultState);
  }

  const guests = rawState.guests
    .filter((guest) => guest && guest.id && typeof guest.name === "string")
    .map((guest) => ({
      id: guest.id,
      name: guest.name.trim(),
      group: typeof guest.group === "string" ? guest.group.trim() : "",
    }))
    .filter((guest) => guest.name);

  const guestIds = new Set(guests.map((guest) => guest.id));
  const seats = Array.from({ length: TOTAL_SEATS }, (_, index) => {
    const savedSeat = rawState.seats.find((seat) => seat.seatNumber === index + 1);
    const guestId = savedSeat?.guestId;

    return {
      seatNumber: index + 1,
      guestId: guestIds.has(guestId) ? guestId : null,
      locked: Boolean(savedSeat?.locked),
    };
  });

  const rules = Array.isArray(rawState.rules)
    ? rawState.rules
        .filter(
          (rule) =>
            rule &&
            rule.id &&
            guestIds.has(rule.guestAId) &&
            guestIds.has(rule.guestBId) &&
            rule.guestAId !== rule.guestBId &&
            (rule.type === "together" || rule.type === "apart"),
        )
        .map((rule) => ({
          id: rule.id,
          guestAId: rule.guestAId,
          guestBId: rule.guestBId,
          type: rule.type,
        }))
    : [];

  return { guests, seats, rules };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSharedSave();
}

function createGuest(name, group = "") {
  return {
    id: crypto.randomUUID(),
    name,
    group,
  };
}

function createRule(guestAId, guestBId, type) {
  return {
    id: crypto.randomUUID(),
    guestAId,
    guestBId,
    type,
  };
}

function startEditingGuest(guestId) {
  activeGuestEditorId = guestId;
  render();
}

function stopEditingGuest() {
  activeGuestEditorId = null;
  render();
}

function updateGuest(guestId, name, group) {
  const guest = getGuestById(guestId);
  if (!guest) {
    return;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }

  commitStateChange(() => {
    guest.name = trimmedName;
    guest.group = group.trim();
    activeGuestEditorId = null;
  });
}

function updateStorageStatus(message, tone = "neutral") {
  if (!storageStatus) {
    return;
  }

  storageStatus.textContent = message;
  storageStatus.dataset.tone = tone;
}

function formatSavedTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function runAppsScript(functionName, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [functionName](...args);
  });
}

async function hydrateSharedState() {
  if (!isAppsScriptEnvironment) {
    updateStorageStatus("Saved in this browser only.", "neutral");
    return;
  }

  try {
    isHydratingSharedState = true;
    updateStorageStatus("Loading shared seating plan from Google Sheets...", "neutral");
    const response = await runAppsScript("getSharedPlan");
    state = normalizeState(response.plan ?? response);
    undoStack = [];
    redoStack = [];
    activeGuestEditorId = null;
    hasHydratedSharedState = true;
    render();
    const savedLabel = formatSavedTimestamp(response.savedAt);
    updateStorageStatus(
      savedLabel
        ? `Shared Google Sheet connected. Last saved ${savedLabel}.`
        : "Shared Google Sheet connected.",
      "success",
    );
  } catch (error) {
    console.error("Unable to load the shared seating plan.", error);
    hasHydratedSharedState = false;
    updateStorageStatus("Shared sheet unavailable. Using this browser copy only.", "warning");
    render();
  } finally {
    isHydratingSharedState = false;
  }
}

function scheduleSharedSave() {
  if (!isAppsScriptEnvironment || !hasHydratedSharedState || isHydratingSharedState) {
    return;
  }

  if (sharedSaveTimeoutId) {
    window.clearTimeout(sharedSaveTimeoutId);
  }

  updateStorageStatus("Saving to the shared Google Sheet...", "neutral");
  sharedSaveTimeoutId = window.setTimeout(async () => {
    try {
      const response = await runAppsScript("saveSharedPlan", clonePlannerState());
      const savedLabel = formatSavedTimestamp(response.savedAt);
      updateStorageStatus(
        savedLabel
          ? `Shared Google Sheet synced. Saved ${savedLabel}.`
          : "Shared Google Sheet synced.",
        "success",
      );
    } catch (error) {
      console.error("Unable to save the shared seating plan.", error);
      updateStorageStatus(
        "Could not save to Google Sheets. Your browser copy is still preserved locally.",
        "warning",
      );
    }
  }, 600);
}

function getGuestById(guestId) {
  return state.guests.find((guest) => guest.id === guestId) ?? null;
}

function getSeatByNumber(seatNumber) {
  return state.seats.find((seat) => seat.seatNumber === seatNumber) ?? null;
}

function getAssignedSeatNumber(guestId) {
  return state.seats.find((seat) => seat.guestId === guestId)?.seatNumber ?? null;
}

function getGroups() {
  return [...new Set(state.guests.map((guest) => guest.group).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function getLockedSeatCount() {
  return state.seats.filter((seat) => seat.locked).length;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getGroupColor(group) {
  if (!group) {
    return null;
  }

  return GROUP_COLORS[hashString(group) % GROUP_COLORS.length];
}

function getGuestDisplayStyles(guest) {
  const color = getGroupColor(guest.group);
  if (!color) {
    return "";
  }

  return `background: color-mix(in srgb, ${color} 20%, white); border-color: color-mix(in srgb, ${color} 38%, rgba(94, 71, 44, 0.2));`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getPerimeterSeatOrder() {
  return [
    ...Array.from({ length: LONG_SIDE_SEAT_COUNT }, (_, index) => index + 1),
    18,
    19,
    ...Array.from({ length: LONG_SIDE_SEAT_COUNT }, (_, index) => 20 + index),
    37,
    38,
  ];
}

function areSeatsAdjacent(firstSeatNumber, secondSeatNumber) {
  if (!firstSeatNumber || !secondSeatNumber) {
    return false;
  }
  const order = getPerimeterSeatOrder();
  const firstIndex = order.indexOf(firstSeatNumber);
  const secondIndex = order.indexOf(secondSeatNumber);
  if (firstIndex === -1 || secondIndex === -1) {
    return false;
  }

  const distance = Math.abs(firstIndex - secondIndex);
  return distance === 1 || distance === order.length - 1;
}

function getRuleEvaluation(rule) {
  const guestA = getGuestById(rule.guestAId);
  const guestB = getGuestById(rule.guestBId);
  if (!guestA || !guestB) {
    return { ok: true, state: "inactive", message: "This rule references a removed guest." };
  }

  const seatA = getAssignedSeatNumber(rule.guestAId);
  const seatB = getAssignedSeatNumber(rule.guestBId);
  if (!seatA || !seatB) {
    return {
      ok: true,
      state: "pending",
      message: `${guestA.name} and ${guestB.name} both need seats before this rule can be checked.`,
    };
  }

  const adjacent = areSeatsAdjacent(seatA, seatB);
  if (rule.type === "together") {
    return adjacent
      ? {
          ok: true,
          state: "satisfied",
          message: `${guestA.name} and ${guestB.name} are seated together in seats ${seatA} and ${seatB}.`,
        }
      : {
          ok: false,
          state: "conflict",
          message: `${guestA.name} and ${guestB.name} should be adjacent, but are in seats ${seatA} and ${seatB}.`,
          seatNumbers: [seatA, seatB],
        };
  }

  return adjacent
    ? {
        ok: false,
        state: "conflict",
        message: `${guestA.name} and ${guestB.name} should be kept apart, but are adjacent in seats ${seatA} and ${seatB}.`,
        seatNumbers: [seatA, seatB],
      }
    : {
        ok: true,
        state: "satisfied",
        message: `${guestA.name} and ${guestB.name} are separated in seats ${seatA} and ${seatB}.`,
      };
}

function getRuleEvaluations() {
  return state.rules.map((rule) => ({
    rule,
    evaluation: getRuleEvaluation(rule),
  }));
}

function getConflictedSeatNumbers() {
  const conflictedSeats = new Set();
  getRuleEvaluations().forEach(({ evaluation }) => {
    if (!evaluation.ok && Array.isArray(evaluation.seatNumbers)) {
      evaluation.seatNumbers.forEach((seatNumber) => conflictedSeats.add(seatNumber));
    }
  });
  return conflictedSeats;
}

function populateRuleGuestOptions() {
  const options = state.guests
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((guest) => `<option value="${guest.id}">${escapeXml(guest.name)}</option>`)
    .join("");

  ruleGuestA.innerHTML = `<option value="">Select guest</option>${options}`;
  ruleGuestB.innerHTML = `<option value="">Select guest</option>${options}`;
}

function createGuestEditor(guest) {
  const form = document.createElement("form");
  form.className = "inline-editor";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 60;
  nameInput.value = guest.name;
  nameInput.placeholder = "Guest name";

  const groupInput = document.createElement("input");
  groupInput.type = "text";
  groupInput.maxLength = 40;
  groupInput.value = guest.group;
  groupInput.placeholder = "Group or party";

  const actions = document.createElement("div");
  actions.className = "inline-editor-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => stopEditingGuest());

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";

  actions.append(cancelButton, saveButton);
  form.append(nameInput, groupInput, actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateGuest(guest.id, nameInput.value, groupInput.value);
  });

  queueMicrotask(() => nameInput.focus());
  return form;
}

function render() {
  populateRuleGuestOptions();
  renderTable();
  renderGuestList();
  renderLegend();
  renderRules();
  updateSummaries();
  updateSeatLockControls();
  updateHistoryButtons();
  saveState();
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function initializeApp() {
  render();
  if (isAppsScriptEnvironment) {
    hydrateSharedState();
  } else {
    updateStorageStatus("Saved in this browser only.", "neutral");
  }
}

function renderTable() {
  tableMap.innerHTML = "";
  const conflictedSeats = getConflictedSeatNumbers();

  const tableSurface = document.createElement("div");
  tableSurface.className = "table-surface";
  tableMap.appendChild(tableSurface);

  buildSeatLayout().forEach(({ seatNumber, className, gridColumn, gridRow }) => {
    const seat = getSeatByNumber(seatNumber);
    const guest = seat?.guestId ? getGuestById(seat.guestId) : null;
    const seatElement = document.createElement("div");

    seatElement.className = [
      "seat",
      className,
      guest ? "filled" : "",
      seat?.locked ? "locked" : "",
      selectedSeatNumber === seatNumber ? "selected" : "",
      activeGuestEditorId === guest?.id ? "editing" : "",
      conflictedSeats.has(seatNumber) ? "conflict" : "",
    ]
      .filter(Boolean)
      .join(" ");
    seatElement.dataset.seatNumber = String(seatNumber);
    seatElement.style.gridColumn = gridColumn;
    seatElement.style.gridRow = gridRow;
    seatElement.addEventListener("click", () => {
      selectedSeatNumber = selectedSeatNumber === seatNumber ? null : seatNumber;
      render();
    });

    if (guest?.group) {
      const groupColor = getGroupColor(guest.group);
      seatElement.style.background = `color-mix(in srgb, ${groupColor} 26%, white)`;
      seatElement.style.borderColor = `color-mix(in srgb, ${groupColor} 45%, rgba(141, 75, 40, 0.3))`;
    }

    setupSeatDropTarget(seatElement, seatNumber);

    if (guest) {
      if (activeGuestEditorId === guest.id) {
        seatElement.appendChild(createGuestEditor(guest));
      } else {
        const seatCard = document.createElement("div");
        seatCard.className = "seat-card";

        const guestCard = document.createElement("div");
        guestCard.className = `seat-name ${seat?.locked ? "locked-name" : ""}`.trim();
        guestCard.draggable = !seat?.locked;
        guestCard.textContent = guest.name;
        guestCard.dataset.guestId = guest.id;
        guestCard.title = guest.group ? `${guest.name} - ${guest.group}` : guest.name;
        if (guest.group) {
          guestCard.style.cssText = getGuestDisplayStyles(guest);
        }
        if (!seat?.locked) {
          setupDraggableGuest(guestCard, guest.id);
        }

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "seat-edit-button";
        editButton.textContent = "✎";
        editButton.setAttribute("aria-label", `Edit ${guest.name}`);
        editButton.title = `Edit ${guest.name}`;
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          startEditingGuest(guest.id);
        });

        seatCard.append(guestCard, editButton);
        seatElement.appendChild(seatCard);
      }
    } else {
      const emptyLabel = document.createElement("div");
      emptyLabel.className = "seat-empty";
      emptyLabel.textContent = seat?.locked ? "Reserved" : "Open seat";
      seatElement.appendChild(emptyLabel);
    }

    tableMap.appendChild(seatElement);
  });
}

function buildSeatLayout() {
  const layouts = [];

  for (let index = 0; index < LONG_SIDE_SEAT_COUNT; index += 1) {
    layouts.push({
      seatNumber: 1 + index,
      className: `side-top ${index % 2 === 1 ? "seat-staggered" : ""}`.trim(),
      gridColumn: String(index + 2),
      gridRow: "1",
    });
  }

  layouts.push(
    {
      seatNumber: 18,
      className: "end-right",
      gridColumn: "19",
      gridRow: "2",
    },
    {
      seatNumber: 19,
      className: "end-right",
      gridColumn: "19",
      gridRow: "3",
    },
  );

  for (let index = 0; index < LONG_SIDE_SEAT_COUNT; index += 1) {
    layouts.push({
      seatNumber: 20 + index,
      className: `side-bottom ${index % 2 === 1 ? "seat-staggered" : ""}`.trim(),
      gridColumn: String(18 - index),
      gridRow: "4",
    });
  }

  layouts.push(
    {
      seatNumber: 37,
      className: "end-left",
      gridColumn: "1",
      gridRow: "3",
    },
    {
      seatNumber: 38,
      className: "end-left",
      gridColumn: "1",
      gridRow: "2",
    },
  );

  return layouts;
}

function renderGuestList() {
  guestList.innerHTML = "";

  const unseatedGuests = state.guests.filter((guest) => getAssignedSeatNumber(guest.id) === null);
  if (unseatedGuests.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = state.guests.length
      ? "Every guest is seated. Drag someone back here to unseat them."
      : "Add guest names to start building the seating plan.";
    guestList.appendChild(emptyState);
    return;
  }

  unseatedGuests
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((guest) => {
      if (activeGuestEditorId === guest.id) {
        const editorShell = document.createElement("div");
        editorShell.className = "guest-chip";
        editorShell.appendChild(createGuestEditor(guest));
        guestList.appendChild(editorShell);
        return;
      }

      const guestChip = document.createElement("div");
      guestChip.className = "guest-chip";
      guestChip.draggable = true;
      guestChip.dataset.guestId = guest.id;
      guestChip.style.cssText = getGuestDisplayStyles(guest);
      setupDraggableGuest(guestChip, guest.id);

      const guestText = document.createElement("div");
      guestText.className = "guest-chip-text";

      const guestName = document.createElement("strong");
      guestName.textContent = guest.name;
      guestText.appendChild(guestName);

      if (guest.group) {
        const guestGroupLabel = document.createElement("span");
        guestGroupLabel.className = "guest-group-label";

        const groupDot = document.createElement("span");
        groupDot.className = "group-dot";
        groupDot.style.background = getGroupColor(guest.group);

        const groupName = document.createElement("span");
        groupName.textContent = guest.group;

        guestGroupLabel.append(groupDot, groupName);
        guestText.appendChild(guestGroupLabel);
      }

      const actions = document.createElement("div");
      actions.className = "guest-chip-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", `Edit ${guest.name}`);
      editButton.addEventListener("click", () => startEditingGuest(guest.id));

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${guest.name}`);
      removeButton.addEventListener("click", () => removeGuest(guest.id));

      actions.append(editButton, removeButton);
      guestChip.append(guestText, actions);
      guestList.appendChild(guestChip);
    });
}

function renderLegend() {
  groupLegend.innerHTML = "";
  const groups = getGroups();
  legendSummary.textContent = groups.length
    ? `${groups.length} ${groups.length === 1 ? "group" : "groups"}`
    : "No groups yet";

  if (!groups.length) {
    const emptyLegend = document.createElement("span");
    emptyLegend.className = "panel-meta";
    emptyLegend.textContent = "Add a group name when creating guests to organize parties visually.";
    groupLegend.appendChild(emptyLegend);
    return;
  }

  groups.forEach((group) => {
    const guestCount = state.guests.filter((guest) => guest.group === group).length;
    const legendChip = document.createElement("div");
    legendChip.className = "legend-chip";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = getGroupColor(group);

    const label = document.createElement("span");
    label.textContent = `${group} (${guestCount})`;

    legendChip.append(swatch, label);
    groupLegend.appendChild(legendChip);
  });
}

function renderRules() {
  ruleStatus.innerHTML = "";
  ruleList.innerHTML = "";

  const evaluations = getRuleEvaluations();
  const conflicts = evaluations.filter(({ evaluation }) => !evaluation.ok);
  ruleSummary.textContent = state.rules.length
    ? `${state.rules.length} rules, ${conflicts.length} conflicts`
    : "No rules yet";

  if (!state.rules.length) {
    const note = document.createElement("div");
    note.className = "rule-note";
    note.textContent = "Add rules to keep key pairs together or apart while you arrange the table.";
    ruleStatus.appendChild(note);
    return;
  }

  if (conflicts.length) {
    conflicts.forEach(({ evaluation }) => {
      const note = document.createElement("div");
      note.className = "rule-note conflict";
      note.textContent = evaluation.message;
      ruleStatus.appendChild(note);
    });
  } else {
    const note = document.createElement("div");
    note.className = "rule-note success";
    note.textContent = "All active relationship rules are currently satisfied.";
    ruleStatus.appendChild(note);
  }

  evaluations.forEach(({ rule, evaluation }) => {
    const guestA = getGuestById(rule.guestAId);
    const guestB = getGuestById(rule.guestBId);
    if (!guestA || !guestB) {
      return;
    }

    const chip = document.createElement("div");
    chip.className = `rule-chip ${evaluation.ok ? "" : "conflict"}`.trim();

    const text = document.createElement("div");
    text.className = "rule-text";

    const title = document.createElement("div");
    title.className = "rule-title";
    title.textContent =
      rule.type === "together"
        ? `${guestA.name} + ${guestB.name}`
        : `${guestA.name} x ${guestB.name}`;

    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.textContent =
      rule.type === "together"
        ? `Seat together. ${evaluation.message}`
        : `Keep apart. ${evaluation.message}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeRule(rule.id));

    text.append(title, meta);
    chip.append(text, removeButton);
    ruleList.appendChild(chip);
  });
}

function updateSummaries() {
  const seatedCount = state.seats.filter((seat) => seat.guestId !== null).length;
  const lockedCount = getLockedSeatCount();
  seatSummary.textContent = `${seatedCount} of ${TOTAL_SEATS} seats filled, ${lockedCount} locked`;

  const unseatedCount = state.guests.filter((guest) => getAssignedSeatNumber(guest.id) === null).length;
  guestSummary.textContent = `${state.guests.length} total guests, ${unseatedCount} unseated`;
}

function updateSeatLockControls() {
  if (!toggleLockButton || !selectedSeatSummary) {
    return;
  }

  const seat = selectedSeatNumber ? getSeatByNumber(selectedSeatNumber) : null;
  if (!seat) {
    selectedSeatSummary.textContent = "Select a seat to manage its lock.";
    toggleLockButton.textContent = "Lock Seat";
    toggleLockButton.disabled = true;
    return;
  }

  selectedSeatSummary.textContent = `Seat ${selectedSeatNumber} selected. ${
    seat.locked ? "Locked." : "Unlocked."
  }`;
  toggleLockButton.textContent = seat.locked ? "Unlock Seat" : "Lock Seat";
  toggleLockButton.disabled = false;
}

function setupDraggableGuest(element, guestId) {
  element.addEventListener("dragstart", (event) => {
    draggedGuestId = guestId;
    event.dataTransfer.setData("text/plain", guestId);
    event.dataTransfer.effectAllowed = "move";
    element.classList.add("dragging");
  });

  element.addEventListener("dragend", () => {
    draggedGuestId = null;
    element.classList.remove("dragging");
    clearDropHighlights();
  });
}

function setupSeatDropTarget(element, seatNumber) {
  element.addEventListener("dragover", (event) => {
    const guestId = draggedGuestId;
    if (!canAssignGuestToSeat(guestId, seatNumber)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    element.classList.add("drop-target");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("drop-target");
  });

  element.addEventListener("drop", (event) => {
    const guestId = draggedGuestId ?? event.dataTransfer.getData("text/plain");
    if (!canAssignGuestToSeat(guestId, seatNumber)) {
      return;
    }
    event.preventDefault();
    element.classList.remove("drop-target");
    assignGuestToSeat(guestId, seatNumber);
  });
}

function clearDropHighlights() {
  document.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
}

function canAssignGuestToSeat(guestId, targetSeatNumber) {
  const guest = getGuestById(guestId);
  const targetSeat = getSeatByNumber(targetSeatNumber);
  if (!guest || !targetSeat || targetSeat.locked) {
    return false;
  }

  const currentSeatNumber = getAssignedSeatNumber(guestId);
  const currentSeat = currentSeatNumber ? getSeatByNumber(currentSeatNumber) : null;
  if (currentSeat?.locked) {
    return false;
  }

  if (targetSeat.guestId && targetSeat.guestId !== guestId) {
    const displacedSeat = currentSeatNumber ? getSeatByNumber(currentSeatNumber) : null;
    if (!displacedSeat || displacedSeat.locked) {
      return false;
    }
  }

  return true;
}

function assignGuestToSeat(guestId, targetSeatNumber) {
  if (!canAssignGuestToSeat(guestId, targetSeatNumber)) {
    return;
  }

  commitStateChange(() => {
    const currentSeatNumber = getAssignedSeatNumber(guestId);
    const targetSeat = getSeatByNumber(targetSeatNumber);

    if (currentSeatNumber) {
      const currentSeat = getSeatByNumber(currentSeatNumber);
      if (currentSeat) {
        currentSeat.guestId = null;
      }
    }

    if (targetSeat.guestId && targetSeat.guestId !== guestId) {
      const displacedSeat = currentSeatNumber ? getSeatByNumber(currentSeatNumber) : null;
      if (displacedSeat) {
        displacedSeat.guestId = targetSeat.guestId;
      }
    }

    targetSeat.guestId = guestId;
  });
}

function unseatGuest(guestId) {
  const seatNumber = getAssignedSeatNumber(guestId);
  if (!seatNumber) {
    return;
  }

  const seat = getSeatByNumber(seatNumber);
  if (!seat || seat.locked) {
    return;
  }

  commitStateChange(() => {
    seat.guestId = null;
  });
}

function toggleSeatLock(seatNumber) {
  const seat = getSeatByNumber(seatNumber);
  if (!seat) {
    return;
  }

  commitStateChange(() => {
    seat.locked = !seat.locked;
  });
}

function removeGuest(guestId) {
  commitStateChange(() => {
    if (activeGuestEditorId === guestId) {
      activeGuestEditorId = null;
    }
    state.guests = state.guests.filter((guest) => guest.id !== guestId);
    state.seats.forEach((seat) => {
      if (seat.guestId === guestId) {
        seat.guestId = null;
        seat.locked = false;
      }
    });
    state.rules = state.rules.filter((rule) => rule.guestAId !== guestId && rule.guestBId !== guestId);
  });
}

function addGuest(name, group = "") {
  const trimmedName = name.trim();
  const trimmedGroup = group.trim();
  if (!trimmedName) {
    return;
  }

  commitStateChange(() => {
    state.guests.push(createGuest(trimmedName, trimmedGroup));
  });
}

function parseBulkLine(line) {
  const [namePart, ...groupParts] = line.split(",");
  return {
    name: (namePart ?? "").trim(),
    group: groupParts.join(",").trim(),
  };
}

function addBulkGuests(rawText) {
  const entries = rawText
    .split("\n")
    .map((line) => parseBulkLine(line))
    .filter((entry) => entry.name);

  if (!entries.length) {
    return;
  }

  commitStateChange(() => {
    entries.forEach((entry) => state.guests.push(createGuest(entry.name, entry.group)));
  });
}

function addRule(guestAId, guestBId, type) {
  if (!guestAId || !guestBId || guestAId === guestBId) {
    return;
  }

  const duplicate = state.rules.some(
    (rule) =>
      rule.type === type &&
      ((rule.guestAId === guestAId && rule.guestBId === guestBId) ||
        (rule.guestAId === guestBId && rule.guestBId === guestAId)),
  );
  if (duplicate) {
    return;
  }

  commitStateChange(() => {
    state.rules.push(createRule(guestAId, guestBId, type));
  });
}

function removeRule(ruleId) {
  commitStateChange(() => {
    state.rules = state.rules.filter((rule) => rule.id !== ruleId);
  });
}

function exportPlan() {
  const payload = {
    exportedAt: new Date().toISOString(),
    totalSeats: TOTAL_SEATS,
    guests: state.guests,
    seats: state.seats,
    rules: state.rules,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `derby-seating-plan-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildSvgSeatLayout() {
  const layouts = [];
  for (let index = 0; index < LONG_SIDE_SEAT_COUNT; index += 1) {
    const x = SVG_LAYOUT.tableX + 2 + index * SVG_LAYOUT.columnStep;
    layouts.push({
      seatNumber: 1 + index,
      x,
      y: index % 2 === 1 ? 148 : 166,
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    });
  }

  layouts.push(
    {
      seatNumber: 18,
      x: SVG_LAYOUT.tableX + SVG_LAYOUT.tableWidth + 84,
      y: SVG_LAYOUT.tableY + 40,
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    },
    {
      seatNumber: 19,
      x: SVG_LAYOUT.tableX + SVG_LAYOUT.tableWidth + 84,
      y: SVG_LAYOUT.tableY + SVG_LAYOUT.tableHeight - 96,
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    },
  );

  for (let index = 0; index < LONG_SIDE_SEAT_COUNT; index += 1) {
    const x = SVG_LAYOUT.tableX + 2 + (LONG_SIDE_SEAT_COUNT - 1 - index) * SVG_LAYOUT.columnStep;
    layouts.push({
      seatNumber: 20 + index,
      x,
      y:
        SVG_LAYOUT.tableY +
        SVG_LAYOUT.tableHeight +
        (index % 2 === 1 ? 98 : 80),
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    });
  }

  layouts.push(
    {
      seatNumber: 37,
      x: 84,
      y: SVG_LAYOUT.tableY + SVG_LAYOUT.tableHeight - 96,
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    },
    {
      seatNumber: 38,
      x: 84,
      y: SVG_LAYOUT.tableY + 40,
      width: SVG_LAYOUT.seatWidth,
      height: SVG_LAYOUT.seatHeight,
    },
  );

  return layouts.sort((a, b) => a.seatNumber - b.seatNumber);
}

function buildSeatingSvg() {
  const conflictedSeats = getConflictedSeatNumbers();
  const seatNodes = buildSvgSeatLayout()
    .map((layout) => {
      const seat = getSeatByNumber(layout.seatNumber);
      const guest = seat?.guestId ? getGuestById(seat.guestId) : null;
      const groupColor = guest?.group ? getGroupColor(guest.group) : null;
      const seatFill = groupColor ? `${groupColor}33` : "#fcf4ea";
      const seatStroke = conflictedSeats.has(layout.seatNumber)
        ? "#bd553a"
        : groupColor || "#d6c8b9";
      const guestText = guest ? escapeXml(guest.name) : "Open seat";
      const groupText = guest?.group ? escapeXml(guest.group) : seat?.locked ? "Locked" : "";
      const lockText = seat?.locked ? "🔒" : "";

      return `
  <g>
    <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" rx="18" fill="${seatFill}" stroke="${seatStroke}" stroke-width="2" />
    <text x="${layout.x + 12}" y="${layout.y + 18}" font-size="11" font-family="IBM Plex Sans, Arial, sans-serif" fill="#7b6b5b">Seat ${layout.seatNumber}</text>
    <text x="${layout.x + layout.width / 2}" y="${layout.y + layout.height / 2 + 4}" text-anchor="middle" font-size="15" font-weight="600" font-family="IBM Plex Sans, Arial, sans-serif" fill="#2c241d">${guestText}</text>
    <text x="${layout.x + layout.width / 2}" y="${layout.y + layout.height - 10}" text-anchor="middle" font-size="11" font-family="IBM Plex Sans, Arial, sans-serif" fill="#736657">${groupText}</text>
    <text x="${layout.x + layout.width - 18}" y="${layout.y + 18}" text-anchor="middle" font-size="13" font-family="IBM Plex Sans, Arial, sans-serif">${lockText}</text>
  </g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_LAYOUT.width}" height="${SVG_LAYOUT.height}" viewBox="0 0 ${SVG_LAYOUT.width} ${SVG_LAYOUT.height}">
  <rect width="100%" height="100%" fill="#f4efe6" />
  <text x="60" y="62" font-size="34" font-weight="700" font-family="Fraunces, Georgia, serif" fill="#2c241d">Derby Studio Seating Chart</text>
  <text x="60" y="92" font-size="16" font-family="IBM Plex Sans, Arial, sans-serif" fill="#736657">${escapeXml(new Date().toLocaleDateString())}</text>
  <rect x="${SVG_LAYOUT.tableX}" y="${SVG_LAYOUT.tableY}" width="${SVG_LAYOUT.tableWidth}" height="${SVG_LAYOUT.tableHeight}" rx="44" fill="#6a4529" />
  <rect x="${SVG_LAYOUT.tableX + 18}" y="${SVG_LAYOUT.tableY + 18}" width="${SVG_LAYOUT.tableWidth - 36}" height="${SVG_LAYOUT.tableHeight - 36}" rx="30" fill="none" stroke="rgba(255,248,239,0.2)" />
  ${seatNodes}
</svg>`;
}

function exportSvg() {
  const svg = buildSeatingSvg();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `derby-seating-chart-${dateStamp}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function autoArrangeByGroup() {
  const unlockedSeats = getPerimeterSeatOrder().filter((seatNumber) => {
    const seat = getSeatByNumber(seatNumber);
    return seat && !seat.locked;
  });

  const movableGuests = [];
  state.seats.forEach((seat) => {
    if (seat.locked || !seat.guestId) {
      return;
    }

    const guest = getGuestById(seat.guestId);
    if (guest) {
      movableGuests.push(guest);
      seat.guestId = null;
    }
  });

  state.guests.forEach((guest) => {
    if (getAssignedSeatNumber(guest.id) === null) {
      movableGuests.push(guest);
    }
  });

  const uniqueGuests = [...new Map(movableGuests.map((guest) => [guest.id, guest])).values()];
  const groupedGuests = new Map();

  uniqueGuests.forEach((guest) => {
    const key = guest.group || "Ungrouped";
    if (!groupedGuests.has(key)) {
      groupedGuests.set(key, []);
    }
    groupedGuests.get(key).push(guest);
  });

  const orderedGuests = [...groupedGuests.entries()]
    .sort((a, b) => {
      if (b[1].length !== a[1].length) {
        return b[1].length - a[1].length;
      }
      return a[0].localeCompare(b[0]);
    })
    .flatMap(([, guests]) => guests.sort((a, b) => a.name.localeCompare(b.name)));

  commitStateChange(() => {
    unlockedSeats.forEach((seatNumber, index) => {
      const seat = getSeatByNumber(seatNumber);
      seat.guestId = orderedGuests[index]?.id ?? null;
    });
  });
}

function importPlan(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      commitStateChange(() => {
        state = normalizeState(JSON.parse(String(reader.result)));
        activeGuestEditorId = null;
      });
    } catch (error) {
      alert("That file could not be imported. Please choose a valid seating plan JSON file.");
    }
  });

  reader.readAsText(file);
}

guestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addGuest(guestNameInput.value, guestGroupInput.value);
  guestNameInput.value = "";
  guestGroupInput.value = "";
  guestNameInput.focus();
});

ruleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addRule(ruleGuestA.value, ruleGuestB.value, ruleType.value);
  ruleGuestA.value = "";
  ruleGuestB.value = "";
});

addBulkButton.addEventListener("click", () => {
  addBulkGuests(bulkNamesInput.value);
  bulkNamesInput.value = "";
  bulkNamesInput.focus();
});

unseatedDropzone.addEventListener("dragover", (event) => {
  const guestId = draggedGuestId;
  const currentSeatNumber = getAssignedSeatNumber(guestId);
  const currentSeat = currentSeatNumber ? getSeatByNumber(currentSeatNumber) : null;
  if (currentSeat?.locked) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  unseatedDropzone.classList.add("drop-target");
});

unseatedDropzone.addEventListener("dragleave", () => {
  unseatedDropzone.classList.remove("drop-target");
});

unseatedDropzone.addEventListener("drop", (event) => {
  const guestId = draggedGuestId ?? event.dataTransfer.getData("text/plain");
  const currentSeatNumber = getAssignedSeatNumber(guestId);
  const currentSeat = currentSeatNumber ? getSeatByNumber(currentSeatNumber) : null;
  if (currentSeat?.locked) {
    return;
  }

  event.preventDefault();
  unseatedDropzone.classList.remove("drop-target");
  unseatGuest(guestId);
});

clearSeatsButton.addEventListener("click", () => {
  commitStateChange(() => {
    state.seats.forEach((seat) => {
      if (!seat.locked) {
        seat.guestId = null;
      }
    });
  });
});

resetAllButton.addEventListener("click", () => {
  commitStateChange(() => {
    state = structuredClone(defaultState);
    activeGuestEditorId = null;
  });
});

undoButton.addEventListener("click", () => {
  const previous = undoStack.pop();
  if (!previous) {
    return;
  }

  redoStack.push(snapshotHistoryEntry());
  restoreHistoryEntry(previous);
  render();
});

redoButton.addEventListener("click", () => {
  const next = redoStack.pop();
  if (!next) {
    return;
  }

  undoStack.push(snapshotHistoryEntry());
  restoreHistoryEntry(next);
  render();
});

exportButton.addEventListener("click", exportPlan);
exportSvgButton.addEventListener("click", exportSvg);
autoArrangeButton.addEventListener("click", autoArrangeByGroup);

importFileInput.addEventListener("change", (event) => {
  const [file] = event.target.files ?? [];
  if (file) {
    importPlan(file);
  }
  importFileInput.value = "";
});

printButton.addEventListener("click", () => {
  window.print();
});

toggleLockButton?.addEventListener("click", () => {
  if (selectedSeatNumber) {
    toggleSeatLock(selectedSeatNumber);
  }
});

window.addEventListener("resize", updateViewportFitMode);

updateViewportFitMode();
initializeApp();
