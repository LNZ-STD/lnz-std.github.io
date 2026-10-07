/*
 * LNZ.STD — site data
 * Edit this file to change links, products and free assets.
 * No other file needs to be touched for day-to-day updates.
 */

const SITE = {
  // Replace with your real Discord invite
  discordInvite: "https://discord.gg/YOUR-INVITE",
  // Your store on the external platform (Gumroad / Lemon Squeezy / Payhip)
  storeUrl: "https://eiserleinze.gumroad.com",
  contactEmail: "hello@lnz.studio",
  socials: [
    { label: "Discord", url: "https://discord.gg/YOUR-INVITE" },
    { label: "Roblox", url: "https://www.roblox.com/" },
    { label: "YouTube", url: "https://youtube.com/" },
  ],
};

// Paid products — "buyUrl" goes to the external checkout page.
// The platform handles payment, file delivery and license keys.
const PRODUCTS = [
  {
    id: "P01",
    name: "Product Name One",
    category: "System",
    price: "$12",
    description: "Short description of what the buyer gets. One or two lines is enough.",
    license: "Personal + Commercial",
    buyUrl: "https://eiserleinze.gumroad.com/l/product-one",
  },
  {
    id: "P02",
    name: "Product Name Two",
    category: "UI Kit",
    price: "$8",
    description: "Short description of what the buyer gets. One or two lines is enough.",
    license: "Personal",
    buyUrl: "https://eiserleinze.gumroad.com/l/product-two",
  },
  {
    id: "P03",
    name: "Product Name Three",
    category: "Map",
    price: "$20",
    description: "Short description of what the buyer gets. One or two lines is enough.",
    license: "Personal + Commercial",
    buyUrl: "https://eiserleinze.gumroad.com/l/product-three",
  },
];

// Free Roblox assets — downloads unlock after joining Discord + registering.
const FREE_ASSETS = [
  {
    id: "F01",
    name: "Free Asset One",
    category: "Model",
    description: "Short description of the asset.",
    downloadUrl: "#",
  },
  {
    id: "F02",
    name: "Free Asset Two",
    category: "Script",
    description: "Short description of the asset.",
    downloadUrl: "#",
  },
  {
    id: "F03",
    name: "Free Asset Three",
    category: "Texture",
    description: "Short description of the asset.",
    downloadUrl: "#",
  },
  {
    id: "F04",
    name: "Free Asset Four",
    category: "Plugin",
    description: "Short description of the asset.",
    downloadUrl: "#",
  },
];
