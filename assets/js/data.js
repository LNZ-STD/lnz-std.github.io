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
  socials: [
    { label: "Discord", url: DISCORD },
    { label: "Roblox", url: "https://www.roblox.com/" },
    { label: "YouTube", url: "https://youtube.com/" },
  ],
};

// Paid products — "buyUrl" goes to the external checkout page.
// The platform handles payment, file delivery and license keys.
const PRODUCTS = [
  {
    id: "P01",
    name: "LNZ.STD Music System",
    category: "System",
    price: "TBA",
    description: "An in-game music system for Roblox experiences, built by Leinze Studio.",
    license: "Licensed — see terms",
    buyUrl: "https://eiserleinze.gumroad.com/l/music-system",
  },
  {
    id: "P02",
    name: "LNZ.STD Donate Effect",
    category: "Effect",
    price: "TBA",
    description: "Visual effects that play when a player donates in your game.",
    license: "Licensed — see terms",
    buyUrl: "https://eiserleinze.gumroad.com/l/donate-effect",
  },
  {
    id: "P03",
    name: "LNZ.STD Shop",
    category: "System",
    price: "TBA",
    description: "A shop system for selling items in your Roblox game.",
    license: "Licensed — see terms",
    buyUrl: "https://eiserleinze.gumroad.com/l/shop",
  },
  {
    id: "P04",
    name: "LNZ.STD Title",
    category: "System",
    price: "TBA",
    description: "A title system for showing player titles in your Roblox game.",
    license: "Licensed — see terms",
    buyUrl: "https://eiserleinze.gumroad.com/l/title",
  },
];

// Free Roblox assets — downloads unlock after joining Discord + registering.
const FREE_ASSETS = [
  {
    id: "F01",
    name: "LNZ.STD Loading Screen",
    category: "UI",
    description: "A clean loading screen for your Roblox game, styled by Leinze Studio.",
    downloadUrl: "#",
  },
];
