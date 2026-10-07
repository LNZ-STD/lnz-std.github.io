/*
 * LNZ.STD — shared code for the developer tools and the member profile
 *
 * - Roblox upload through the relay (worker/roblox-proxy.js)
 * - Free upload allowance (shared by every tool)
 * - Member library: everything uploaded, organised in folders
 *
 * NOTE: allowance and library live in localStorage, like membership.
 * Move them server-side once real accounts exist.
 */

const USAGE_PREFIX = "lnz_tool_uploads:";
const LIBRARY_PREFIX = "lnz_library:";
const LEGACY_HISTORY_PREFIX = "lnz_tool_history:";
const CREDS_KEY = "lnz_tool_creds";
const THUMB_SIZE = 96;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- storage ---------- */

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/* ---------- upload allowance ---------- */

const usedUploads = (m) => load(USAGE_PREFIX + m.username, 0);
const remainingUploads = (m) => Math.max(0, TOOLS.freeUploads - usedUploads(m));
const countUpload = (m) => store(USAGE_PREFIX + m.username, usedUploads(m) + 1);

function updateQuota() {
  const member = Member.get();
  const left = remainingUploads(member);
  if ($("quota-left")) $("quota-left").textContent = left;
  if ($("quota-total")) $("quota-total").textContent = TOOLS.freeUploads;
  if ($("upload-btn")) $("upload-btn").textContent = left > 0 ? `Upload to Roblox (${left} left)` : "No free uploads left";
}

/* ---------- library (uploads + folders) ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const Library = {
  key: (m) => LIBRARY_PREFIX + m.username,

  get(m) {
    const lib = load(this.key(m), null) || { folders: [], items: [] };
    // One-time import of the Audio Uploader's old history list
    const legacy = load(LEGACY_HISTORY_PREFIX + m.username, null);
    if (legacy) {
      for (const h of legacy.slice().reverse()) {
        lib.items.unshift({ id: uid(), type: "audio", name: h.name, assetId: h.audioId, coverId: h.imageId || null, folderId: null, at: h.at });
      }
      store(this.key(m), lib);
      store(LEGACY_HISTORY_PREFIX + m.username, null);
    }
    return lib;
  },

  save(m, lib) {
    return store(this.key(m), lib);
  },

  addItem(m, item) {
    const lib = this.get(m);
    const entry = { id: uid(), folderId: null, at: new Date().toISOString(), ...item };
    lib.items.unshift(entry);
    if (!this.save(m, lib)) {
      // Storage full: drop the thumbnail and try again
      entry.thumb = null;
      this.save(m, lib);
    }
    return entry;
  },

  addFolder(m, name) {
    const lib = this.get(m);
    const folder = { id: uid(), name: name.trim().slice(0, 40) };
    lib.folders.push(folder);
    this.save(m, lib);
    return folder;
  },

  renameFolder(m, id, name) {
    const lib = this.get(m);
    const f = lib.folders.find((x) => x.id === id);
    if (f) f.name = name.trim().slice(0, 40);
    this.save(m, lib);
  },

  // Items in a deleted folder go back to "Unsorted"
  deleteFolder(m, id) {
    const lib = this.get(m);
    lib.folders = lib.folders.filter((f) => f.id !== id);
    lib.items.forEach((i) => i.folderId === id && (i.folderId = null));
    this.save(m, lib);
  },

  moveItem(m, itemId, folderId) {
    const lib = this.get(m);
    const item = lib.items.find((i) => i.id === itemId);
    if (item) item.folderId = folderId || null;
    this.save(m, lib);
  },

  removeItem(m, itemId) {
    const lib = this.get(m);
    lib.items = lib.items.filter((i) => i.id !== itemId);
    this.save(m, lib);
  },
};

// Fills a <select> with "Unsorted" + folders + "New folder…"
function fillFolderSelect(select, selected = "") {
  const lib = Library.get(Member.get());
  select.innerHTML = "";
  select.append(new Option("Unsorted", ""));
  lib.folders.forEach((f) => select.append(new Option(f.name, f.id)));
  select.append(new Option("+ New folder…", "__new"));
  select.value = lib.folders.some((f) => f.id === selected) ? selected : "";
  select.dataset.prev = select.value;
}

function setupFolderSelect(select) {
  fillFolderSelect(select);
  select.addEventListener("change", () => {
    if (select.value !== "__new") {
      select.dataset.prev = select.value;
      return;
    }
    const name = prompt("Folder name");
    if (name && name.trim()) {
      const f = Library.addFolder(Member.get(), name);
      fillFolderSelect(select, f.id);
    } else {
      select.value = select.dataset.prev || "";
    }
  });
}

async function makeThumb(blob) {
  try {
    const img = await createImageBitmap(blob);
    const side = Math.min(img.width, img.height);
    const c = document.createElement("canvas");
    c.width = c.height = THUMB_SIZE;
    c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    return c.toDataURL("image/webp", 0.7);
  } catch {
    return null;
  }
}

/* ---------- UI helpers ---------- */

function log(text, kind = "") {
  const box = $("log");
  const line = document.createElement("p");
  line.className = `log__line ${kind ? "log__line--" + kind : ""}`;
  line.textContent = text;
  box.append(line);
  box.scrollTop = box.scrollHeight;
}

function safeFileName(name) {
  return (name || "file").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "file";
}

function idRow(label, id) {
  const row = document.createElement("div");
  row.className = "id-row";
  const text = document.createElement("div");
  const l = document.createElement("span");
  l.className = "mono";
  l.textContent = label;
  const code = document.createElement("code");
  code.textContent = `rbxassetid://${id}`;
  text.append(l, code);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--ghost";
  btn.textContent = "Copy ID";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(id));
      btn.textContent = "Copied";
    } catch {
      btn.textContent = id;
    }
    setTimeout(() => (btn.textContent = "Copy ID"), 1500);
  });
  row.append(text, btn);
  return row;
}

function setupDrop(zoneId, inputId, onFile) {
  const zone = $(zoneId);
  const input = $(inputId);
  input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

// Latest uploads on a tool page, with a link to the full library on the profile
function renderRecent(type) {
  const list = $("history");
  if (!list) return;
  const items = Library.get(Member.get()).items.filter((i) => !type || i.type === type).slice(0, 5);
  list.innerHTML = "";
  $("history-panel").hidden = items.length === 0;
  for (const h of items) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = h.name;
    const ids = document.createElement("span");
    ids.className = "mono";
    ids.textContent = h.type === "audio" ? `Audio ${h.assetId}${h.coverId ? ` · Cover ${h.coverId}` : ""}` : `Decal ${h.assetId}`;
    li.append(title, ids);
    list.append(li);
  }
}

/* ---------- upload form (username + API key) ---------- */

function saveCreds(username, apiKey, remember) {
  store(CREDS_KEY, { username, apiKey: remember ? apiKey : "" });
}

function initUploadForm() {
  const member = Member.get();
  const creds = load(CREDS_KEY, {});
  if (creds.username) $("roblox-user").value = creds.username;
  else if (member.roblox) $("roblox-user").value = member.roblox;
  if (creds.apiKey) {
    $("api-key").value = creds.apiKey;
    $("remember").checked = true;
  }
  $("toggle-key").addEventListener("click", () => {
    const input = $("api-key");
    input.type = input.type === "password" ? "text" : "password";
    $("toggle-key").textContent = input.type === "password" ? "Show" : "Hide";
  });
  $("remember").addEventListener("change", () => {
    if (!$("remember").checked) saveCreds($("roblox-user").value.trim(), "", false);
  });
  if ($("folder")) setupFolderSelect($("folder"));
}

// Shared checks before any upload. Returns the form values, or null after logging why not.
function readUploadForm() {
  const member = Member.get();
  $("log").innerHTML = "";
  if (remainingUploads(member) <= 0) {
    log(`You've used all ${TOOLS.freeUploads} free uploads. You can still download the file and upload it in Creator Hub.`, "err");
    return null;
  }
  if (!SITE.uploadProxy) {
    log("Uploads aren't switched on yet — the upload server hasn't been set up. You can still download the file and upload it in Creator Hub.", "err");
    return null;
  }
  const values = {
    username: $("roblox-user").value.trim(),
    apiKey: $("api-key").value.trim(),
    name: $("asset-name").value.trim().slice(0, 50),
    description: $("asset-desc").value.trim().slice(0, 1000),
    folderId: $("folder") && $("folder").value !== "__new" ? $("folder").value : "",
  };
  if (!values.username || !values.apiKey || !values.name) {
    log("Fill in your Roblox username, Open Cloud API key and an asset name.", "err");
    return null;
  }
  saveCreds(values.username, values.apiKey, $("remember").checked);
  return values;
}

/* ---------- Roblox upload (via relay) ---------- */

const relay = () => SITE.uploadProxy.replace(/\/+$/, "");

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function robloxError(data, res) {
  const msg = data.message || data.errors?.[0]?.message || data.error?.message || `Roblox returned error ${res.status}.`;
  if (res.status === 401 || res.status === 403) {
    return `${msg} Check the API key, that it has Assets read + write permission, and that 0.0.0.0/0 is in its allowed IPs.`;
  }
  return msg;
}

async function resolveUser(username) {
  if (/^\d+$/.test(username)) return { id: username, name: username };
  const res = await fetch(`${relay()}/users/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.message || `Couldn't find Roblox user "${username}".`);
  return data;
}

async function createAsset(type, { userId, apiKey, name, description, blob, filename }) {
  const form = new FormData();
  form.append(
    "request",
    JSON.stringify({
      assetType: type,
      displayName: name,
      description,
      creationContext: { creator: { userId: String(userId) } },
    })
  );
  form.append("fileContent", blob, filename);

  const res = await fetch(`${relay()}/assets`, {
    method: "POST",
    headers: { "X-Roblox-Api-Key": apiKey },
    body: form,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(robloxError(data, res));
  if (data.done && data.response?.assetId) return data.response.assetId;

  const opId = data.operationId || (data.path || "").split("/").pop();
  if (!opId) throw new Error("Roblox didn't return an operation to track.");
  return pollOperation(opId, apiKey);
}

async function pollOperation(opId, apiKey) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(2000);
    const res = await fetch(`${relay()}/operations/${encodeURIComponent(opId)}`, {
      headers: { "X-Roblox-Api-Key": apiKey },
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(robloxError(data, res));
    if (data.done) {
      if (data.error) throw new Error(data.error.message || "Roblox rejected the upload.");
      if (data.response?.assetId) return data.response.assetId;
      throw new Error("Upload finished but Roblox didn't return an asset ID.");
    }
  }
  throw new Error("Roblox is still processing. Check Creator Hub → Development Items in a few minutes.");
}
