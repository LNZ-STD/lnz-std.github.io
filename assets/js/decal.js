/*
 * LNZ.STD — Image Uploader (developer tool)
 *
 * Load an image → crop / resize → export PNG → upload to Roblox as a Decal.
 * Shared upload, allowance and library code lives in roblox.js.
 */

// Roblox shrinks anything larger than this on upload
const ROBLOX_IMAGE_MAX_SIDE = 1024;

const img = {
  bitmap: null,
  fileName: "",
  blob: null,
  busy: false,
};

function setImgBusy(busy) {
  img.busy = busy;
  ["upload-btn", "download-btn"].forEach((id) => ($(id).disabled = busy || !img.blob));
}

async function loadImage(file) {
  if (!file.type.startsWith("image/")) {
    $("file-error").textContent = "Choose a PNG, JPG, WEBP or BMP image.";
    $("file-error").hidden = false;
    return;
  }
  try {
    img.bitmap = await createImageBitmap(file);
  } catch {
    $("file-error").textContent = "Couldn't read this image. Try a PNG or JPG.";
    $("file-error").hidden = false;
    return;
  }
  img.fileName = file.name.replace(/\.[^.]+$/, "");
  if (!$("asset-name").value) $("asset-name").value = img.fileName.slice(0, 50);
  $("file-error").hidden = true;
  $("image-drop").hidden = true;
  $("editor").hidden = false;
  $("file-name").textContent = file.name;
  $("file-meta").textContent = `${img.bitmap.width}×${img.bitmap.height}`;
  await renderImage();
}

// Draws the bitmap with the current crop/size settings and keeps the PNG blob.
async function renderImage() {
  if (!img.bitmap) return;
  const { width: w, height: h } = img.bitmap;
  const square = $("crop").value === "square";
  const sw = square ? Math.min(w, h) : w;
  const sh = square ? Math.min(w, h) : h;
  const limit = Math.min(ROBLOX_IMAGE_MAX_SIDE, parseInt($("size").value, 10) || ROBLOX_IMAGE_MAX_SIDE);
  const scale = Math.min(1, limit / Math.max(sw, sh));
  const ow = Math.max(1, Math.round(sw * scale));
  const oh = Math.max(1, Math.round(sh * scale));

  const canvas = $("preview");
  canvas.width = ow;
  canvas.height = oh;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, ow, oh);
  g.imageSmoothingQuality = "high";
  g.drawImage(img.bitmap, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, ow, oh);

  img.blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const kb = img.blob.size / 1024;
  $("out-info").textContent = `Output ${ow}×${oh} PNG · ${kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB"}`;
  setImgBusy(false);
}

function downloadPng() {
  if (!img.blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(img.blob);
  a.download = `${safeFileName($("asset-name").value || img.fileName || "image")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function uploadImage(e) {
  e.preventDefault();
  if (!img.blob || img.busy) return;
  const form = readUploadForm();
  if (!form) return;
  const member = Member.get();

  setImgBusy(true);
  $("result").hidden = true;
  try {
    log("Looking up your Roblox account…");
    const user = await resolveUser(form.username);
    log(`Found ${user.name} (ID ${user.id}).`, "ok");

    log("Uploading image to Roblox… (moderation can take a minute)");
    const decalId = await createAsset("Decal", {
      userId: user.id,
      apiKey: form.apiKey,
      name: form.name,
      description: form.description,
      blob: img.blob,
      filename: `${safeFileName(form.name)}.png`,
    });
    countUpload(member);
    updateQuota();
    log(`Decal uploaded: ${decalId}`, "ok");

    Library.addItem(member, { type: "image", name: form.name, assetId: decalId, thumb: await makeThumb(img.blob), folderId: form.folderId || null });
    log("Saved to your library.", "ok");

    $("result-name").textContent = form.name;
    $("result-ids").innerHTML = "";
    $("result-ids").append(idRow("Decal ID", decalId));
    $("result").hidden = false;
    renderRecent("image");
  } catch (err) {
    log(err.message, "err");
  } finally {
    setImgBusy(false);
  }
}

function initDecalTool() {
  if (!$("tool") || !$("image-drop")) return;
  const member = Member.get();
  if (!member) {
    $("tool-locked").hidden = false;
    return;
  }
  $("tool").hidden = false;
  $("tool-member").textContent = `Signed in as ${member.username}`;
  updateQuota();
  renderRecent("image");
  initUploadForm();

  setupDrop("image-drop", "image-file", loadImage);
  $("change-file").addEventListener("click", () => $("image-file").click());
  $("crop").addEventListener("change", renderImage);
  $("size").addEventListener("change", renderImage);
  $("download-btn").addEventListener("click", downloadPng);
  $("upload-form").addEventListener("submit", uploadImage);
  setImgBusy(false);
}

document.addEventListener("DOMContentLoaded", initDecalTool);
