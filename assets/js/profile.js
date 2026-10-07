/*
 * LNZ.STD — member profile and upload library
 *
 * Shows the member's details, remaining free uploads and every upload
 * made with the tools, organised in folders. Data comes from roblox.js
 * (localStorage for now). Uses el() from main.js.
 */

const view = {
  folder: "all", // "all" | "unsorted" | folder id
  type: "all", // "all" | "audio" | "image"
  query: "",
};

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function renderProfile() {
  const m = Member.get();
  $("p-initial").textContent = (m.username || "?").slice(0, 1).toUpperCase();
  $("p-username").textContent = m.username;
  $("p-since").textContent = m.registeredAt ? `Member since ${fmtDate(m.registeredAt)}` : "Member";

  const facts = $("p-facts");
  facts.innerHTML = "";
  [
    ["Roblox", m.roblox],
    ["Discord", m.discord],
    ["Email", m.email],
  ].forEach(([k, v]) => facts.append(el("div", {}, [el("dt", { text: k }), el("dd", { text: v || "—" })])));

  const used = usedUploads(m);
  const left = remainingUploads(m);
  $("p-quota").textContent = `${left} / ${TOOLS.freeUploads}`;
  $("p-quota-bar").style.width = `${Math.min(100, (used / TOOLS.freeUploads) * 100)}%`;
}

function renderFolders(lib) {
  const list = $("folder-list");
  list.innerHTML = "";
  const count = (f) => lib.items.filter(f).length;
  const entries = [
    { id: "all", name: "All uploads", n: lib.items.length },
    { id: "unsorted", name: "Unsorted", n: count((i) => !i.folderId) },
    ...lib.folders.map((f) => ({ id: f.id, name: f.name, n: count((i) => i.folderId === f.id), folder: true })),
  ];
  for (const f of entries) {
    const btn = el("button", { type: "button", class: `folder${view.folder === f.id ? " is-active" : ""}` }, [
      el("span", { class: "folder__icon", text: f.folder ? "▤" : f.id === "all" ? "◎" : "○" }),
      el("span", { class: "folder__name", text: f.name }),
      el("span", { class: "folder__n", text: String(f.n) }),
    ]);
    btn.addEventListener("click", () => {
      view.folder = f.id;
      render();
    });
    list.append(el("li", {}, btn));
  }

  const current = lib.folders.find((f) => f.id === view.folder);
  $("folder-title").textContent = current ? current.name : view.folder === "unsorted" ? "Unsorted" : "All uploads";
  $("folder-actions").hidden = !current;
}

function moveSelect(lib, item) {
  const select = el("select", { class: "move", "aria-label": `Move ${item.name} to folder` });
  select.append(new Option("Unsorted", ""));
  lib.folders.forEach((f) => select.append(new Option(f.name, f.id)));
  select.value = item.folderId || "";
  select.addEventListener("change", () => {
    Library.moveItem(Member.get(), item.id, select.value);
    render();
  });
  return select;
}

function itemCard(lib, item) {
  const thumb = item.thumb
    ? el("img", { src: item.thumb, alt: "" })
    : el("span", { class: "item__glyph", text: item.type === "audio" ? "♪" : "▣" });

  const ids = el("div", { class: "item__ids" }, [idRow(item.type === "audio" ? "Audio ID" : "Decal ID", item.assetId)]);
  if (item.coverId) ids.append(idRow("Cover ID", item.coverId));

  const remove = el("button", { type: "button", class: "linklike item__remove", text: "Remove" });
  remove.addEventListener("click", () => {
    if (confirm(`Remove "${item.name}" from your library? It stays on Roblox.`)) {
      Library.removeItem(Member.get(), item.id);
      render();
    }
  });

  return el("article", { class: "item" }, [
    el("div", { class: "item__head" }, [
      el("div", { class: "item__thumb" }, thumb),
      el("div", { class: "item__title" }, [
        el("span", { class: `badge badge--${item.type}`, text: item.type === "audio" ? "Audio" : "Image" }),
        el("h3", { text: item.name }),
        el("span", { class: "mono", text: fmtDate(item.at) }),
      ]),
    ]),
    ids,
    el("div", { class: "item__foot" }, [el("label", { class: "mono", text: "Folder" }), moveSelect(lib, item), remove]),
  ]);
}

function renderItems(lib) {
  const q = view.query.toLowerCase();
  const items = lib.items.filter((i) => {
    if (view.folder === "unsorted" && i.folderId) return false;
    if (view.folder !== "all" && view.folder !== "unsorted" && i.folderId !== view.folder) return false;
    if (view.type !== "all" && i.type !== view.type) return false;
    if (q && !`${i.name} ${i.assetId} ${i.coverId || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const grid = $("items");
  grid.innerHTML = "";
  $("empty").hidden = items.length > 0;
  $("empty-text").textContent =
    lib.items.length === 0
      ? "Nothing uploaded yet. Uploads from the tools show up here automatically."
      : "Nothing here. Try another folder or filter, or move uploads into this folder.";
  items.forEach((i) => grid.append(itemCard(lib, i)));
}

function render() {
  const lib = Library.get(Member.get());
  if (view.folder !== "all" && view.folder !== "unsorted" && !lib.folders.some((f) => f.id === view.folder)) view.folder = "all";
  renderProfile();
  renderFolders(lib);
  renderItems(lib);
}

function initProfile() {
  if (!$("profile")) return;
  const member = Member.get();
  if (!member) {
    $("profile-locked").hidden = false;
    return;
  }
  $("profile").hidden = false;

  $("new-folder").addEventListener("click", () => {
    const name = prompt("Folder name");
    if (name && name.trim()) {
      view.folder = Library.addFolder(Member.get(), name).id;
      render();
    }
  });
  $("rename-folder").addEventListener("click", () => {
    const lib = Library.get(Member.get());
    const f = lib.folders.find((x) => x.id === view.folder);
    const name = f && prompt("Rename folder", f.name);
    if (name && name.trim()) {
      Library.renameFolder(Member.get(), f.id, name);
      render();
    }
  });
  $("delete-folder").addEventListener("click", () => {
    const lib = Library.get(Member.get());
    const f = lib.folders.find((x) => x.id === view.folder);
    if (f && confirm(`Delete folder "${f.name}"? Its uploads move to Unsorted.`)) {
      Library.deleteFolder(Member.get(), f.id);
      view.folder = "all";
      render();
    }
  });
  document.querySelectorAll("[data-type]").forEach((b) =>
    b.addEventListener("click", () => {
      view.type = b.dataset.type;
      document.querySelectorAll("[data-type]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    })
  );
  $("search").addEventListener("input", (e) => {
    view.query = e.target.value.trim();
    render();
  });
  $("sign-out-profile").addEventListener("click", () => {
    if (confirm("Sign out on this device?")) {
      Member.clear();
      location.href = "index.html";
    }
  });

  render();
}

document.addEventListener("DOMContentLoaded", initProfile);
