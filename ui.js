/* =========================================================================
   HARVEST SPIN - UI (DOM, animation, buttons, admin panel, saving)
   =========================================================================
   All game decisions come from engine.js. This file only:
     - reads/writes localStorage,
     - draws the current state,
     - animates the reels to symbols the engine already chose,
     - wires up buttons and the hidden admin panel.
   Visual styling lives in style.css (this file only toggles classes).
   ========================================================================= */

(function () {
  "use strict";

  const CONFIG = HARVEST_CONFIG;
  const E = HarvestEngine;
  const STORAGE_KEY = "harvestSpin.state.v1";
  const CUR = CONFIG.currency || "RM";

  let state = null;
  let spinning = false;
  let configOk = true;
  let storageOk = true;
  let simRunning = false;

  // auto-backup to a file on disk (Chrome / Edge only)
  const canAutoBackup = typeof window.showSaveFilePicker === "function";
  let backupHandle = null;
  let backupBusy = false;
  let backupDirty = false;
  let backupText = "";

  // Google Sheets sync. URL + secret are kept in the browser only (never in git, never in backups).
  const SYNC_KEY = "harvestSpin.sync.v1";
  const sync = { url: "", token: "", lastTs: null };   // lastTs = timestamp of the last spin the sheet has
  let syncBusy = false;
  let syncText = "";
  let syncEls = null;

  // admin PIN
  let pinFails = 0;
  let pinLockedUntil = 0;

  const $ = (id) => document.getElementById(id);
  const settings = () => E.resolveSettings(CONFIG, state.overrides);
  const emojiOf = (id) => (CONFIG.symbols.find((s) => s.id === id) || {}).emoji || "?";
  const fmtRM = (n) => CUR + " " + (Math.round(n * 100) / 100).toFixed(2);
  const fmtPct = (p) => (p * 100).toFixed(p > 0 && p < 0.01 ? 2 : 1) + "%";
  const fmtInt = (n) => Number(n).toLocaleString();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes()); };

  /** Tiny element builder. Text is always inserted as text (never HTML). */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v === false || v === null || v === undefined) return;
      if (k === "class") el.className = v;
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (let i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach((c) => { if (c !== null && c !== undefined && c !== false) el.append(c); });
    }
    return el;
  }

  // =======================================================================
  // SAVING (localStorage)
  // =======================================================================
  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOk = false;
    }
    if (raw) {
      let parsed = null;
      try { parsed = E.normalizeState(JSON.parse(raw)); } catch (e) { parsed = null; }
      if (parsed) return parsed;
      // Unreadable data: keep a copy so nothing is silently lost, then start fresh.
      try { localStorage.setItem(STORAGE_KEY + ".corrupt." + Date.now(), raw); } catch (e) { /* ignore */ }
      alert("The saved game data could not be read, so the game has started fresh.\nA backup copy was kept in the browser storage.");
    }
    return E.createInitialState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      storageOk = false;
    }
    $("storage-warning").hidden = storageOk;
    queueBackup();
  }

  // =======================================================================
  // BACKUPS (so a cleared browser doesn't lose the event)
  // =======================================================================
  function downloadBlob(blob, name) {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** Full backup (everything, including the log and admin settings) as a JSON file. */
  function downloadBackup() {
    downloadBlob(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }), "harvest-spin-backup-" + stamp() + ".json");
  }

  function renderBackupStatus() {
    const status = $("backup-status");
    const btn = $("backup-btn");
    if (!canAutoBackup) {
      status.textContent = "Auto-backup needs Chrome or Edge.";
      btn.textContent = "Download backup";
    } else if (!backupHandle) {
      status.textContent = "\u26A0\uFE0F No backup file set \u2014 data lives only in this browser.";
      btn.textContent = "Set up auto-backup";
    } else {
      status.textContent = backupText;
      btn.textContent = "Change backup file";
    }
  }

  async function chooseBackupFile() {
    if (!canAutoBackup) { downloadBackup(); return; }
    try {
      backupHandle = await window.showSaveFilePicker({
        suggestedName: "harvest-spin-backup.json",
        types: [{ description: "Harvest Spin backup", accept: { "application/json": [".json"] } }],
      });
      backupText = "Backup file chosen.";
      queueBackup();
    } catch (e) {
      if (e && e.name !== "AbortError") alert("Couldn't set up the backup file: " + e.message);
    }
    renderBackupStatus();
  }

  /** Write the state to the backup file after every save (writes are queued so they never overlap). */
  function queueBackup() {
    if (!backupHandle) return;
    backupDirty = true;
    if (backupBusy) return;
    backupBusy = true;
    (async () => {
      while (backupDirty) {
        backupDirty = false;
        try {
          const w = await backupHandle.createWritable();
          await w.write(JSON.stringify(state, null, 1));
          await w.close();
          const d = new Date();
          backupText = "Backup saved " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
        } catch (e) {
          backupText = "\u26A0\uFE0F Backup FAILED \u2014 click \"Change backup file\".";
        }
        renderBackupStatus();
      }
      backupBusy = false;
    })();
  }

  function restoreFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = E.normalizeState(JSON.parse(reader.result), true); } catch (e) { parsed = null; }
      if (!parsed || E.validateSettings(E.resolveSettings(CONFIG, parsed.overrides)).length) {
        alert("That file isn't a valid Harvest Spin backup, so nothing was changed.");
        return;
      }
      if (!confirm("Replace the current game data (" + state.totalSpins + " spins, " + state.playerCount + " players) with the backup (" +
        parsed.totalSpins + " spins, " + parsed.playerCount + " players)?")) return;
      state = parsed;
      saveState();
      showLastResult();
      renderMain();
      buildAdmin();
      refreshAdmin();
      setMsg("Backup restored.", false);
    };
    reader.readAsText(file);
  }

  // =======================================================================
  // GOOGLE SHEETS SYNC
  // =======================================================================
  function loadSync() {
    try {
      const r = JSON.parse(localStorage.getItem(SYNC_KEY));
      if (r && typeof r === "object") { sync.url = String(r.url || ""); sync.token = String(r.token || ""); sync.lastTs = r.lastTs || null; }
    } catch (e) { /* no saved sync settings */ }
  }

  function saveSync() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* ignore */ }
  }

  /** Spins the sheet doesn't have yet: everything after the last one we sent (all of them if that one isn't in the log). */
  function syncPending() {
    const i = sync.lastTs ? state.log.findIndex((e) => e.timestamp === sync.lastTs) : -1;
    return state.log.slice(i + 1);
  }

  function renderSyncStatus() {
    const el = $("sync-status");
    el.hidden = !sync.url;
    el.textContent = syncText;
    if (syncEls) syncEls.status.textContent = syncText || (sync.url ? "" : "Not set up.");
  }

  /**
   * POST to the Apps Script web app. First try a normal request so we can read the answer ("confirmed").
   * If the browser won't let us read it, send it once more as an opaque request ("sent", unconfirmed).
   * Network failures throw, so the caller keeps the spins queued.
   */
  async function postToSheet(payload) {
    const body = JSON.stringify(payload);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      try {
        const res = await fetch(sync.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, signal: ctl.signal });
        const data = await res.json();
        return data && data.ok ? { ok: true, confirmed: true, data } : { ok: false, error: (data && data.error) || "unknown error" };
      } catch (e) {
        if (ctl.signal.aborted) throw e;
        await fetch(sync.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, signal: ctl.signal });
        return { ok: true, confirmed: false };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Send whatever the sheet is missing. Safe to call any time; the sheet ignores duplicates. */
  async function syncNow(all) {
    if (!sync.url || syncBusy) return;
    const pending = all ? state.log.slice() : syncPending();
    if (!pending.length) { syncText = "Sheet: up to date (" + state.log.length + " spins)"; renderSyncStatus(); return; }
    syncBusy = true;
    let again = false;
    try {
      const r = await postToSheet({ token: sync.token, header: E.LOG_COLUMNS, rows: pending.map(E.logRow) });
      if (r.ok) {
        sync.lastTs = pending[pending.length - 1].timestamp;
        saveSync();
        syncText = r.confirmed ? "Sheet: " + state.log.length + " spins saved \u2714" : "Sheet: sent (can't confirm \u2014 check the sheet)";
        again = syncPending().length > 0;   // spins made while we were sending
      } else {
        syncText = "\u26A0\uFE0F Sheet rejected the data: " + r.error;
      }
    } catch (e) {
      syncText = "\u26A0\uFE0F Sheet offline \u2014 " + pending.length + " spin(s) waiting; will retry";
    }
    syncBusy = false;
    renderSyncStatus();
    if (again) syncNow();
  }

  async function syncTest() {
    if (!sync.url) { syncEls.status.textContent = "Enter the web app URL first."; return; }
    syncEls.status.textContent = "Testing...";
    try {
      const r = await postToSheet({ token: sync.token, test: true });
      syncEls.status.textContent = !r.ok ? "\u26A0\uFE0F Rejected: " + r.error
        : r.confirmed ? "\u2714 Connected. A row was added to the 'Connection test' tab."
        : "Request sent, but this browser can't read the answer. Check that a row appeared in the 'Connection test' tab.";
    } catch (e) {
      syncEls.status.textContent = "\u26A0\uFE0F Couldn't reach it (offline, or the URL is wrong).";
    }
  }

  function buildSync() {
    const url = h("input", { type: "text", placeholder: "https://script.google.com/macros/s/.../exec", size: "60", autocomplete: "off" });
    const token = h("input", { type: "password", placeholder: "same secret as in the script", autocomplete: "off" });
    const status = h("p", { role: "status" });
    url.value = sync.url;
    token.value = sync.token;
    const save = h("button", { type: "button" }, "Save");
    save.addEventListener("click", () => {
      sync.url = url.value.trim();
      sync.token = token.value;
      sync.lastTs = null;            // new destination: send everything again
      saveSync();
      syncText = "";
      renderSyncStatus();
      status.textContent = sync.url ? "Saved. Sending all spins so far..." : "Sync turned off.";
      syncNow(true);
    });
    syncEls = { status };
    $("admin-sync-body").replaceChildren(
      h("p", {}, "Every spin is copied to your Google Sheet. If the internet drops, spins queue up and are sent when it's back."),
      h("p", {}, h("label", {}, "Web app URL: ", url)),
      h("p", {}, h("label", {}, "Secret token: ", token)),
      h("p", {}, save, " ", h("button", { type: "button", onclick: syncTest }, "Send test row"), " ",
        h("button", { type: "button", onclick: () => { syncText = ""; syncNow(true); status.textContent = "Re-sending everything (the sheet skips spins it already has)..."; } }, "Resend all spins")),
      status,
      h("p", { class: "admin-note" }, "The URL and token are saved in this browser only. They are not part of the game data, backups or the repository."));
    renderSyncStatus();
  }

  // =======================================================================
  // ADMIN PIN
  // =======================================================================
  function requestAdmin() {
    if (!configOk || isAdminOpen()) return;
    if (!CONFIG.adminPin) { openAdmin(); return; }
    $("pin-overlay").hidden = false;
    $("pin-input").value = "";
    $("pin-msg").textContent = "";
    $("pin-input").focus();
  }

  function closePin() {
    $("pin-overlay").hidden = true;
  }

  function onPinSubmit(ev) {
    ev.preventDefault();
    const wait = Math.ceil((pinLockedUntil - Date.now()) / 1000);
    if (wait > 0) { $("pin-msg").textContent = "Too many wrong tries. Wait " + wait + "s."; return; }
    if (E.pinOk(CONFIG, $("pin-input").value)) {
      pinFails = 0;
      closePin();
      openAdmin();
      return;
    }
    pinFails += 1;
    $("pin-input").value = "";
    if (pinFails >= 5) { pinFails = 0; pinLockedUntil = Date.now() + 30000; $("pin-msg").textContent = "Too many wrong tries. Locked for 30s."; }
    else $("pin-msg").textContent = "Wrong PIN.";
  }

  // =======================================================================
  // MAIN SCREEN
  // =======================================================================
  function grandRuleText(s) {
    return "Grand prize chance grows every spin after spin " + s.grand.rampStartSpin +
      " — guaranteed by spin " + s.grand.guaranteedBySpin + "!";
  }

  function renderMain() {
    const s = settings();

    // launch bonus banner
    const lb = E.launchBonusStatus(state, s);
    const banner = $("launch-banner");
    banner.hidden = !lb.active;
    banner.textContent = "🎉 LAUNCH BONUS: " + lb.spinsLeft + " boosted spin" + (lb.spinsLeft === 1 ? "" : "s") + " left!";

    // harvest meter
    const m = E.harvestMeter(state, s);
    $("meter").style.setProperty("--fill", (m.fill * 100).toFixed(1) + "%");
    $("meter").classList.toggle("is-ramping", m.active);
    $("meter").classList.toggle("is-claimed", !m.available);
    $("meter-text").textContent = !m.available
      ? "Grand prize claimed!"
      : m.active
        ? "FULL — odds are rising!"
        : Math.min(state.totalSpins, m.rampStartSpin) + " / " + m.rampStartSpin + " spins";
    $("meter-rule").textContent = m.available ? grandRuleText(s) : "";

    // player + buttons
    const p = state.currentPlayer;
    $("player-number").textContent = p ? p.number : "-";
    $("spins-left").textContent = p ? p.spinsLeft : 0;
    $("new-player-btn").disabled = spinning;
    $("spin-btn").disabled = spinning || !E.canSpin(state);
    // operator warning: the thank-you gift is what keeps nobody empty-handed
    const thanksTier = s.tiers.find((t) => t.remainder);
    const thanksLeft = thanksTier ? E.stockOf(state, s, thanksTier.id) : Infinity;
    const warn = $("stock-warning");
    warn.hidden = !(thanksLeft <= (CONFIG.lowStockWarning || 10));
    warn.textContent = thanksLeft === 0
      ? "\u26A0\uFE0F OUT of " + thanksTier.prizeName + "! Restock in the Admin panel."
      : "\u26A0\uFE0F Only " + thanksLeft + " \"" + (thanksTier || {}).prizeName + "\" left.";

    $("spin-hint").textContent = spinning ? "Spinning..."
      : !p ? 'Press "New Player" to begin.'
      : p.spinsLeft === 0 ? 'No spins left — press "New Player" for the next player.'
      : "";
  }

  function setReels(symbolIds) {
    document.querySelectorAll("#reels .reel").forEach((reel, i) => {
      reel.querySelector(".symbol").textContent = symbolIds ? emojiOf(symbolIds[i]) : "?";
      reel.classList.remove("is-spinning", "is-stopped");
    });
  }

  function showResult(r) {
    const box = $("result");
    box.hidden = !r;
    if (!r) return;
    box.classList.toggle("is-win", r.isWin);
    box.classList.toggle("is-none", !r.isWin);
    if (r.isWin) {
      $("result-title").textContent = r.tierName;
      $("result-body").textContent = "You won: " + r.prizeName + (r.isGrand ? " 🏆" : "");
    } else {
      // only happens if the thank-you gift has run out of stock
      $("result-title").textContent = "Thanks for playing!";
      $("result-body").textContent = "We've run out of gifts \u2014 please see the volunteer.";
    }
  }

  /** Show the last spin (after a refresh, or after restoring a backup). */
  function showLastResult() {
    if (state.lastResult) {
      setReels(state.lastResult.symbols);
      showResult(state.lastResult);
    } else {
      setReels(null);
      showResult(null);
    }
  }

  // =======================================================================
  // SPINNING
  // =======================================================================
  /** Spin all reels, then stop them one by one, left to right, on the chosen symbols. */
  function animateReels(finalIds, onDone) {
    const reels = [].slice.call(document.querySelectorAll("#reels .reel"));
    const stops = CONFIG.animation.reelStopTimesMs;
    const stopped = [false, false, false];
    reels.forEach((r) => { r.classList.remove("is-stopped"); r.classList.add("is-spinning"); });

    const flicker = setInterval(() => {
      reels.forEach((r, i) => {
        if (!stopped[i]) r.querySelector(".symbol").textContent = CONFIG.symbols[Math.floor(Math.random() * CONFIG.symbols.length)].emoji;
      });
    }, CONFIG.animation.symbolSwapMs);

    reels.forEach((reel, i) => {
      setTimeout(() => {
        stopped[i] = true;
        reel.querySelector(".symbol").textContent = emojiOf(finalIds[i]);
        reel.classList.remove("is-spinning");
        reel.classList.add("is-stopped");
        if (i === reels.length - 1) {
          clearInterval(flicker);
          onDone();
        }
      }, stops[i]);
    });
  }

  function onSpin() {
    if (spinning || !configOk || !E.canSpin(state)) return;
    spinning = true;
    showResult(null);

    // Outcome first: decide, record and save BEFORE any animation,
    // so refreshing the page mid-spin can never be used to re-roll.
    const result = E.resolveSpin(state, CONFIG, Math.random);
    E.commitSpin(state, result);
    saveState();
    syncNow();
    renderMain();

    animateReels(result.symbols, () => {
      spinning = false;
      showResult(result);
      renderMain();
      refreshAdmin();
    });
  }

  function onNewPlayer() {
    if (spinning) return;
    const p = state.currentPlayer;
    if (p && p.spinsLeft > 0 &&
        !confirm("Player " + p.number + " still has " + p.spinsLeft + " spin(s) left.\nStart a new player anyway?")) return;
    E.startNewPlayer(state, settings());
    saveState();
    setReels(null);
    showResult(null);
    renderMain();
    refreshAdmin();
  }

  // =======================================================================
  // CSV EXPORT
  // =======================================================================
  function exportCsv() {
    // BOM so Excel reads the emoji as UTF-8
    downloadBlob(new Blob(["\uFEFF" + E.logToCsv(state.log)], { type: "text/csv;charset=utf-8" }), "harvest-spin-log-" + stamp() + ".csv");
  }

  // =======================================================================
  // ADMIN PANEL
  // =======================================================================
  let adminFields = [];     // {desc, input} for every editable setting
  let budgetEls = null;
  let simEls = null;

  const isAdminOpen = () => !$("admin").hidden;

  function openAdmin() {
    if (!configOk) return;
    $("admin").hidden = false;
    buildAdmin();
    refreshAdmin();
  }

  function closeAdmin() {
    $("admin").hidden = true;
    try { if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  function setMsg(text, isError) {
    const el = $("admin-settings-msg");
    el.textContent = text;
    el.className = isError ? "field-error" : "";
  }

  // ---- editable fields ----
  const tierOf = (s, id) => s.tiers.find((t) => t.id === id);

  /** desc: {key, kind: percent|int|number|text|bool|select, read(settings), write?(v), min?, options?} */
  function makeField(desc) {
    let input;
    if (desc.kind === "bool") input = h("input", { type: "checkbox" });
    else if (desc.kind === "select") input = h("select", {}, desc.options.map((o) => h("option", { value: o[0] }, o[1])));
    else if (desc.kind === "text") input = h("input", { type: "text" });
    else input = h("input", { type: "number", step: desc.kind === "int" ? "1" : "any", min: "0" });
    const f = { desc, input };
    input.addEventListener("change", () => onFieldChange(f));
    adminFields.push(f);
    return input;
  }

  function displayValue(desc, s) {
    const v = desc.read(s);
    return desc.kind === "percent" ? Number((v * 100).toFixed(6)) : v;
  }

  function syncFields() {
    const s = settings();
    adminFields.forEach((f) => {
      const v = displayValue(f.desc, s);
      if (document.activeElement !== f.input) {
        if (f.desc.kind === "bool") f.input.checked = !!v;
        else f.input.value = v;
      }
      f.input.classList.toggle("overridden", Object.prototype.hasOwnProperty.call(state.overrides, f.desc.key));
    });
  }

  function onFieldChange(f) {
    const d = f.desc;
    const el = f.input;
    let v;
    if (d.kind === "bool") v = el.checked;
    else if (d.kind === "select" || d.kind === "text") v = el.value;
    else {
      const n = el.value.trim() === "" ? NaN : Number(el.value);
      if (!isFinite(n)) { setMsg("Not saved: please enter a number.", true); syncFields(); return; }
      if (d.min !== undefined && n < d.min) { setMsg("Not saved: " + d.label + " can't be below " + d.min + ".", true); el.value = displayValue(d, settings()); return; }
      v = d.kind === "percent" ? Math.round((n / 100) * 1e8) / 1e8 : n;
    }
    if (d.write) v = d.write(v);
    const r = E.tryOverride(state.overrides, d.key, v, CONFIG);
    if (!r.ok) {
      setMsg("Not saved: " + r.problems.join(" "), true);
      el.value = displayValue(d, settings());
      if (d.kind === "bool") el.checked = !!displayValue(d, settings());
      return;
    }
    state.overrides = r.overrides;
    saveState();
    setMsg("Saved.", false);
    renderMain();
    refreshAdmin();
  }

  function buildAdmin() {
    adminFields = [];
    buildSettings();
    buildBudget();
    buildSim();
    buildSync();
    buildBackup();
    buildDanger();
  }

  function buildBackup() {
    const file = h("input", { type: "file", accept: ".json,application/json" });
    file.addEventListener("change", () => { restoreFromFile(file.files[0]); file.value = ""; });
    $("admin-backup-body").replaceChildren(
      h("p", {}, "Game data is stored in this browser. Keep a copy somewhere else too:"),
      h("p", {}, h("button", { type: "button", onclick: chooseBackupFile }, canAutoBackup ? "Set up auto-backup file..." : "Download backup"),
        " ", canAutoBackup ? h("button", { type: "button", onclick: downloadBackup }, "Download backup now") : null),
      h("p", {}, h("label", {}, "Restore from a backup file: ", file)),
      h("p", { class: "admin-note" }, "Auto-backup (Chrome/Edge) writes the full game data to a file you choose after every spin; you have to pick the file again after reloading the page. " +
        "Restore replaces everything (spins, log, stock, settings) with the backup."));
  }

  function buildSettings() {
    const body = $("admin-settings-body");
    body.replaceChildren();
    const s0 = settings();

    // tier table
    const rows = s0.tiers.map((t) => {
      const id = t.id;
      return h("tr", {},
        h("td", {}, t.name),
        h("td", {}, t.risingOdds
          ? "rising (see below)"
          : t.remainder ? "the remainder"
          : makeField({ key: "tiers." + id + ".chance", kind: "percent", label: "chance", read: (s) => tierOf(s, id).chance })),
        h("td", {}, makeField({ key: "tiers." + id + ".prizeName", kind: "text", label: "prize name", read: (s) => tierOf(s, id).prizeName })),
        h("td", {}, makeField({ key: "tiers." + id + ".prizeCostRM", kind: "number", label: "prize cost", min: 0, read: (s) => tierOf(s, id).prizeCostRM })),
        h("td", {}, makeField({
          key: "tiers." + id + ".startingStock", kind: "int", label: "stock", min: 0,
          read: (s) => E.stockOf(state, s, id),                       // shows what is LEFT
          write: (left) => left + (state.awarded[id] || 0),            // stored as starting stock
        })));
    });
    body.append(h("table", {},
      h("thead", {}, h("tr", {}, ["Tier", "Chance (%)", "Prize name", "Prize cost (" + CUR + ")", "In stock now"].map((x) => h("th", {}, x)))),
      h("tbody", {}, rows)));

    const labelled = (text, input) => h("label", {}, text + " ", input);
    const fieldset = (title, kids) => h("fieldset", {}, h("legend", {}, title), kids);

    body.append(fieldset("Grand prize rising odds", [
      labelled("Base chance (%)", makeField({ key: "grand.baseChance", kind: "percent", label: "base chance", read: (s) => s.grand.baseChance })),
      labelled("Ramp starts at spin", makeField({ key: "grand.rampStartSpin", kind: "int", label: "ramp start", min: 1, read: (s) => s.grand.rampStartSpin })),
      labelled("Chance added per spin (%)", makeField({ key: "grand.rampStep", kind: "percent", label: "ramp step", read: (s) => s.grand.rampStep })),
      labelled("Guaranteed by spin", makeField({ key: "grand.guaranteedBySpin", kind: "int", label: "guaranteed-by spin", min: 1, read: (s) => s.grand.guaranteedBySpin })),
    ]));

    body.append(fieldset("Launch bonus", [
      labelled("Enabled", makeField({ key: "launchBonus.enabled", kind: "bool", label: "launch bonus", read: (s) => s.launchBonus.enabled })),
      labelled("Boosted spins", makeField({ key: "launchBonus.spins", kind: "int", label: "boosted spins", min: 0, read: (s) => s.launchBonus.spins })),
      labelled("Multiplier (x)", makeField({ key: "launchBonus.multiplier", kind: "number", label: "multiplier", min: 0, read: (s) => s.launchBonus.multiplier })),
    ]));

    body.append(fieldset("General", [
      labelled("Spins per new player", makeField({ key: "spinsPerPlayer", kind: "int", label: "spins per player", min: 1, read: (s) => s.spinsPerPlayer })),
      labelled("When a prize runs out", makeField({
        key: "outOfStock", kind: "select", label: "out-of-stock rule", read: (s) => s.outOfStock,
        options: [["noPrize", 'move its odds to "no prize"'], ["nextLowerTier", "move its odds to the next tier down"]],
      })),
    ]));

    $("reset-settings-btn").onclick = () => {
      if (!confirm("Reset all odds, prize costs, stock edits and settings to the values in config.js?\n(The spin log and prizes already given are kept.)")) return;
      state.overrides = {};
      saveState();
      setMsg("Reset to config.js defaults.", false);
      renderMain();
      refreshAdmin();
    };
  }

  // ---- live stats ----
  function renderStats() {
    const s = settings();
    const info = E.computeProbabilities(state, s);
    const lb = E.launchBonusStatus(state, s);
    const costGiven = {};
    state.log.forEach((e) => { costGiven[e.tier] = (costGiven[e.tier] || 0) + e.costRM; });

    const dl = h("dl", {},
      h("dt", {}, "Total spins"), h("dd", {}, fmtInt(state.totalSpins)),
      h("dt", {}, "Players so far"), h("dd", {}, fmtInt(state.playerCount)),
      h("dt", {}, "Grand prize chance (next spin)"), h("dd", {}, fmtPct(info.grandChance) + " (spin " + info.spinNumber + ")"),
      h("dt", {}, "Grand prize"), h("dd", {}, state.grandPrizeWon ? "Won at spin " + state.grandWonAtSpin : "Not won yet"),
      h("dt", {}, "Launch bonus"), h("dd", {}, lb.active ? lb.spinsLeft + " boosted spins left" : (s.launchBonus.enabled ? "finished" : "off")));

    const rows = s.tiers.map((t) => h("tr", {},
      h("td", {}, t.name),
      h("td", {}, fmtPct(info.probs[t.id])),
      h("td", {}, String(state.awarded[t.id] || 0)),
      h("td", {}, String(E.stockOf(state, s, t.id))),
      h("td", {}, fmtRM(costGiven[t.id] || 0))));
    const nones = state.log.filter((e) => e.tier === "none").length;
    if (nones > 0 || info.probs.none > 0) {
      rows.push(h("tr", {}, h("td", {}, "Out of gifts (nothing to give)"), h("td", {}, fmtPct(info.probs.none)), h("td", {}, String(nones)), h("td", {}, "-"), h("td", {}, "-")));
    }

    const table = h("table", {},
      h("thead", {}, h("tr", {}, ["Outcome", "Chance on next spin", "Given", "In stock", "Cost given"].map((x) => h("th", {}, x)))),
      h("tbody", {}, rows));
    $("admin-stats-body").replaceChildren(dl, table);
  }

  // ---- budget ----
  function buildBudget() {
    const nInput = h("input", { type: "number", min: "1", step: "1", value: String(CONFIG.simulation.spinsPerEvent) });
    const out = h("dl");
    nInput.addEventListener("input", updateBudget);
    budgetEls = { nInput, out };
    $("admin-budget-body").replaceChildren(
      h("label", {}, "Spins to project: ", nInput),
      out,
      h("p", { class: "admin-note" },
        "Expected cost per spin = sum of (tier chance × prize cost), using the live odds for the next spin. " +
        "The projection is for a whole event from spin 1 with starting stock; it includes the launch bonus and grand prize ramp but ignores the stock limits of tiers 2–5 (the simulation below includes them)."));
  }

  function updateBudget() {
    if (!budgetEls) return;
    const s = settings();
    const n = Math.max(1, Math.floor(Number(budgetEls.nInput.value)) || 1);
    const proj = E.projectEventCost(s, n);
    const spent = state.log.reduce((a, e) => a + e.costRM, 0);
    budgetEls.out.replaceChildren(
      h("dt", {}, "Expected cost of the next spin"), h("dd", {}, fmtRM(E.expectedCostNextSpin(state, s))),
      h("dt", {}, "Projected total for " + fmtInt(n) + " spins"), h("dd", {}, fmtRM(proj.total) + " (average " + fmtRM(proj.perSpin) + " per spin)"),
      h("dt", {}, "Cost of prizes given so far"), h("dd", {}, fmtRM(spent)));
  }

  // ---- simulation ----
  function buildSim() {
    const events = h("input", { type: "number", min: "1", step: "1", value: String(CONFIG.simulation.events) });
    const spins = h("input", { type: "number", min: "1", step: "1", value: String(CONFIG.simulation.spinsPerEvent) });
    const btn = h("button", { type: "button" }, "Run simulation");
    const progress = h("p", { class: "sim-progress" });
    const out = h("div");
    btn.addEventListener("click", runSimulation);
    simEls = { events, spins, btn, progress, out };
    $("admin-sim-body").replaceChildren(
      h("label", {}, "Events: ", events), h("label", {}, "Spins per event: ", spins), btn, progress, out,
      h("p", { class: "admin-note" }, "Uses the current settings and starting stock, from spin 1 of a fresh event. Runs on a private copy: it never changes the real log, stock or counters."));
  }

  function runSimulation() {
    if (simRunning) return;
    const events = Math.floor(Number(simEls.events.value));
    const spins = Math.floor(Number(simEls.spins.value));
    if (!(events >= 1 && events <= 200000 && spins >= 1 && spins <= 100000)) {
      simEls.progress.textContent = "Enter events between 1 and 200,000 and spins between 1 and 100,000.";
      return;
    }
    simRunning = true;
    simEls.btn.disabled = true;
    simEls.out.replaceChildren();
    const s = settings();              // snapshot; the simulation never sees `state`
    const results = [];
    (function chunk() {
      const end = Math.min(events, results.length + 250);
      while (results.length < end) results.push(E.simulateEvent(s, spins, Math.random));
      simEls.progress.textContent = "Running... " + fmtInt(results.length) + " / " + fmtInt(events);
      if (results.length < events) { setTimeout(chunk, 0); return; }
      simEls.progress.textContent = "Done: " + fmtInt(events) + " events of " + fmtInt(spins) + " spins.";
      showSimResults(E.summarizeSimulation(results, s), s);
      simEls.btn.disabled = false;
      simRunning = false;
    })();
  }

  function showSimResults(r, s) {
    const grand = r.grandWonCount === 0
      ? "Never won in these events"
      : "median spin " + r.grandMedian + " (10th percentile: spin " + r.grandP10 + ", 90th percentile: spin " + r.grandP90 + ")";
    const dl = h("dl", {},
      h("dt", {}, "Grand prize won"), h("dd", {}, fmtPct(r.grandWonShare) + " of events"),
      h("dt", {}, "When the grand was won"), h("dd", {}, grand),
      h("dt", {}, "Average cost per event"), h("dd", {}, fmtRM(r.avgCost) + " (10th–90th percentile: " + fmtRM(r.costP10) + " – " + fmtRM(r.costP90) + ")"));
    const rows = s.tiers.map((t) => h("tr", {}, h("td", {}, t.name), h("td", {}, r.prizesPerTier[t.id].toFixed(1)), h("td", {}, String(t.startingStock))));
    simEls.out.replaceChildren(dl, h("table", {},
      h("thead", {}, h("tr", {}, ["Tier", "Average prizes given per event", "Starting stock"].map((x) => h("th", {}, x)))),
      h("tbody", {}, rows)));
  }

  // ---- start of event / full reset ----
  function buildDanger() {
    const typed = h("input", { type: "text", placeholder: "RESET", autocomplete: "off" });
    const wipe = h("button", { type: "button", class: "danger", disabled: true }, "Yes, erase everything");
    const cancel = h("button", { type: "button" }, "Cancel");
    const box = h("div", { class: "danger-box", hidden: true },
      h("p", {}, "This erases the spin log, spin count, player count and prizes given, and puts all stock back to its starting amount. " +
        "Odds and settings are kept. If auto-backup is on, the backup file is overwritten with the empty event too, so download what you need first."),
      h("p", {}, h("button", { type: "button", onclick: exportCsv }, "Export CSV now"), " ", h("button", { type: "button", onclick: downloadBackup }, "Download backup now")),
      h("p", {}, "Type RESET to confirm: ", typed),
      h("p", {}, wipe, " ", cancel));
    const open = h("button", { type: "button", class: "danger" }, "Full reset (start of event)...");

    open.addEventListener("click", () => { box.hidden = false; typed.value = ""; wipe.disabled = true; typed.focus(); });
    cancel.addEventListener("click", () => { box.hidden = true; });
    typed.addEventListener("input", () => { wipe.disabled = typed.value.trim() !== "RESET"; });
    wipe.addEventListener("click", () => {
      if (typed.value.trim() !== "RESET" || spinning) return;
      state = E.fullReset(state);
      saveState();
      setReels(null);
      showResult(null);
      renderMain();
      box.hidden = true;
      refreshAdmin();
      setMsg("Event reset. Ready for a new event.", false);
    });
    $("admin-danger-body").replaceChildren(open, box);
  }

  function refreshAdmin() {
    if (!isAdminOpen()) return;
    syncFields();
    renderStats();
    updateBudget();
  }

  // =======================================================================
  // START UP
  // =======================================================================
  function init() {
    $("title").textContent = CONFIG.eventName;
    $("tagline").textContent = CONFIG.tagline;
    document.title = CONFIG.eventName;

    const problems = E.validateConfig(CONFIG);
    if (problems.length) {
      configOk = false;
      const box = $("config-errors");
      box.hidden = false;
      box.replaceChildren(h("strong", {}, "config.js has problems - the game is disabled until they are fixed:"), h("ul", {}, problems.map((p) => h("li", {}, p))));
      $("spin-btn").disabled = true;
      $("new-player-btn").disabled = true;
      $("operator-bar").hidden = true;
      return;
    }

    state = loadState();
    // Check that saving really works (private windows / blocked storage can fail silently)
    try { localStorage.setItem(STORAGE_KEY + ".probe", "1"); localStorage.removeItem(STORAGE_KEY + ".probe"); } catch (e) { storageOk = false; }
    $("storage-warning").hidden = storageOk;
    if (!storageOk) $("storage-warning").textContent = "⚠️ This browser is not saving data (private window or blocked storage). Do NOT refresh the page — progress would be lost. Export the CSV regularly.";

    $("spin-btn").addEventListener("click", onSpin);
    $("new-player-btn").addEventListener("click", onNewPlayer);
    $("export-btn").addEventListener("click", exportCsv);
    $("backup-btn").addEventListener("click", chooseBackupFile);
    $("pin-form").addEventListener("submit", onPinSubmit);
    $("pin-cancel").addEventListener("click", closePin);
    $("pin-overlay").addEventListener("mousedown", (e) => { if (e.target === $("pin-overlay")) closePin(); });

    loadSync();
    renderSyncStatus();
    window.addEventListener("online", () => syncNow());
    setInterval(() => { if (sync.url && !syncBusy && syncPending().length) syncNow(); }, 30000);
    if (sync.url) syncNow();
    $("admin-close").addEventListener("click", closeAdmin);
    $("admin").addEventListener("mousedown", (e) => { if (e.target === $("admin")) closeAdmin(); });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.code === "KeyA" || (e.key || "").toLowerCase() === "a")) {
        e.preventDefault();
        if (isAdminOpen()) closeAdmin();
        else if (!$("pin-overlay").hidden) closePin();
        else requestAdmin();
      } else if (e.key === "Escape") {
        if (isAdminOpen()) closeAdmin();
        else if (!$("pin-overlay").hidden) closePin();
      }
    });
    // Fallback if the browser keeps Ctrl+Shift+A for itself: add #admin to the address.
    window.addEventListener("hashchange", () => { if (location.hash === "#admin") requestAdmin(); });

    showLastResult();
    renderBackupStatus();
    renderMain();
    if (location.hash === "#admin") requestAdmin();
  }

  init();
})();
