# LNZ.STD — Leinze Studio website

Live at **https://lnz-std.github.io**

Static site (HTML/CSS/JS, no build step). Open `index.html` in a browser to preview.

## Pages
- `index.html` — hero, paid products, free Roblox assets, about
- `register.html` — registration for free assets (Discord + register)
- `license.html` — license for paid products and terms for free assets
- `tools.html` — Audio Uploader: cut, speed/pitch, cover, upload to Roblox
- `decal.html` — Image Uploader: crop/resize, upload to Roblox as a decal
- `profile.html` — member profile and upload library with folders

The tools are for registered members and share 20 free Roblox uploads (`TOOLS.freeUploads`).
Shared upload/library code is in `assets/js/roblox.js`.

## Editing content
All links, products and free assets live in **`assets/js/data.js`**:
- `SITE.discordInvite`, `SITE.storeUrl`, `SITE.contactEmail`, `SITE.socials`
- `PRODUCTS` — paid items; `buyUrl` points to the external store (Gumroad / Lemon Squeezy / Payhip)
- `FREE_ASSETS` — free items; `downloadUrl` is the file link

- `SITE.uploadProxy` — URL of the Roblox upload relay (see `worker/README.md`)
- `TOOLS.freeUploads` — free Roblox uploads per member

Theme colours are CSS variables at the top of `assets/css/style.css`. The logo is `assets/img/logo.svg`.

## Known limitations
Registration is a front-end placeholder stored in `localStorage`, so it is not secure.
Replace it with a real backend (e.g. Discord OAuth with a server-membership check) before launch.
The tools' upload allowance and the profile library are stored the same way, so it can also be reset by clearing site data.
