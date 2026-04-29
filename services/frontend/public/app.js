const endpoints = {
  auth: location.hostname === "localhost" ? "http://localhost:3000" : "/api/auth",
  catalog: location.hostname === "localhost" ? "http://localhost:3001" : "/api/catalog",
  cart: location.hostname === "localhost" ? "http://localhost:3002" : "/api/cart",
  checkout: location.hostname === "localhost" ? "http://localhost:3003" : "/api/checkout",
  admin: location.hostname === "localhost" ? "http://localhost:3004" : "/api/admin"
};

const isLoginPage = Boolean(document.querySelector("#authForm"));
const isAppPage = Boolean(document.querySelector("#appShell"));

const state = {
  authMode: "login",
  token: sessionStorage.getItem("shopcloud_token") || "",
  user: JSON.parse(sessionStorage.getItem("shopcloud_user") || "null"),
  products: [],
  cart: [],
  lastOrder: null
};

const els = {
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  notice: document.querySelector("#notice"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  userStatus: document.querySelector("#userStatus"),
  signOutButton: document.querySelector("#signOutButton"),
  authForm: document.querySelector("#authForm"),
  authSubmit: document.querySelector("#authSubmit"),
  roleSelect: document.querySelector("#roleSelect"),
  adminSecretField: document.querySelector("#adminSecretField"),
  productGrid: document.querySelector("#productGrid"),
  productCount: document.querySelector("#productCount"),
  stockCount: document.querySelector("#stockCount"),
  cartItems: document.querySelector("#cartItems"),
  cartTotal: document.querySelector("#cartTotal"),
  cartHint: document.querySelector("#cartHint"),
  invoiceBox: document.querySelector("#invoiceBox"),
  clearCartButton: document.querySelector("#clearCartButton"),
  checkoutButton: document.querySelector("#checkoutButton"),
  statsGrid: document.querySelector("#statsGrid"),
  lowStockList: document.querySelector("#lowStockList"),
  recentOrdersList: document.querySelector("#recentOrdersList"),
  inventoryList: document.querySelector("#inventoryList"),
  productForm: document.querySelector("#productForm")
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

function showNotice(message, tone = "success") {
  els.notice.textContent = message;
  els.notice.className = `notice show ${tone}`;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    els.notice.className = "notice";
  }, 4200);
}

async function api(service, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${endpoints[service]}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Request failed");
  }

  return data;
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  sessionStorage.setItem("shopcloud_token", state.token);
  sessionStorage.setItem("shopcloud_user", JSON.stringify(state.user));
  renderAccess();

  if (isLoginPage) {
    window.location.href = "app.html";
  }
}

function showView(viewName) {
  document.querySelectorAll("[data-view]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}View`).classList.add("active");
}

function renderAccess() {
  if (isLoginPage) {
    return;
  }

  if (!state.user) {
    window.location.href = "index.html";
    return;
  }

  els.userStatus.textContent = `${state.user.name} - ${state.user.role}`;

  document.querySelectorAll("[data-role]").forEach((button) => {
    button.classList.toggle("is-hidden", button.dataset.role !== state.user.role);
  });

  if (state.user.role === "admin") {
    els.workspaceTitle.textContent = "Inventory, revenue, orders, and stock control.";
    showView("admin");
    return;
  }

  els.workspaceTitle.textContent = "Browse products, manage your cart, and checkout.";
  showView("store");
}

function renderProducts() {
  els.productCount.textContent = state.products.length;
  els.stockCount.textContent = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);

  if (!state.products.length) {
    els.productGrid.innerHTML = `<div class="empty-state">No products yet. Load services or add inventory as an admin.</div>`;
    return;
  }

  els.productGrid.innerHTML = state.products.map((product) => `
    <article class="product-card">
      <div class="product-art" aria-hidden="true">${product.name.slice(0, 1).toUpperCase()}</div>
      <div class="product-body">
        <div>
          <h3>${product.name}</h3>
          <p>${product.description || "Curated ShopCloud item"}</p>
        </div>
        <div class="product-footer">
          <div>
            <div class="price">${money(product.price)}</div>
            <div class="stock">${product.stock} in stock</div>
          </div>
          <button class="primary-button" data-add="${product.id}" type="button">Add</button>
        </div>
      </div>
    </article>
  `).join("");
}

function productFor(cartItem) {
  return state.products.find((product) => Number(product.id) === Number(cartItem.productId));
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const product = productFor(item);
    return sum + Number(item.quantity || 0) * Number(product?.price || 0);
  }, 0);
}

function renderCart() {
  if (!state.cart.length) {
    els.cartItems.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
  } else {
    els.cartItems.innerHTML = state.cart.map((item) => {
      const product = productFor(item);
      const name = product?.name || `Product #${item.productId}`;
      const price = Number(product?.price || 0);
      return `
        <article class="line-item">
          <div>
            <h3>${name}</h3>
            <p>${item.quantity} x ${money(price)}</p>
          </div>
          <strong>${money(price * item.quantity)}</strong>
        </article>
      `;
    }).join("");
  }

  els.cartTotal.textContent = money(cartTotal());
}

function renderAdminSkeleton() {
  els.statsGrid.innerHTML = ["Users", "Orders", "Revenue"].map((label) => `
    <div class="stat"><span>${label}</span><strong>-</strong></div>
  `).join("");
  els.lowStockList.innerHTML = `<div class="empty-state">Login as admin to view low stock.</div>`;
  els.recentOrdersList.innerHTML = `<div class="empty-state">Admin orders will appear here.</div>`;
  els.inventoryList.innerHTML = `<div class="empty-state">Load admin data to manage inventory.</div>`;
}

function renderInventory(products) {
  els.inventoryList.innerHTML = products.map((product) => `
    <div class="inventory-row">
      <strong>${product.name}</strong>
      <span>${money(product.price)}</span>
      <input data-stock="${product.id}" type="number" min="0" step="1" value="${product.stock}">
      <button class="ghost-button" data-save-stock="${product.id}" type="button">Save</button>
    </div>
  `).join("");
}

async function loadProducts() {
  state.products = await api("catalog", "/products");
  renderProducts();
  renderCart();
}

async function loadCart() {
  if (!state.token || state.user?.role !== "customer") {
    state.cart = [];
    renderCart();
    return;
  }

  state.cart = await api("cart", "/cart");
  renderCart();
}

async function loadAdmin() {
  const dashboard = await api("admin", "/dashboard");
  const products = await api("admin", "/products");

  els.statsGrid.innerHTML = [
    ["Users", dashboard.users],
    ["Orders", dashboard.orders],
    ["Revenue", money(dashboard.revenue)]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("");

  els.lowStockList.innerHTML = dashboard.lowStockProducts.length
    ? dashboard.lowStockProducts.map((item) => `<div class="mini-item"><strong>${item.name}</strong><span>${item.stock} left</span></div>`).join("")
    : `<div class="empty-state">No low-stock products.</div>`;

  els.recentOrdersList.innerHTML = dashboard.recentOrders.length
    ? dashboard.recentOrders.map((order) => `<div class="mini-item"><strong>#${order.id}</strong><span>${money(order.totalPrice)}</span></div>`).join("")
    : `<div class="empty-state">No orders yet.</div>`;

  renderInventory(products);
}

async function refreshAll() {
  if (!state.user) {
    return;
  }

  if (state.user.role === "admin") {
    await loadAdmin();
    return;
  }

  await loadProducts();
  await loadCart();
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.user || button.dataset.role !== state.user.role) {
      return;
    }

    showView(button.dataset.view);
  });
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    els.authForm.classList.toggle("is-register", state.authMode === "register");
    els.authSubmit.textContent = state.authMode === "register" ? "Create account" : "Login";
    renderAdminSecretField();
  });
});

function renderAdminSecretField() {
  if (!els.adminSecretField || !els.roleSelect) {
    return;
  }

  const shouldShow = state.authMode === "register" && els.roleSelect.value === "admin";
  els.adminSecretField.classList.toggle("is-visible", shouldShow);
  els.adminSecretField.querySelector("input").required = shouldShow;
}

els.roleSelect?.addEventListener("change", renderAdminSecretField);

els.authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.authForm);
  const payload = Object.fromEntries(formData.entries());

  if (state.authMode === "login") {
    delete payload.name;
    delete payload.role;
    delete payload.adminSecret;
  }

  if (state.authMode === "register" && payload.role !== "admin") {
    delete payload.adminSecret;
  }

  try {
    const data = await api("auth", state.authMode === "register" ? "/register" : "/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setSession(data);
    if (isLoginPage) {
      return;
    }
    await refreshAll();
    showNotice(`Welcome, ${data.user.name}.`);
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.signOutButton?.addEventListener("click", () => {
  state.token = "";
  state.user = null;
  state.cart = [];
  sessionStorage.removeItem("shopcloud_token");
  sessionStorage.removeItem("shopcloud_user");
  window.location.href = "index.html";
});

els.productGrid?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  try {
    await api("cart", "/cart/add", {
      method: "POST",
      body: JSON.stringify({ productId: Number(button.dataset.add), quantity: 1 })
    });
    await loadCart();
    showNotice("Added to cart.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.clearCartButton?.addEventListener("click", async () => {
  try {
    await api("cart", "/cart", { method: "DELETE" });
    state.cart = [];
    renderCart();
    showNotice("Cart cleared.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.checkoutButton?.addEventListener("click", async () => {
  try {
    const data = await api("checkout", "/checkout", { method: "POST" });
    state.lastOrder = data.order;
    state.cart = [];
    renderCart();
    els.invoiceBox.innerHTML = `<strong>Order #${data.order.id} placed.</strong><span>Invoice is generating.</span>`;
    window.setTimeout(async () => {
      try {
        const invoice = await api("checkout", `/orders/${data.order.id}/invoice`);
        els.invoiceBox.innerHTML = `
          <strong>${invoice.invoiceNumber}</strong>
          <span>${invoice.emailStatus} to ${invoice.customerEmail}</span>
          <button class="ghost-button" data-open-invoice="${data.order.id}" type="button">Open invoice PDF</button>
        `;
      } catch (err) {
        els.invoiceBox.innerHTML = `<span>${err.message}</span>`;
      }
    }, 1300);
    showNotice("Order placed successfully.");
    await loadProducts();
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.invoiceBox?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-open-invoice]");
  if (!button) return;

  try {
    const response = await fetch(`${endpoints.checkout}/orders/${button.dataset.openInvoice}/invoice.pdf`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });

    if (!response.ok) {
      throw new Error("Invoice PDF is not ready yet");
    }

    const blob = await response.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noreferrer");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

document.querySelector("#refreshButton")?.addEventListener("click", async () => {
  try {
    await refreshAll();
    showNotice("Store refreshed.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

document.querySelector("#loadAdminButton")?.addEventListener("click", async () => {
  try {
    await loadAdmin();
    showNotice("Admin dashboard loaded.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.productForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.productForm).entries());

  try {
    await api("admin", "/products", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        price: Number(payload.price),
        stock: Number(payload.stock)
      })
    });
    els.productForm.reset();
    await loadProducts();
    await loadAdmin();
    showNotice("Product added.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

els.inventoryList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-stock]");
  if (!button) return;

  const productId = button.dataset.saveStock;
  const input = els.inventoryList.querySelector(`[data-stock="${productId}"]`);

  try {
    await api("admin", `/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: Number(input.value) })
    });
    await loadProducts();
    await loadAdmin();
    showNotice("Stock updated.");
  } catch (err) {
    showNotice(err.message, "error");
  }
});

renderAccess();
renderAdminSecretField();
if (isAppPage) {
  renderAdminSkeleton();
  refreshAll().catch((err) => showNotice(err.message, "error"));
}
