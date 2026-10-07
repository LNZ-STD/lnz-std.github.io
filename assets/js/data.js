/*
 * LNZ.STD — site data
 * Edit this file to change links, products and free assets.
 * No other file needs to be touched for day-to-day updates.
 */

const DISCORD = "https://discord.gg/cpPEJy2QH";

const SITE = {
  discordInvite: DISCORD,
  // Your store on the external platform (Gumroad / Lemon Squeezy / Payhip)
  storeUrl: "https://eiserleinze.gumroad.com",
  contactEmail: "hello@lnz.studio",
  // Upload relay for the Audio Uploader (your Cloudflare Worker URL, see worker/README.md).
  // Leave empty until the worker is deployed — editing and MP3 download still work.
  uploadProxy: "",
  socials: [
    { label: "Discord", url: DISCORD },
    { label: "Roblox", url: "https://www.roblox.com/" },
    { label: "YouTube", url: "https://youtube.com/" },
  ],
};

// Paid products — "buyUrl" goes to the external checkout page.
// The platform handles payment, file delivery and license keys.
// "image" is the card cover (4:3). Placeholder covers live in assets/img/products/.
const PRODUCTS = [
  {
    id: "P01",
    name: "LNZ.STD Music System",
    category: "System",
    price: "TBA",
    description: "Background music for your game with a clean player UI: play, pause, skip, volume and a playlist you set up in minutes.",
    license: "Licensed — see terms",
    image: "assets/img/products/music-system.svg",
    buyUrl: "https://eiserleinze.gumroad.com/l/music-system",
  },
  {
    id: "P02",
    name: "LNZ.STD Donate Effect",
    category: "Effect",
    price: "TBA",
    description: "Make every donation feel big. An on-screen effect with the donor's name and amount that the whole server can see.",
    license: "Licensed — see terms",
    image: "assets/img/products/donate-effect.svg",
    buyUrl: "https://eiserleinze.gumroad.com/l/donate-effect",
  },
  {
    id: "P03",
    name: "LNZ.STD Shop",
    category: "System",
    price: "TBA",
    description: "A ready-made in-game shop with item grid, prices and purchase flow. Add your own items and start selling.",
    license: "Licensed — see terms",
    image: "assets/img/products/shop.svg",
    buyUrl: "https://eiserleinze.gumroad.com/l/shop",
  },
  {
    id: "P04",
    name: "LNZ.STD Title",
    category: "System",
    price: "TBA",
    description: "Custom titles above player names. Reward VIPs, donors and veterans with a tag everyone notices.",
    license: "Licensed — see terms",
    image: "assets/img/products/title.svg",
    buyUrl: "https://eiserleinze.gumroad.com/l/title",
  },
];

// Free Roblox assets — downloads unlock after joining Discord + registering.
const FREE_ASSETS = [
  {
    id: "F01",
    name: "LNZ.STD Loading Screen",
    category: "UI",
    description: "A clean, branded loading screen with a progress bar. Drop it in and give your game a polished first impression.",
    image: "assets/img/products/loading-screen.svg",
    downloadUrl: "#",
  },
];

// Developer tools
const TOOLS = {
  // Free Roblox uploads per registered member (who joined the Discord)
  freeUploads: 20,
};
