# LNZ.STD — Leinze Studio website

Static site (HTML/CSS/JS, no build step). Open `index.html` in a browser to preview.

## Pages
- `index.html` — hero, paid products, free Roblox assets, about
- `register.html` — registration for free assets (Discord + register)
- `license.html` — license for paid products and terms for free assets

## Editing content
All links, products and free assets live in **`assets/js/data.js`**:
- `SITE.discordInvite`, `SITE.storeUrl`, `SITE.contactEmail`, `SITE.socials`
- `PRODUCTS` — paid items; `buyUrl` points to the external store (Gumroad / Lemon Squeezy / Payhip)
- `FREE_ASSETS` — free items; `downloadUrl` is the file link

Theme colours are CSS variables at the top of `assets/css/style.css`. The logo is `assets/img/logo.svg`.

## Known limitations
Registration is a front-end placeholder stored in `localStorage`, so it is not secure.
Replace it with a real backend (e.g. Discord OAuth with a server-membership check) before launch.
