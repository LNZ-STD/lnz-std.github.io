/*
 * LNZ.STD — page behaviour
 *
 * NOTE: membership is a front-end placeholder stored in localStorage.
 * It is NOT secure — anyone can bypass it. Replace with a real backend
 * (e.g. Discord OAuth + guild check, or Supabase auth) before launch.
 */

const MEMBER_KEY = "lnz_member";

const Member = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(MEMBER_KEY));
    } catch {
      return null;
    }
  },
  set(data) {
    try {
      localStorage.setItem(MEMBER_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      localStorage.removeItem(MEMBER_KEY);
    } catch {}
  },
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) node.append(child);
  return node;
}

function applySiteLinks() {
  document.querySelectorAll("[data-link]").forEach((a) => {
    const key = a.dataset.link;
    if (key === "discord") a.href = SITE.discordInvite;
    if (key === "store") a.href = SITE.storeUrl;
    if (key === "email") {
      a.href = `mailto:${SITE.contactEmail}`;
      a.textContent = SITE.contactEmail;
    }
  });

  const socials = document.getElementById("socials");
  if (socials) {
    SITE.socials.forEach((s) =>
      socials.append(el("li", {}, el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.label })))
    );
  }

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
}

function thumb(item, extraClass = "") {
  const children = [];
  if (item.image) children.push(el("img", { class: "card__img", src: item.image, alt: "", loading: "lazy" }));
  children.push(el("span", { class: "card__id", text: item.id }), el("span", { class: "card__cat", text: item.category }));
  return el("div", { class: `card__thumb ${extraClass}`.trim() }, children);
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  PRODUCTS.forEach((p) => {
    grid.append(
      el("article", { class: "card" }, [
        thumb(p),
        el("div", { class: "card__body" }, [
          el("h3", { class: "card__title", text: p.name }),
          el("p", { class: "card__desc", text: p.description }),
          el("p", { class: "card__meta", text: `License — ${p.license}` }),
        ]),
        el("div", { class: "card__foot" }, [
          el("span", { class: "card__price", text: p.price }),
          el("a", { class: "btn btn--accent", href: p.buyUrl, target: "_blank", rel: "noopener", text: "Buy ↗" }),
        ]),
      ])
    );
  });
}

function renderFreeAssets() {
  const grid = document.getElementById("free-grid");
  if (!grid) return;
  const member = Member.get();

  FREE_ASSETS.forEach((a) => {
    const action = member
      ? el("a", { class: "btn btn--ghost", href: a.downloadUrl, download: "", text: "Download ↓" })
      : el("a", { class: "btn btn--ghost btn--locked", href: "register.html", text: "Unlock ↗" });

    grid.append(
      el("article", { class: "card card--free" }, [
        thumb(a, "card__thumb--free"),
        el("div", { class: "card__body" }, [
          el("h3", { class: "card__title", text: a.name }),
          el("p", { class: "card__desc", text: a.description }),
        ]),
        el("div", { class: "card__foot" }, [el("span", { class: "card__price card__price--free", text: "Free" }), action]),
      ])
    );
  });

  const status = document.getElementById("member-status");
  if (status && member) {
    status.innerHTML = "";
    status.append(
      el("span", { text: `Signed in as ${member.username}. Downloads unlocked. ` }),
      el("button", { class: "linklike", type: "button", id: "sign-out", text: "Sign out" })
    );
    document.getElementById("sign-out").addEventListener("click", () => {
      Member.clear();
      location.reload();
    });
  }
}

function setupRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;
  const msg = document.getElementById("form-msg");

  const existing = Member.get();
  if (existing) {
    msg.textContent = `You're already registered as ${existing.username}.`;
    msg.className = "form__msg form__msg--ok";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    if (data.password.length < 8) {
      msg.textContent = "Password must be at least 8 characters.";
      msg.className = "form__msg form__msg--err";
      return;
    }
    if (!data.joinedDiscord) {
      msg.textContent = "Join the LNZ Studio Discord first, then tick the box.";
      msg.className = "form__msg form__msg--err";
      return;
    }

    // Never keep the password client-side.
    const saved = Member.set({
      username: data.username,
      email: data.email,
      roblox: data.roblox,
      discord: data.discord,
      registeredAt: new Date().toISOString(),
    });

    if (!saved) {
      msg.textContent = "Couldn't save your registration in this browser. Check that site storage is allowed.";
      msg.className = "form__msg form__msg--err";
      return;
    }
    msg.textContent = "Registered. Taking you to the free assets…";
    msg.className = "form__msg form__msg--ok";
    setTimeout(() => (location.href = "index.html#free"), 900);
  });
}

// Signed-in members get "Profile" in the nav instead of "Register"
function setupMemberNav() {
  if (!Member.get()) return;
  document.querySelectorAll('.nav__links a[href="register.html"], .footer a[href="register.html"]').forEach((a) => {
    a.href = "profile.html";
    a.textContent = "Profile";
    if (a.closest(".nav__links") && location.pathname.endsWith("/profile.html")) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function setupNav() {
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.querySelector(".nav__links");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
  });
  menu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

document.addEventListener("DOMContentLoaded", () => {
  applySiteLinks();
  setupMemberNav();
  setupNav();
  renderProducts();
  renderFreeAssets();
  setupRegisterForm();
});
