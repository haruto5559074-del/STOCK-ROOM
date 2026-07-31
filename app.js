/* =========================================================
   STOCKROOM — app.js
   Vanilla JS SPA: hash router + Fake Store API + cart
   persisted to localStorage.
   ========================================================= */
(() => {
  "use strict";

  const API_BASE = "https://fakestoreapi.com";
  const CART_KEY = "stockroom.cart.v1";

  const appEl   = document.getElementById("app");
  const toastHost = document.getElementById("toastHost");

  /* ---------------- Utilities ---------------- */
  const money = (n) => `$${Number(n).toFixed(2)}`;
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast${type === "error" ? " error" : ""}`;
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  /* ---------------- Data cache ---------------- */
  const store = {
    products: [],
    categories: [],
    loaded: false,
  };

  async function loadProducts() {
    if (store.loaded) return store.products;
    const [productsRes, catsRes] = await Promise.all([
      fetch(`${API_BASE}/products`),
      fetch(`${API_BASE}/products/categories`),
    ]);
    if (!productsRes.ok) throw new Error("Failed to load products");
    store.products = await productsRes.json();
    store.categories = catsRes.ok ? await catsRes.json() : [...new Set(store.products.map((p) => p.category))];
    store.loaded = true;
    return store.products;
  }

  /* ---------------- Cart (persisted) ---------------- */
  const Cart = {
    items: [], // {id, title, price, image, category, qty}

    load() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        this.items = raw ? JSON.parse(raw) : [];
      } catch {
        this.items = [];
      }
    },
    save() {
      localStorage.setItem(CART_KEY, JSON.stringify(this.items));
      this.render();
    },
    add(product, qty = 1) {
      const existing = this.items.find((i) => i.id === product.id);
      if (existing) {
        existing.qty += qty;
      } else {
        this.items.push({
          id: product.id,
          title: product.title,
          price: product.price,
          image: product.image,
          category: product.category,
          qty,
        });
      }
      this.save();
      toast(`Added to cart · ${product.title.slice(0, 34)}${product.title.length > 34 ? "…" : ""}`);
    },
    setQty(id, qty) {
      const item = this.items.find((i) => i.id === id);
      if (!item) return;
      if (qty <= 0) {
        this.remove(id);
        return;
      }
      item.qty = qty;
      this.save();
    },
    remove(id) {
      this.items = this.items.filter((i) => i.id !== id);
      this.save();
    },
    clear() {
      this.items = [];
      this.save();
    },
    count() {
      return this.items.reduce((sum, i) => sum + i.qty, 0);
    },
    total() {
      return this.items.reduce((sum, i) => sum + i.qty * i.price, 0);
    },

    /* ---- rendering: cart badge + drawer ---- */
    render() {
      const countEl = document.getElementById("cartCount");
      const drawerCountEl = document.getElementById("drawerCount");
      const itemsEl = document.getElementById("cartItems");
      const totalEl = document.getElementById("cartTotal");
      const checkoutBtn = document.getElementById("checkoutBtn");

      const n = this.count();
      countEl.textContent = n;
      drawerCountEl.textContent = `${n} item${n === 1 ? "" : "s"}`;
      checkoutBtn.disabled = n === 0;

      const prevTotal = totalEl.textContent;
      totalEl.textContent = money(this.total());
      if (prevTotal !== totalEl.textContent) {
        totalEl.classList.remove("bump");
        void totalEl.offsetWidth;
        totalEl.classList.add("bump");
      }

      if (this.items.length === 0) {
        itemsEl.innerHTML = `
          <div class="cart-empty">
            <span class="state-icon">◫</span>
            <p>Your cart is empty.<br>Browse the shelves and tag something.</p>
          </div>`;
        return;
      }

      const tpl = document.getElementById("tpl-cart-line");
      itemsEl.innerHTML = "";
      this.items.forEach((item) => {
        const node = tpl.content.cloneNode(true);
        node.querySelector(".cart-line-img").src = item.image;
        node.querySelector(".cart-line-img").alt = item.title;
        node.querySelector(".cart-line-title").textContent = item.title;
        node.querySelector(".cart-line-price").textContent = money(item.price);
        node.querySelector(".qty-value").textContent = item.qty;
        node.querySelector(".qty-minus").addEventListener("click", () => Cart.setQty(item.id, item.qty - 1));
        node.querySelector(".qty-plus").addEventListener("click", () => Cart.setQty(item.id, item.qty + 1));
        node.querySelector(".cart-line-remove").addEventListener("click", () => Cart.remove(item.id));
        itemsEl.appendChild(node);
      });
    },
  };

  /* ---------------- Cart drawer open/close ---------------- */
  const overlay = document.getElementById("cartOverlay");
  const drawer = document.getElementById("cartDrawer");
  function openCart() {
    overlay.hidden = false;
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeCart() {
    overlay.hidden = true;
    drawer.hidden = true;
    document.body.style.overflow = "";
  }
  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("closeCartBtn").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  document.getElementById("checkoutBtn").addEventListener("click", () => {
    closeCart();
    location.hash = "#/checkout";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) closeCart();
  });

  /* ---------------- Filter state (listing view) ---------------- */
  const filterState = { q: "", category: "all" };

  /* ---------------- Views ---------------- */

  function skeletonGrid(n = 8) {
    let html = '<div class="p-grid">';
    for (let i = 0; i < n; i++) {
      html += `
        <div class="skeleton-card">
          <div class="skeleton-media"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>`;
    }
    html += "</div>";
    return html;
  }

  async function renderHome() {
    appEl.innerHTML = `
      <section class="hero">
        <div class="wrap">
          <span class="hero-eyebrow">LIVE FEED · WAREHOUSE FLOOR</span>
          <h1>TODAY'S <em>INVENTORY</em></h1>
          <p>Every item on the floor, logged and tagged. Search the shelves, filter by category, and check out when you're ready — nothing here needs a real card number.</p>
        </div>
      </section>
      <section class="filter-bar">
        <div class="wrap filter-row">
          <div class="chip-group" id="chipGroup">
            <button class="chip active" data-cat="all">All</button>
          </div>
          <span class="result-count" id="resultCount"></span>
        </div>
      </section>
      <section class="grid-section">
        <div class="wrap" id="gridWrap">${skeletonGrid()}</div>
      </section>
    `;

    const searchInput = document.getElementById("searchInput");
    searchInput.value = filterState.q;
    searchInput.oninput = (e) => {
      filterState.q = e.target.value;
      paintGrid();
    };

    try {
      await loadProducts();
    } catch (err) {
      document.getElementById("gridWrap").innerHTML = `
        <div class="state-block">
          <div class="state-icon">▨</div>
          <h3>Inventory feed is down</h3>
          <p>Couldn't reach the product catalog. Check your connection and try again.</p>
          <button class="btn" onclick="location.reload()">RETRY</button>
        </div>`;
      return;
    }

    const chipGroup = document.getElementById("chipGroup");
    store.categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.cat = cat;
      btn.textContent = cat;
      chipGroup.appendChild(btn);
    });
    chipGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      filterState.category = btn.dataset.cat;
      [...chipGroup.children].forEach((c) => c.classList.toggle("active", c === btn));
      paintGrid();
    });
    // sync active chip with current filterState (back-nav)
    [...chipGroup.children].forEach((c) => c.classList.toggle("active", c.dataset.cat === filterState.category));

    paintGrid();
  }

  function paintGrid() {
    const gridWrap = document.getElementById("gridWrap");
    const resultCount = document.getElementById("resultCount");
    if (!gridWrap) return;

    let list = store.products;
    if (filterState.category !== "all") {
      list = list.filter((p) => p.category === filterState.category);
    }
    if (filterState.q.trim()) {
      const q = filterState.q.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }

    resultCount.textContent = `${list.length} ITEM${list.length === 1 ? "" : "S"}`;

    if (list.length === 0) {
      gridWrap.innerHTML = `
        <div class="state-block">
          <div class="state-icon">⌕</div>
          <h3>Nothing tagged like that</h3>
          <p>No items match "${escapeHtml(filterState.q)}". Try another search or clear the category filter.</p>
        </div>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "p-grid";
    const tpl = document.getElementById("tpl-product-card");

    list.forEach((p, idx) => {
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector(".p-card");
      card.style.animationDelay = `${Math.min(idx * 35, 400)}ms`;

      const mediaLink = node.querySelector(".p-card-media");
      mediaLink.href = `#/product/${p.id}`;
      node.querySelector(".p-card-media img").src = p.image;
      node.querySelector(".p-card-media img").alt = p.title;
      node.querySelector(".p-card-tag").textContent = p.category;

      node.querySelector(".p-card-eyebrow").textContent = `SKU-${String(p.id).padStart(4, "0")}`;
      const titleLink = node.querySelector(".p-card-title");
      titleLink.textContent = p.title;
      titleLink.href = `#/product/${p.id}`;

      node.querySelector(".price-sticker").textContent = money(p.price);
      node.querySelector(".btn-add").addEventListener("click", () => Cart.add(p, 1));

      grid.appendChild(node);
    });

    gridWrap.innerHTML = "";
    gridWrap.appendChild(grid);
  }

  async function renderProduct(id) {
    appEl.innerHTML = `<div class="wrap pd-wrap"><div class="state-block"><div class="state-icon">◫</div><h3>Loading item…</h3></div></div>`;
    try {
      await loadProducts();
    } catch {
      appEl.innerHTML = `<div class="wrap pd-wrap"><div class="state-block"><h3>Couldn't load this item</h3></div></div>`;
      return;
    }
    const p = store.products.find((x) => String(x.id) === String(id));
    if (!p) {
      appEl.innerHTML = `
        <div class="wrap pd-wrap">
          <div class="state-block">
            <div class="state-icon">▨</div>
            <h3>Item not found</h3>
            <p>This SKU isn't on the floor. It may have been delisted.</p>
            <a class="btn" href="#/">BACK TO INVENTORY</a>
          </div>
        </div>`;
      return;
    }

    const rating = p.rating || { rate: 0, count: 0 };
    const fullStars = Math.round(rating.rate);
    const starStr = "★".repeat(fullStars) + "☆".repeat(5 - fullStars);

    appEl.innerHTML = `
      <div class="wrap pd-wrap view">
        <div class="breadcrumb"><a href="#/">INVENTORY</a> / <a href="#/?cat=${encodeURIComponent(p.category)}">${escapeHtml(p.category)}</a> / SKU-${String(p.id).padStart(4, "0")}</div>
        <div class="pd-grid">
          <div class="pd-media"><img src="${p.image}" alt="${escapeHtml(p.title)}"></div>
          <div class="pd-info">
            <span class="pd-eyebrow">${escapeHtml(p.category)} · SKU-${String(p.id).padStart(4, "0")}</span>
            <h1 class="pd-title">${escapeHtml(p.title)}</h1>
            <div class="pd-rating"><span class="stars">${starStr}</span><span>${rating.rate} rating · ${rating.count} logged reviews</span></div>
            <div class="pd-price">${money(p.price)}</div>
            <p class="pd-desc">${escapeHtml(p.description)}</p>
            <div class="pd-meta">
              <div><span>Category</span><span>${escapeHtml(p.category)}</span></div>
              <div><span>Availability</span><span style="color:var(--green-ok)">In stock</span></div>
            </div>
            <div class="pd-actions">
              <div class="qty-stepper">
                <button class="qty-btn" id="pdMinus" aria-label="Decrease quantity">−</button>
                <span class="qty-value" id="pdQty">1</span>
                <button class="qty-btn" id="pdPlus" aria-label="Increase quantity">+</button>
              </div>
              <button class="btn btn-primary" id="pdAddBtn">ADD TO CART</button>
            </div>
          </div>
        </div>
      </div>
    `;

    let qty = 1;
    const qtyEl = document.getElementById("pdQty");
    document.getElementById("pdMinus").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      qtyEl.textContent = qty;
    });
    document.getElementById("pdPlus").addEventListener("click", () => {
      qty += 1;
      qtyEl.textContent = qty;
    });
    document.getElementById("pdAddBtn").addEventListener("click", () => Cart.add(p, qty));
  }

  function renderCheckout() {
    if (Cart.items.length === 0) {
      appEl.innerHTML = `
        <div class="wrap checkout-wrap">
          <div class="state-block">
            <div class="state-icon">◫</div>
            <h3>Nothing to check out</h3>
            <p>Your cart is empty. Add a few items from the floor first.</p>
            <a class="btn" href="#/">BROWSE INVENTORY</a>
          </div>
        </div>`;
      return;
    }

    const subtotal = Cart.total();
    const shipping = subtotal > 75 || subtotal === 0 ? 0 : 6.5;
    const tax = subtotal * 0.05;
    const grand = subtotal + shipping + tax;

    appEl.innerHTML = `
      <div class="wrap checkout-wrap view">
        <h2 class="checkout-title">Checkout summary</h2>
        <p class="checkout-sub">No real payment needed — this confirms your order against the local cart.</p>
        <div class="checkout-grid">
          <form id="checkoutForm">
            <div class="form-row">
              <div class="form-group">
                <label for="fname">First name</label>
                <input type="text" id="fname" required>
              </div>
              <div class="form-group">
                <label for="lname">Last name</label>
                <input type="text" id="lname" required>
              </div>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" required>
            </div>
            <div class="form-group">
              <label for="addr">Shipping address</label>
              <input type="text" id="addr" placeholder="Street, city, postal code" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="city">City</label>
                <input type="text" id="city" required>
              </div>
              <div class="form-group">
                <label for="zip">Postal code</label>
                <input type="text" id="zip" required>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block">CONFIRM ORDER</button>
          </form>

          <aside class="order-summary">
            <h3>Order (${Cart.count()} item${Cart.count() === 1 ? "" : "s"})</h3>
            ${Cart.items
              .map(
                (i) => `
              <div class="order-line">
                <span class="oline-title">${escapeHtml(i.title.slice(0, 40))}${i.title.length > 40 ? "…" : ""} × ${i.qty}</span>
                <span class="oline-price">${money(i.price * i.qty)}</span>
              </div>`
              )
              .join("")}
            <div class="order-totals">
              <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
              <div class="row"><span>Shipping</span><span>${shipping === 0 ? "Free" : money(shipping)}</span></div>
              <div class="row"><span>Tax (5%)</span><span>${money(tax)}</span></div>
              <div class="row grand"><span>Total</span><span>${money(grand)}</span></div>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.getElementById("checkoutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const orderId = `SR-${Date.now().toString(36).toUpperCase()}`;
      const name = document.getElementById("fname").value.trim() || "Customer";
      renderSuccess(orderId, name, grand);
      Cart.clear();
    });
  }

  function renderSuccess(orderId, name, grand) {
    appEl.innerHTML = `
      <div class="wrap">
        <div class="success-block view">
          <div class="success-stamp">LOGGED</div>
          <h2>Order confirmed, ${escapeHtml(name)}.</h2>
          <p>Your order has been recorded on the ledger for ${money(grand)}.</p>
          <p class="order-id">ORDER ID · ${orderId}</p>
          <div style="margin-top:28px;">
            <a class="btn" href="#/">BACK TO INVENTORY</a>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------------- Router ---------------- */
  function parseHash() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const [path, query] = hash.split("?");
    const params = new URLSearchParams(query || "");
    return { path, params };
  }

  async function route() {
    const { path, params } = parseHash();
    closeCart();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    if (path === "/" || path === "") {
      if (params.get("cat")) filterState.category = params.get("cat");
      await renderHome();
    } else if (path.startsWith("/product/")) {
      const id = path.split("/product/")[1];
      await renderProduct(id);
    } else if (path === "/checkout") {
      renderCheckout();
    } else {
      appEl.innerHTML = `
        <div class="wrap">
          <div class="state-block">
            <div class="state-icon">▨</div>
            <h3>Page not found</h3>
            <a class="btn" href="#/">BACK TO INVENTORY</a>
          </div>
        </div>`;
    }
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", () => {
    Cart.load();
    Cart.render();
    route();
  });
})();
