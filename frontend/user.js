const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const pageState = {
  cars: [],
  carBookings: {},
  status: { active: [], past: [] },
  history: [],
  discounts: [],
  notifications: [],
  bookingIndex: new Map(),
  datePicker: {
    carId: null,
    field: "",
    month: "",
  },
  filters: {
    carSearch: "",
    carLocation: "all",
    historySearch: "",
    historyFilter: "all",
  },
};

const dom = {};
let siteNavMediaQuery = null;
let voiceAssistantEventsBound = false;

document.addEventListener("DOMContentLoaded", () => {
  cacheCommonDom();
  setupResponsiveNavigation();
  bindGlobalEvents();
  renderNavigation();

  const initializer = pageInitializers[getPageName()];
  if (initializer) {
    initializer().catch((error) => {
      console.error("Page initialization failed:", error);
      showToast(error.message || "Something went wrong while loading the page.", "error");
    });
  }

  initializeVoiceAssistantIfAvailable();
});

const pageInitializers = {
  landing: initLandingPage,
  login: initLoginPage,
  register: initRegisterPage,
  home: initHomePage,
  book: initBookPage,
  history: initHistoryPage,
  "booking-alias": initBookingAliasPage,
};

function cacheCommonDom() {
  [
    "siteNavLinks",
    "siteNavActions",
    "toastRoot",
    "modalRoot",
    "landingGreeting",
    "landingActions",
    "landingStatusCard",
    "loginForm",
    "loginFeedback",
    "loginSubmitBtn",
    "registerForm",
    "registerFeedback",
    "registerSubmitBtn",
    "homeGreeting",
    "homeSubtitle",
    "homePriorityCard",
    "homeMetrics",
    "homeOffers",
    "homeNotifications",
    "homeActiveList",
    "homePastList",
    "bookingHeroNote",
    "discountSpotlight",
    "carSearchInput",
    "carLocationSelect",
    "carGrid",
    "historySummary",
    "historyMetrics",
    "historySearchInput",
    "historyFilterBar",
    "discountStrip",
    "historyList",
    "redirectCopy",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });

  dom.siteHeader = document.querySelector(".site-header");
  dom.siteNavCluster = dom.siteHeader?.querySelector(".nav-cluster") || null;
  dom.siteNavToggle = document.getElementById("siteNavToggle");
}

function bindGlobalEvents() {
  document.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    const action = actionEl.dataset.action;
    if (action === "toggle-nav") {
      toggleResponsiveNavigation();
      return;
    }

    if (action === "logout") {
      logoutAndRedirect();
      return;
    }

    if (action === "close-modal") {
      pageState.datePicker = { carId: null, field: "", month: "" };
      closeModal();
      return;
    }

    if (action === "alias-forward") {
      window.location.replace("/history.html");
      return;
    }

    if (action === "open-date-picker") {
      openBookingDatePicker(actionEl);
      return;
    }

    if (action === "calendar-prev-month") {
      shiftBookingDatePickerMonth(-1);
      return;
    }

    if (action === "calendar-next-month") {
      shiftBookingDatePickerMonth(1);
      return;
    }

    if (action === "pick-booking-date") {
      applyBookingDateSelection(actionEl);
      return;
    }

    if (action === "view-car-availability") {
      openCarAvailabilityModal(Number(actionEl.dataset.carId));
      return;
    }

    const bookingId = Number(actionEl.dataset.bookingId);
    if (!bookingId) {
      return;
    }

    const booking = findBookingById(bookingId);
    if (!booking) {
      showToast("That booking could not be found anymore. Refresh the page and try again.", "warning");
      return;
    }

    if (action === "pay-booking") {
      await startPaymentFlow(booking);
      return;
    }

    if (action === "cancel-booking") {
      await cancelBooking(booking);
      return;
    }

    if (action === "show-collection") {
      openQrModal({
        title: "Collection QR",
        subtitle: `Use this QR when you pick up ${booking.brand} ${booking.model}.`,
        qr: booking.collection_qr,
        filename: `collection_qr_${bookingId}.png`,
      });
      return;
    }

    if (action === "show-return") {
      openQrModal({
        title: "Return QR",
        subtitle: `Keep this QR ready for the final handoff of ${booking.brand} ${booking.model}.`,
        qr: booking.return_qr,
        filename: `return_qr_${bookingId}.png`,
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function setupResponsiveNavigation() {
  if (!dom.siteHeader || !dom.siteNavCluster) {
    return;
  }

  dom.siteNavCluster.id = dom.siteNavCluster.id || "siteNavCluster";

  if (!dom.siteNavToggle) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "siteNavToggle";
    toggle.className = "nav-toggle";
    toggle.dataset.action = "toggle-nav";
    toggle.setAttribute("aria-controls", dom.siteNavCluster.id);
    dom.siteHeader.insertBefore(toggle, dom.siteNavCluster);
    dom.siteNavToggle = toggle;
  }

  if (!siteNavMediaQuery) {
    siteNavMediaQuery = window.matchMedia("(max-width: 760px)");
    const syncNav = () => syncResponsiveNavigation();
    if (typeof siteNavMediaQuery.addEventListener === "function") {
      siteNavMediaQuery.addEventListener("change", syncNav);
    } else {
      siteNavMediaQuery.addListener(syncNav);
    }
  }

  syncResponsiveNavigation();
}

function toggleResponsiveNavigation() {
  if (!siteNavMediaQuery?.matches || !dom.siteHeader) {
    return;
  }

  dom.siteHeader.classList.toggle("is-nav-open");
  syncResponsiveNavigation();
}

function syncResponsiveNavigation() {
  if (!dom.siteHeader || !dom.siteNavToggle) {
    return;
  }

  const compact = Boolean(siteNavMediaQuery?.matches);
  if (!compact) {
    dom.siteHeader.classList.remove("is-nav-open");
  }

  const expanded = compact && dom.siteHeader.classList.contains("is-nav-open");
  dom.siteNavToggle.hidden = !compact;
  dom.siteNavToggle.textContent = expanded ? "Close" : "Menu";
  dom.siteNavToggle.setAttribute("aria-expanded", compact ? String(expanded) : "false");
}

function getPageName() {
  return document.body.dataset.page || "";
}

function readUserSession() {
  return {
    token: localStorage.getItem("auth_token"),
    customerId: localStorage.getItem("customer_id"),
    name: localStorage.getItem("customer_name"),
    email: localStorage.getItem("customer_email"),
  };
}

function hasUserSession() {
  const session = readUserSession();
  return Boolean(session.customerId && session.token);
}

function hasAdminSession() {
  return (
    sessionStorage.getItem("adminLoggedIn") === "true" &&
    Boolean(sessionStorage.getItem("adminToken"))
  );
}

function setUserSession(payload) {
  if (payload.token) {
    localStorage.setItem("auth_token", payload.token);
  }
  if (payload.customer_id) {
    localStorage.setItem("customer_id", payload.customer_id);
  }
  if (payload.name) {
    localStorage.setItem("customer_name", payload.name);
  }
  if (payload.email) {
    localStorage.setItem("customer_email", payload.email);
  }
}

function clearUserSession() {
  ["auth_token", "customer_id", "customer_name", "customer_email"].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function clearAdminSession() {
  ["adminLoggedIn", "adminToken"].forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

function ensureUserSession() {
  if (hasUserSession()) {
    return true;
  }

  sessionStorage.setItem("postLoginRedirect", window.location.pathname);
  window.location.replace("/login.html");
  return false;
}

function logoutAndRedirect() {
  clearUserSession();
  clearAdminSession();
  window.location.href = "/index.html";
}

function renderNavigation() {
  if (!dom.siteNavLinks || !dom.siteNavActions) {
    return;
  }

  const page = getPageName();
  const session = readUserSession();
  const links = [];
  let actions = "";

  if (hasUserSession()) {
    links.push(
      navLink("/home.html", "Dashboard", page === "home"),
      navLink("/book.html", "Book a Car", page === "book"),
      navLink("/history.html", "My Bookings", page === "history" || page === "booking-alias")
    );
    actions = `
      <span class="user-pill">${escapeHtml(session.name || "Member")}</span>
      <button class="button button-ghost" type="button" data-action="logout">Logout</button>
    `;
  } else if (hasAdminSession()) {
    links.push(
      navLink("/index.html", "Customer View", page === "landing"),
      navLink("/admin.html", "Admin Panel", false)
    );
    actions = `
      <button class="button button-ghost" type="button" data-action="logout">Logout</button>
    `;
  } else {
    links.push(
      navLink("/index.html", "Overview", page === "landing"),
      navLink("/login.html", "Sign In", page === "login"),
      navLink("/register.html", "Create Account", page === "register")
    );
    actions = `
      <a class="button button-secondary" href="/admin.html">Admin</a>
      <a class="button button-primary" href="/register.html">Start Booking</a>
    `;
  }

  dom.siteNavLinks.innerHTML = links.join("");
  dom.siteNavActions.innerHTML = actions;
}

function navLink(href, label, active) {
  return `<a class="nav-link${active ? " active" : ""}" href="${href}">${label}</a>`;
}

async function initLandingPage() {
  if (dom.landingGreeting) {
    if (hasUserSession()) {
      const session = readUserSession();
      dom.landingGreeting.textContent = `Welcome back, ${session.name || "driver"}.`;
    } else if (hasAdminSession()) {
      dom.landingGreeting.textContent = "Admin session detected.";
    } else {
      dom.landingGreeting.textContent = "Modern car rental, rebuilt around the customer flow.";
    }
  }

  if (dom.landingActions) {
    dom.landingActions.innerHTML = buildLandingActions();
  }

  if (!dom.landingStatusCard) {
    return;
  }

  dom.landingStatusCard.innerHTML = `
    <span class="eyebrow">Live Status</span>
    <h3>Loading your current workspace</h3>
    <p>We are checking session state and recent booking context.</p>
  `;

  if (hasUserSession()) {
    try {
      const customerId = readUserSession().customerId;
      const [status, discounts] = await Promise.all([
        fetchJson(`/api/bookings/status/${customerId}`),
        fetchJson(`/api/discounts/${customerId}`).catch(() => []),
      ]);

      const pendingCount = [...status.active, ...status.past].filter(isAwaitingPayment).length;
      dom.landingStatusCard.innerHTML = `
        <span class="hero-chip">Signed in</span>
        <h3>${status.active.length} active booking${status.active.length === 1 ? "" : "s"} on your side.</h3>
        <p>${pendingCount ? `${pendingCount} payment${pendingCount === 1 ? "" : "s"} still need attention.` : "You are caught up on payments right now."}</p>
        <div class="badge-row">
          <span class="status-badge badge-sky">${status.past.length} past trips</span>
          <span class="status-badge badge-success">${discounts.length} available offer${discounts.length === 1 ? "" : "s"}</span>
        </div>
      `;
    } catch (error) {
      dom.landingStatusCard.innerHTML = `
        <span class="hero-chip">Signed in</span>
        <h3>Your dashboard is ready.</h3>
        <p>We could not load live booking details just now, but your routes are still available.</p>
      `;
    }
    return;
  }

  if (hasAdminSession()) {
    dom.landingStatusCard.innerHTML = `
      <span class="hero-chip">Admin Session</span>
      <h3>You are signed in as an administrator.</h3>
      <p>Open the admin workspace to manage bookings, cars, payments, and refunds from one place.</p>
    `;
    return;
  }

  dom.landingStatusCard.innerHTML = `
    <span class="hero-chip">For Customers</span>
    <h3>Browse cars, lock dates, pay once, and manage every booking from one clean dashboard.</h3>
    <p>The upgraded customer flow now keeps signup, dashboard, booking, and payment management aligned instead of spread across duplicate screens.</p>
  `;
}

function buildLandingActions() {
  if (hasUserSession()) {
    return `
      <a class="button button-primary" href="/home.html">Open Dashboard</a>
      <a class="button button-warm" href="/book.html">Book Another Car</a>
      <a class="button button-secondary" href="/history.html">Review Bookings</a>
    `;
  }

  if (hasAdminSession()) {
    return `
      <a class="button button-primary" href="/admin.html">Go to Admin Panel</a>
      <a class="button button-secondary" href="/login.html">Switch to Customer Login</a>
    `;
  }

  return `
    <a class="button button-primary" href="/register.html">Create Your Account</a>
    <a class="button button-warm" href="/login.html">Sign In</a>
  `;
}

async function initLoginPage() {
  if (hasUserSession()) {
    window.location.replace("/home.html");
    return;
  }

  dom.loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitBtn = dom.loginSubmitBtn;
    const email = form.email.value.trim();
    const password = form.password.value.trim();

    if (!email || !password) {
      setFeedback(dom.loginFeedback, "Enter both email and password.", "error");
      return;
    }

    setFeedback(dom.loginFeedback, "", "error");
    setButtonBusy(submitBtn, true, "Signing in...");

    try {
      const result = await fetchJson("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      clearAdminSession();
      setUserSession(result);
      showToast(result.message || "Login successful.", "success");

      const redirectTarget = sessionStorage.getItem("postLoginRedirect") || "/home.html";
      sessionStorage.removeItem("postLoginRedirect");
      window.location.href = redirectTarget;
    } catch (error) {
      setFeedback(dom.loginFeedback, error.message || "Login failed.", "error");
    } finally {
      setButtonBusy(submitBtn, false);
    }
  });
}

async function initRegisterPage() {
  if (hasUserSession()) {
    window.location.replace("/home.html");
    return;
  }

  dom.registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitBtn = dom.registerSubmitBtn;
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      password: form.password.value.trim(),
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.password) {
      setFeedback(dom.registerFeedback, "Complete all four fields before creating your account.", "error");
      return;
    }

    setFeedback(dom.registerFeedback, "", "error");
    setButtonBusy(submitBtn, true, "Creating account...");

    try {
      const result = await fetchJson("/api/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedback(dom.registerFeedback, result.message || "Registration successful. Redirecting to sign in...", "success");
      showToast("Account created. You can sign in now.", "success");
      window.setTimeout(() => {
        window.location.href = "/login.html";
      }, 900);
    } catch (error) {
      setFeedback(dom.registerFeedback, error.message || "Registration failed.", "error");
    } finally {
      setButtonBusy(submitBtn, false);
    }
  });
}

async function initHomePage() {
  if (!ensureUserSession()) {
    return;
  }

  await loadHomeData();
}

async function loadHomeData() {
  setContainerLoading(dom.homeOffers, "Loading offers");
  setContainerLoading(dom.homeNotifications, "Loading notifications");
  setContainerLoading(dom.homeActiveList, "Loading active bookings");
  setContainerLoading(dom.homePastList, "Loading recent trips");

  const customerId = readUserSession().customerId;
  const [statusResult, discountResult, notificationResult] = await Promise.allSettled([
    fetchJson(`/api/bookings/status/${customerId}`),
    fetchJson(`/api/discounts/${customerId}`),
    fetchJson(`/api/notifications/${customerId}`),
  ]);

  if (statusResult.status !== "fulfilled") {
    throw statusResult.reason;
  }

  pageState.status = statusResult.value || { active: [], past: [] };
  pageState.discounts = discountResult.status === "fulfilled" ? discountResult.value || [] : [];
  pageState.notifications =
    notificationResult.status === "fulfilled" ? notificationResult.value || [] : [];

  replaceBookingIndex([...pageState.status.active, ...pageState.status.past]);
  renderHomeDashboard();

  if (discountResult.status === "rejected" || notificationResult.status === "rejected") {
    showToast("Some dashboard extras could not be loaded, but your bookings are available.", "warning");
  }
}

function renderHomeDashboard() {
  const session = readUserSession();
  const allBookings = [...pageState.status.active, ...pageState.status.past];
  const pendingCount = allBookings.filter(isAwaitingPayment).length;
  const confirmedCount = allBookings.filter((booking) => booking.paid && !isCancelled(booking)).length;
  const cancelledCount = allBookings.filter(isCancelled).length;

  if (dom.homeGreeting) {
    dom.homeGreeting.textContent = `Good to see you again, ${session.name || "traveler"}.`;
  }

  if (dom.homeSubtitle) {
    dom.homeSubtitle.textContent = pendingCount
      ? `You have ${pendingCount} payment${pendingCount === 1 ? "" : "s"} waiting for confirmation and ${pageState.status.active.length} active booking${pageState.status.active.length === 1 ? "" : "s"} on the calendar.`
      : `Everything is in one place now: ${pageState.status.active.length} active booking${pageState.status.active.length === 1 ? "" : "s"}, ${confirmedCount} confirmed trip${confirmedCount === 1 ? "" : "s"}, and ${pageState.discounts.length} open offer${pageState.discounts.length === 1 ? "" : "s"}.`;
  }

  if (dom.homePriorityCard) {
    dom.homePriorityCard.innerHTML = buildHomePriorityCard();
  }

  if (dom.homeMetrics) {
    dom.homeMetrics.innerHTML = [
      metricCard("Active bookings", pageState.status.active.length, "Trips currently upcoming or in progress", "accent-sky"),
      metricCard("Awaiting payment", pendingCount, "Bookings still waiting on a payment reference", "accent-rose"),
      metricCard("Unused offers", pageState.discounts.length, "Discounts that will apply on future bookings", "accent-reef"),
      metricCard("Cancelled trips", cancelledCount, "Reservations closed from the user or admin side", "accent-sun"),
    ].join("");
  }

  renderOfferCards(dom.homeOffers, pageState.discounts, "No discounts yet", "New offers or admin-issued discounts will show up here.");
  renderNotificationCards(dom.homeNotifications, pageState.notifications);
  renderBookingCards(dom.homeActiveList, pageState.status.active, {
    emptyTitle: "No active bookings yet",
    emptyCopy: "When you reserve a car, upcoming trips will show up here with payment and QR actions.",
    limit: 4,
  });
  renderBookingCards(dom.homePastList, pageState.status.past, {
    emptyTitle: "No past trips yet",
    emptyCopy: "Completed and cancelled bookings will move into this section automatically.",
    limit: 2,
  });
}

function buildHomePriorityCard() {
  const active = pageState.status.active || [];
  const pendingBooking = active.find(isAwaitingPayment) || pageState.status.past.find(isAwaitingPayment);
  const nextPickup = active
    .filter((booking) => !isCancelled(booking))
    .sort((left, right) => parseDate(left.start_date) - parseDate(right.start_date))[0];

  if (pendingBooking) {
    return `
      <span class="hero-chip">Needs Attention</span>
      <h3>Finish payment for booking #${getBookingId(pendingBooking)}</h3>
      <p>${escapeHtml(pendingBooking.brand || "Your car")} ${escapeHtml(pendingBooking.model || "")} is still waiting on a payment reference.</p>
      <div class="hero-actions">
        <button class="button button-warm" type="button" data-action="pay-booking" data-booking-id="${getBookingId(pendingBooking)}">Complete Payment</button>
        <a class="button button-secondary" href="/history.html">Open Booking Center</a>
      </div>
    `;
  }

  if (nextPickup) {
    return `
      <span class="hero-chip">Next Pickup</span>
      <h3>${escapeHtml(nextPickup.brand || "Your car")} ${escapeHtml(nextPickup.model || "")}</h3>
      <p>Pickup is scheduled for ${formatDate(nextPickup.start_date)} at ${escapeHtml(nextPickup.location || "your selected location")}.</p>
      <div class="badge-row">
        <span class="status-badge badge-sky">${formatDuration(nextPickup.start_date, nextPickup.end_date)}</span>
        ${nextPickup.collection_qr ? '<span class="status-badge badge-success">Collection QR ready</span>' : '<span class="status-badge badge-warning">Payment confirmed</span>'}
      </div>
    `;
  }

  if (pageState.discounts.length) {
    const offer = pageState.discounts[0];
    return `
      <span class="hero-chip">Offer Ready</span>
      <h3>${offer.percent || 0}% off is waiting on your next trip</h3>
      <p>Code ${escapeHtml(offer.code || "AUTO")} is still unused. Pick new dates and the backend will apply the discount when it matches.</p>
      <div class="hero-actions">
        <a class="button button-primary" href="/book.html">Use This Offer</a>
      </div>
    `;
  }

  return `
    <span class="hero-chip">Fresh Start</span>
    <h3>Your dashboard is clear</h3>
    <p>No open payments and no active trips right now. Browse the fleet when you are ready for the next reservation.</p>
    <div class="hero-actions">
      <a class="button button-primary" href="/book.html">Browse Cars</a>
    </div>
  `;
}

async function initBookPage() {
  if (!ensureUserSession()) {
    return;
  }

  dom.carSearchInput?.addEventListener("input", (event) => {
    pageState.filters.carSearch = event.target.value.trim().toLowerCase();
    renderCarGrid();
  });

  dom.carLocationSelect?.addEventListener("change", (event) => {
    pageState.filters.carLocation = event.target.value;
    renderCarGrid();
  });

  dom.carGrid?.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-car-form]");
    if (!form) {
      return;
    }

    event.preventDefault();
    await submitCarBooking(form);
  });

  await loadBookPageData();
  restoreStoredVoiceBookingIntent();
}

async function loadBookPageData() {
  setContainerLoading(dom.carGrid, "Loading cars");
  const customerId = readUserSession().customerId;
  const [cars, discounts] = await Promise.all([
    fetchJson("/api/cars"),
    fetchJson(`/api/discounts/${customerId}`).catch(() => []),
  ]);

  pageState.cars = Array.isArray(cars) ? cars : [];
  pageState.discounts = Array.isArray(discounts) ? discounts : [];

  const bookingsByCar = await Promise.all(
    pageState.cars.map(async (car) => {
      const rows = await fetchJson(`/api/bookings/${car.id}`).catch(() => []);
      return [Number(car.id), Array.isArray(rows) ? rows : []];
    })
  );

  pageState.carBookings = Object.fromEntries(bookingsByCar);
  renderBookingHero();
  renderDiscountSpotlight();
  populateLocationFilter();
  renderCarGrid();
}

function renderBookingHero() {
  if (!dom.bookingHeroNote) {
    return;
  }

  const totalCars = pageState.cars.length;
  const busyCars = Object.values(pageState.carBookings).filter((rows) => rows.length).length;
  dom.bookingHeroNote.textContent = totalCars
    ? `${totalCars} cars loaded. ${busyCars} currently have scheduled date blocks, and the rest are open for new reservations.`
    : "No cars are published right now.";
}

function renderDiscountSpotlight() {
  if (!dom.discountSpotlight) {
    return;
  }

  if (!pageState.discounts.length) {
    dom.discountSpotlight.innerHTML = `
      <span class="hero-chip">Pricing</span>
      <h3>No unused offers at the moment.</h3>
      <p>Any discount granted by admin or from a previous cancellation will appear here before you book again.</p>
    `;
    return;
  }

  const cards = pageState.discounts.slice(0, 2).map((discount) => `
    <article class="offer-card">
      <strong>${escapeHtml(String(discount.percent || 0))}%</strong>
      <div>
        <p class="summary-line">Code <span class="offer-code">${escapeHtml(discount.code || "AUTO")}</span></p>
        <p>${discount.start_date && discount.end_date ? `Valid for trips between ${formatDate(discount.start_date)} and ${formatDate(discount.end_date)}.` : "This discount can be applied automatically on an eligible booking."}</p>
      </div>
    </article>
  `);

  dom.discountSpotlight.innerHTML = `
    <span class="hero-chip">Offers Ready</span>
    <h3>${pageState.discounts.length} discount${pageState.discounts.length === 1 ? "" : "s"} available before checkout.</h3>
    <div class="offer-grid">${cards.join("")}</div>
  `;
}

function populateLocationFilter() {
  if (!dom.carLocationSelect) {
    return;
  }

  const locations = Array.from(
    new Set(
      pageState.cars
        .map((car) => String(car.location || "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

  const selectedValue = pageState.filters.carLocation;
  dom.carLocationSelect.innerHTML = [
    '<option value="all">All locations</option>',
    ...locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`),
  ].join("");
  dom.carLocationSelect.value = locations.includes(selectedValue) ? selectedValue : "all";
}

function renderCarGrid() {
  if (!dom.carGrid) {
    return;
  }

  const filteredCars = pageState.cars.filter((car) => {
    const haystack = `${car.brand || ""} ${car.model || ""} ${car.location || ""}`.toLowerCase();
    const matchesSearch = !pageState.filters.carSearch || haystack.includes(pageState.filters.carSearch);
    const matchesLocation =
      pageState.filters.carLocation === "all" ||
      String(car.location || "").trim() === pageState.filters.carLocation;
    return matchesSearch && matchesLocation;
  });

  if (!filteredCars.length) {
    dom.carGrid.innerHTML = emptyStateMarkup(
      "No cars match these filters",
      "Try a broader location or clear the search to see more of the fleet."
    );
    return;
  }

  dom.carGrid.innerHTML = filteredCars.map(buildCarCardMarkup).join("");
  syncAllBookingForms();
}

function buildCarCardMarkup(car) {
  const bookings = pageState.carBookings[Number(car.id)] || [];
  const availabilityCopy = bookings.length
    ? "Booked dates are blocked directly inside the calendar picker."
    : "This car is fully open right now, so every future day is selectable.";

  return `
    <article class="vehicle-card">
      <div class="vehicle-media">${getCarMediaMarkup(car)}</div>
      <div class="vehicle-body">
        <div class="vehicle-head">
          <div>
            <span class="eyebrow">${escapeHtml(String(car.year || "Ready"))}</span>
            <h3>${escapeHtml(car.brand || "A6")} ${escapeHtml(car.model || "Vehicle")}</h3>
            <p class="support-copy">${escapeHtml(car.location || "Location available after booking")}</p>
          </div>
          <span class="price-chip">${formatCurrency(car.daily_rate || 0)}/day</span>
        </div>

        <p class="summary-line">${availabilityCopy}</p>

        <form class="field-grid" data-car-form="${Number(car.id)}">
          <label class="field-block">
            <span>Start date</span>
            <button class="date-trigger" type="button" data-action="open-date-picker" data-field="start">
              <span class="date-trigger-value" data-start-date-display>Select start date</span>
              <span class="date-trigger-note" data-start-date-note>Booked dates are disabled.</span>
            </button>
            <input type="hidden" data-start-date value="" />
          </label>
          <label class="field-block">
            <span>End date</span>
            <button class="date-trigger" type="button" data-action="open-date-picker" data-field="end">
              <span class="date-trigger-value" data-end-date-display>Select end date</span>
              <span class="date-trigger-note" data-end-date-note>Select a start date first.</span>
            </button>
            <input type="hidden" data-end-date value="" />
          </label>
          <div class="card-actions" style="grid-column: 1 / -1;">
            <button class="button button-primary" type="submit">Reserve and Pay</button>
            <button class="button button-secondary" type="button" data-action="view-car-availability" data-car-id="${Number(car.id)}">View booked dates</button>
          </div>
        </form>
      </div>
    </article>
  `;
}

function getCarMediaMarkup(car) {
  const firstImage = Array.isArray(car.images) && car.images.length ? getAssetUrl(car.images[0]) : "";
  if (firstImage) {
    return `<img src="${firstImage}" alt="${escapeHtml(`${car.brand || ""} ${car.model || ""}`.trim())}" />`;
  }

  const shortLabel = escapeHtml(
    `${String(car.brand || "A").slice(0, 1)}${String(car.model || "6").slice(0, 1)}`.toUpperCase()
  );
  return `<div class="vehicle-placeholder">${shortLabel}</div>`;
}

async function submitCarBooking(form) {
  const carId = Number(form.dataset.carForm);
  const car = pageState.cars.find((item) => Number(item.id) === carId);
  const previousStart = form.querySelector("[data-start-date]")?.value || "";
  const previousEnd = form.querySelector("[data-end-date]")?.value || "";
  const submitBtn = form.querySelector('button[type="submit"]');

  if (!car) {
    showToast("That car is no longer available in the current list.", "error");
    return;
  }

  syncBookingFormDates(form);

  const start = form.querySelector("[data-start-date]")?.value;
  const end = form.querySelector("[data-end-date]")?.value;

  if (previousStart !== start || previousEnd !== end) {
    showToast("Booked dates were adjusted. Review the updated range and submit once more.", "warning");
    return;
  }

  if (!start || !end) {
    showToast("Select both a start and end date before booking.", "warning");
    return;
  }

  if (!isDateRangeValid(start, end)) {
    showToast("Choose an end date that is the same as or after the start date.", "warning");
    return;
  }

  const overlapsExisting = (pageState.carBookings[carId] || []).some((booking) =>
    datesOverlap(start, end, booking.start_date, booking.end_date)
  );

  if (overlapsExisting) {
    showToast("Those dates overlap an existing reservation. Pick another range.", "warning");
    return;
  }

  setButtonBusy(submitBtn, true, "Reserving...");

  try {
    const result = await fetchJson("/api/book", {
      method: "POST",
      body: JSON.stringify({
        car_id: carId,
        customer_id: readUserSession().customerId,
        start_date: start,
        end_date: end,
      }),
    });

    const draftBooking = {
      booking_id: result.booking_id,
      id: result.booking_id,
      car_id: carId,
      brand: car.brand,
      model: car.model,
      location: car.location,
      start_date: start,
      end_date: end,
      amount: result.total,
      paid: false,
      verified: false,
      status: "pending",
      images: car.images || [],
    };

    rememberBooking(draftBooking);
    showToast("Booking created. Finish payment now or later from your booking center.", "success");
    await loadBookPageData();
    openPaymentModal(draftBooking, result.payment_qr);
  } catch (error) {
    showToast(error.message || "Booking failed.", "error");
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

function syncAllBookingForms() {
  if (!dom.carGrid) {
    return;
  }

  dom.carGrid.querySelectorAll("[data-car-form]").forEach((form) => {
    syncBookingFormDates(form);
  });
}

function syncBookingFormDates(form, options = {}) {
  const { changedField = null, notify = false } = options;
  const carId = Number(form?.dataset?.carForm);
  const startInput = form?.querySelector("[data-start-date]");
  const endInput = form?.querySelector("[data-end-date]");
  const startTrigger = form?.querySelector('[data-action="open-date-picker"][data-field="start"]');
  const endTrigger = form?.querySelector('[data-action="open-date-picker"][data-field="end"]');
  const today = todayAsInput();

  if (!carId || !startInput || !endInput || !startTrigger || !endTrigger) {
    return;
  }

  let startValue = startInput.value || "";
  if (!startValue) {
    endInput.value = "";
    setDateTriggerState(startTrigger, "", "Select start date", "Booked dates are disabled.", false);
    setDateTriggerState(endTrigger, "", "Select end date", "Select a start date first.", true);
    return;
  }

  const earliestStart = parseDate(today);
  if (earliestStart && parseDate(startValue) < earliestStart) {
    startValue = today;
    startInput.value = today;
    if (notify && changedField === "start") {
      showToast("Start date cannot be in the past. It was moved to today.", "warning");
    }
  }

  const nextOpenStart = getNextOpenStartDate(carId, startValue);
  if (nextOpenStart && nextOpenStart !== startValue) {
    startValue = nextOpenStart;
    startInput.value = nextOpenStart;
    if (notify && changedField === "start") {
      showToast("That start date is already booked. Moved to the next available date.", "warning");
    }
  }

  const latestEnd = getLatestAvailableEndDate(carId, startValue);

  if (endInput.value && parseDate(endInput.value) < parseDate(startValue)) {
    endInput.value = startValue;
    if (notify && changedField === "end") {
      showToast("End date cannot be earlier than the start date.", "warning");
    }
  }

  if (endInput.value && latestEnd && parseDate(endInput.value) > parseDate(latestEnd)) {
    endInput.value = latestEnd;
    if (notify) {
      showToast("Those dates run into the next booking, so the end date was moved to the last open day.", "warning");
    }
  }

  setDateTriggerState(startTrigger, startInput.value, "Select start date", "Tap to change the start date.", false);
  setDateTriggerState(
    endTrigger,
    endInput.value,
    "Select end date",
    endInput.value ? "Only open return dates are enabled." : "Select an end date. Only open return dates are enabled.",
    false
  );
}

function setDateTriggerState(trigger, value, emptyLabel, note, disabled) {
  if (!trigger) {
    return;
  }

  trigger.disabled = Boolean(disabled);
  trigger.dataset.filled = value ? "true" : "false";
  const valueEl = trigger.querySelector(".date-trigger-value");
  const noteEl = trigger.querySelector(".date-trigger-note");

  if (valueEl) {
    valueEl.textContent = value ? formatDate(value) : emptyLabel;
  }

  if (noteEl) {
    noteEl.textContent = note || "";
  }
}

function openBookingDatePicker(trigger) {
  const form = trigger?.closest("[data-car-form]");
  const field = trigger?.dataset?.field || "";
  const carId = Number(form?.dataset?.carForm);
  if (!form || !carId || !field) {
    return;
  }

  if (field === "end" && !form.querySelector("[data-start-date]")?.value) {
    showToast("Pick a start date first.", "warning");
    return;
  }

  const currentValue =
    form.querySelector(field === "start" ? "[data-start-date]" : "[data-end-date]")?.value || "";
  const anchorValue = form.querySelector("[data-start-date]")?.value || todayAsInput();
  const monthSeed = currentValue || anchorValue;

  pageState.datePicker = {
    carId,
    field,
    month: formatDateInput(startOfMonth(monthSeed)),
  };

  renderBookingDatePickerModal();
}

function shiftBookingDatePickerMonth(amount) {
  if (!pageState.datePicker.carId || !pageState.datePicker.month) {
    return;
  }

  const nextMonth = addMonths(pageState.datePicker.month, amount);
  const currentMonth = startOfMonth(todayAsInput());
  const normalizedNextMonth = startOfMonth(nextMonth);
  if (normalizedNextMonth < currentMonth) {
    pageState.datePicker.month = formatDateInput(currentMonth);
  } else {
    pageState.datePicker.month = formatDateInput(normalizedNextMonth);
  }

  renderBookingDatePickerModal();
}

function applyBookingDateSelection(actionEl) {
  const { carId, field } = pageState.datePicker;
  const value = actionEl?.dataset?.value || "";
  const form = dom.carGrid?.querySelector(`[data-car-form="${carId}"]`);
  if (!form || !value || !field) {
    return;
  }

  const input = form.querySelector(field === "start" ? "[data-start-date]" : "[data-end-date]");
  if (!input) {
    return;
  }

  input.value = value;
  syncBookingFormDates(form, { changedField: field, notify: false });
  pageState.datePicker = { carId: null, field: "", month: "" };
  closeModal();
}

function renderBookingDatePickerModal() {
  const { carId, field, month } = pageState.datePicker;
  const form = dom.carGrid?.querySelector(`[data-car-form="${carId}"]`);
  const car = pageState.cars.find((item) => Number(item.id) === Number(carId));

  if (!form || !car || !field) {
    pageState.datePicker = { carId: null, field: "", month: "" };
    closeModal();
    return;
  }

  const visibleMonth = startOfMonth(month || todayAsInput());
  const previousMonthDisabled = visibleMonth <= startOfMonth(todayAsInput());
  const content = document.createElement("div");
  content.className = "booking-calendar-shell";
  content.innerHTML = `
    <div class="booking-calendar-toolbar">
      <button class="calendar-nav" type="button" data-action="calendar-prev-month" ${previousMonthDisabled ? "disabled" : ""} aria-label="Previous month">Previous</button>
      <div class="booking-calendar-legend">
        <span class="calendar-legend-item"><span class="calendar-swatch is-available"></span>Open</span>
        <span class="calendar-legend-item"><span class="calendar-swatch is-booked"></span>Booked</span>
        <span class="calendar-legend-item"><span class="calendar-swatch is-selected"></span>Selected</span>
      </div>
      <button class="calendar-nav" type="button" data-action="calendar-next-month" aria-label="Next month">Next</button>
    </div>
    <div class="booking-calendar-grid">
      ${buildBookingCalendarMonthMarkup(form, field, visibleMonth)}
      ${buildBookingCalendarMonthMarkup(form, field, addMonths(visibleMonth, 1))}
    </div>
  `;

  openModal({
    title: field === "start" ? `Pick a start date for ${car.brand || "A6"} ${car.model || "Vehicle"}` : `Pick an end date for ${car.brand || "A6"} ${car.model || "Vehicle"}`,
    subtitle: "Booked dates are shown in red and cannot be selected.",
    size: "wide",
    content,
  });
}

function buildBookingCalendarMonthMarkup(form, field, monthValue) {
  const carId = Number(form?.dataset?.carForm);
  const monthDate = startOfMonth(monthValue);
  const selectedValue =
    form.querySelector(field === "start" ? "[data-start-date]" : "[data-end-date]")?.value || "";
  const startValue = form.querySelector("[data-start-date]")?.value || "";
  const offset = monthDate.getDay();
  const totalDays = getDaysInMonth(monthDate);
  const dayCells = [];

  for (let index = 0; index < offset; index += 1) {
    dayCells.push('<span class="calendar-day is-placeholder" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateValue = formatDateInput(
      new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12, 0, 0, 0)
    );
    const blocked = isDateBlockedInPicker(carId, field, dateValue, startValue);
    const classes = ["calendar-day"];

    if (blocked) {
      classes.push("is-disabled");
      if (isBookedDate(carId, dateValue)) {
        classes.push("is-booked");
      }
    }

    if (sameDateValue(dateValue, selectedValue)) {
      classes.push("is-selected");
    }

    if (field === "end" && sameDateValue(dateValue, startValue)) {
      classes.push("is-anchor");
    }

    if (sameDateValue(dateValue, todayAsInput())) {
      classes.push("is-today");
    }

    dayCells.push(
      blocked
        ? `<button class="${classes.join(" ")}" type="button" disabled>${day}</button>`
        : `<button class="${classes.join(" ")}" type="button" data-action="pick-booking-date" data-value="${dateValue}">${day}</button>`
    );
  }

  return `
    <section class="calendar-month">
      <div class="calendar-month-head">
        <h4>${monthDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h4>
      </div>
      <div class="calendar-weekdays">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>
      <div class="calendar-days">${dayCells.join("")}</div>
    </section>
  `;
}

function isDateBlockedInPicker(carId, field, value, startValue = "") {
  const date = parseDate(value);
  if (!date || date < startOfToday()) {
    return true;
  }

  if (findBookingContainingDate(carId, value)) {
    return true;
  }

  if (field === "end") {
    const startDate = parseDate(startValue);
    if (!startDate || date < startDate) {
      return true;
    }

    const latestEnd = getLatestAvailableEndDate(carId, startValue);
    if (latestEnd && date > parseDate(latestEnd)) {
      return true;
    }
  }

  return false;
}

function isBookedDate(carId, value) {
  return Boolean(findBookingContainingDate(carId, value));
}

function sameDateValue(left, right) {
  return Boolean(left && right && formatDateInput(left) === formatDateInput(right));
}

function startOfMonth(value) {
  const date = parseDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(value, amount) {
  const date = parseDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function getDaysInMonth(value) {
  const date = parseDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getNextOpenStartDate(carId, value) {
  let candidate = parseDate(value);
  if (!candidate) {
    return "";
  }

  while (candidate) {
    const blockingBooking = findBookingContainingDate(carId, candidate);
    if (!blockingBooking) {
      return formatDateInput(candidate);
    }
    candidate = shiftDate(blockingBooking.end_date, 1);
  }

  return "";
}

function getLatestAvailableEndDate(carId, startValue) {
  const nextBooking = findNextBookingAfterDate(carId, startValue);
  if (!nextBooking) {
    return "";
  }

  return formatDateInput(shiftDate(nextBooking.start_date, -1));
}

function findBookingContainingDate(carId, value) {
  const target = parseDate(value);
  if (!target) {
    return null;
  }

  return (pageState.carBookings[Number(carId)] || []).find((booking) => {
    const start = parseDate(booking.start_date);
    const end = parseDate(booking.end_date);
    return Boolean(start && end && target >= start && target <= end);
  }) || null;
}

function findNextBookingAfterDate(carId, value) {
  const startDate = parseDate(value);
  if (!startDate) {
    return null;
  }

  return (pageState.carBookings[Number(carId)] || []).find((booking) => {
    const bookingStart = parseDate(booking.start_date);
    return Boolean(bookingStart && bookingStart > startDate);
  }) || null;
}

function openCarAvailabilityModal(carId) {
  const car = pageState.cars.find((item) => Number(item.id) === Number(carId));
  if (!car) {
    showToast("That car could not be found.", "warning");
    return;
  }

  const bookings = pageState.carBookings[Number(carId)] || [];
  const content = document.createElement("div");
  content.className = "stack-list";

  if (!bookings.length) {
    content.innerHTML = emptyStateMarkup(
      "No booked dates on this car right now",
      "The schedule is currently open, so you can reserve any future date range."
    );
  } else {
    content.innerHTML = `
      <div class="badge-row">
        <span class="status-badge badge-sky">${escapeHtml(car.brand || "A6")} ${escapeHtml(car.model || "Vehicle")}</span>
        <span class="status-badge badge-neutral">${escapeHtml(car.location || "Location pending")}</span>
      </div>
      <div class="stack-list">
        ${bookings
          .map(
            (booking) => `
              <article class="notification-item">
                <strong>${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}</strong>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  openModal({
    title: `${car.brand || "A6"} ${car.model || "Vehicle"} booked dates`,
    subtitle: `Only blocked date ranges for ${car.location || "your selected location"} are shown here.`,
    size: "wide",
    content,
  });
}

async function initHistoryPage() {
  if (!ensureUserSession()) {
    return;
  }

  dom.historySearchInput?.addEventListener("input", (event) => {
    pageState.filters.historySearch = event.target.value.trim().toLowerCase();
    renderHistoryCards();
  });

  dom.historyFilterBar?.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-filter]");
    if (!pill) {
      return;
    }

    pageState.filters.historyFilter = pill.dataset.filter || "all";
    Array.from(dom.historyFilterBar.querySelectorAll("[data-filter]")).forEach((button) => {
      button.classList.toggle("active", button === pill);
    });
    renderHistoryCards();
  });

  await loadHistoryData();
}

async function loadHistoryData() {
  setContainerLoading(dom.historyList, "Loading bookings");
  const customerId = readUserSession().customerId;
  const data = await fetchJson(`/api/history/${customerId}`);
  pageState.history = Array.isArray(data) ? data : data.bookings || [];
  pageState.discounts = Array.isArray(data.discounts) ? data.discounts : [];
  replaceBookingIndex(pageState.history);
  renderHistorySummary();
  renderHistoryMetrics();
  renderDiscountCards();
  renderHistoryCards();
}

function renderHistorySummary() {
  if (!dom.historySummary) {
    return;
  }

  const pendingCount = pageState.history.filter(isAwaitingPayment).length;
  const activeCount = pageState.history.filter(isActiveBooking).length;
  const paidCount = pageState.history.filter((booking) => booking.paid && !isCancelled(booking)).length;

  dom.historySummary.innerHTML = `
    <span class="hero-chip">Booking Center</span>
    <h3>${pendingCount ? `${pendingCount} payment${pendingCount === 1 ? "" : "s"} still need action.` : "Everything is organized in one booking timeline."}</h3>
    <p>${activeCount} active booking${activeCount === 1 ? "" : "s"}, ${paidCount} confirmed trip${paidCount === 1 ? "" : "s"}, and ${pageState.discounts.length} discount${pageState.discounts.length === 1 ? "" : "s"} still available.</p>
    <div class="badge-row">
      <span class="status-badge badge-sky">${pageState.history.length} total bookings</span>
      <span class="status-badge badge-success">${paidCount} paid</span>
      <span class="status-badge badge-warning">${pendingCount} awaiting payment</span>
    </div>
  `;
}

function renderHistoryMetrics() {
  if (!dom.historyMetrics) {
    return;
  }

  const cancelledCount = pageState.history.filter(isCancelled).length;
  const refundPending = pageState.history.filter(
    (booking) => String(booking.refund_status || "").toLowerCase() === "pending"
  ).length;

  dom.historyMetrics.innerHTML = [
    metricCard("Active", pageState.history.filter(isActiveBooking).length, "Reservations still on the calendar", "accent-sky"),
    metricCard("Awaiting payment", pageState.history.filter(isAwaitingPayment).length, "Needs your payment reference", "accent-rose"),
    metricCard("Cancelled", cancelledCount, "Trips closed by user or admin", "accent-sun"),
    metricCard("Refund queue", refundPending, "Refunds still marked as pending", "accent-reef"),
  ].join("");
}

function renderDiscountCards() {
  renderOfferCards(
    dom.discountStrip,
    pageState.discounts,
    "No unused discounts",
    "Offers show up here when an admin grants one or when a cancelled booking creates a reusable discount."
  );
}

function renderHistoryCards() {
  if (!dom.historyList) {
    return;
  }

  const filtered = pageState.history.filter((booking) => {
    const filter = pageState.filters.historyFilter;
    const search = pageState.filters.historySearch;
    const text = `${booking.brand || ""} ${booking.model || ""} ${booking.location || ""} ${getBookingId(booking)}`.toLowerCase();

    const matchesSearch = !search || text.includes(search);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && isActiveBooking(booking)) ||
      (filter === "awaiting-payment" && isAwaitingPayment(booking)) ||
      (filter === "confirmed" && booking.paid && !isCancelled(booking)) ||
      (filter === "cancelled" && isCancelled(booking));

    return matchesSearch && matchesFilter;
  });

  renderBookingCards(dom.historyList, filtered, {
    emptyTitle: "No bookings match this view",
    emptyCopy: "Try another filter or search term to bring more reservations back into view.",
  });
}

async function initBookingAliasPage() {
  if (dom.redirectCopy) {
    dom.redirectCopy.textContent = "Your bookings page has moved into the upgraded booking center. Redirecting now.";
  }

  window.setTimeout(() => {
    window.location.replace("/history.html");
  }, 350);
}

async function startPaymentFlow(booking) {
  const bookingId = getBookingId(booking);
  try {
    showToast("Loading the payment QR for this booking.", "warning");
    const result = await fetchJson("/api/payments/qr", {
      method: "POST",
      body: JSON.stringify({
        booking_id: bookingId,
        customer_id: readUserSession().customerId,
      }),
    });

    openPaymentModal(booking, result.qr);
  } catch (error) {
    showToast(error.message || "Could not load the payment QR.", "error");
  }
}

function openPaymentModal(booking, qr) {
  const bookingId = getBookingId(booking);
  const content = document.createElement("div");
  content.className = "stack-list";
  content.innerHTML = `
    <div class="meta-grid">
      <div>
        <span>Booking</span>
        <strong>#${bookingId}</strong>
      </div>
      <div>
        <span>Trip</span>
        <strong>${formatDuration(booking.start_date, booking.end_date)}</strong>
      </div>
      <div>
        <span>Amount</span>
        <strong>${formatCurrency(booking.amount || 0)}</strong>
      </div>
    </div>
    <article class="qr-card">
      <img src="${qr}" alt="Payment QR" />
      <p class="detail-note">Scan the QR to pay, then paste the payment reference so the booking can be confirmed and the collection and return passes can be generated.</p>
    </article>
    <label class="field-block">
      <span>Payment reference ID</span>
      <input class="input" type="text" id="paymentReferenceInput" placeholder="Example: UPI123456" />
    </label>
    <div class="feedback feedback-error" id="paymentVerifyFeedback"></div>
    <div class="modal-actions">
      <button class="button button-primary" type="button" id="paymentVerifyBtn">Verify Payment</button>
      <button class="button button-secondary" type="button" data-action="close-modal">Close</button>
    </div>
  `;

  const modal = openModal({
    title: `Pay for ${booking.brand || "your car"} ${booking.model || ""}`.trim(),
    subtitle: `Pickup at ${booking.location || "your selected location"} from ${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}.`,
    content,
  });

  const referenceInput = modal.querySelector("#paymentReferenceInput");
  const feedback = modal.querySelector("#paymentVerifyFeedback");
  const verifyBtn = modal.querySelector("#paymentVerifyBtn");

  verifyBtn?.addEventListener("click", async () => {
    const reference = referenceInput?.value.trim();
    if (!reference) {
      setFeedback(feedback, "Enter the payment reference before verification.", "error");
      referenceInput?.focus();
      return;
    }

    setFeedback(feedback, "", "error");
    setButtonBusy(verifyBtn, true, "Verifying...");

    try {
      const result = await fetchJson("/api/verify-payment", {
        method: "POST",
        body: JSON.stringify({
          booking_id: bookingId,
          payment_reference_id: reference,
          customer_id: readUserSession().customerId,
        }),
      });

      closeModal();
      showToast(result.message || "Payment verified.", "success");
      openPaymentSuccessModal(booking, result);
      await refreshActivePageData();
    } catch (error) {
      setFeedback(feedback, error.message || "Payment verification failed.", "error");
    } finally {
      setButtonBusy(verifyBtn, false);
    }
  });
}

function openPaymentSuccessModal(booking, payload) {
  const bookingId = getBookingId(booking);
  const content = document.createElement("div");
  content.className = "stack-list";
  content.innerHTML = `
    <div class="badge-row">
      <span class="status-badge badge-success">Payment confirmed</span>
      <span class="status-badge badge-sky">Booking #${bookingId}</span>
    </div>
    <p class="detail-note">Save both passes now. The collection QR is used at pickup, and the return QR is used when you hand the car back.</p>
    <div class="qr-grid">
      <article class="qr-card">
        <h4>Collection QR</h4>
        <img src="${payload.collection_qr}" alt="Collection QR" />
        <div class="card-actions">
          <button class="button button-secondary button-inline" type="button" id="downloadCollectionBtn">Download</button>
        </div>
      </article>
      <article class="qr-card">
        <h4>Return QR</h4>
        <img src="${payload.return_qr}" alt="Return QR" />
        <div class="card-actions">
          <button class="button button-secondary button-inline" type="button" id="downloadReturnBtn">Download</button>
        </div>
      </article>
    </div>
    <div class="modal-actions">
      <a class="button button-primary" href="/history.html">Open Booking Center</a>
      <button class="button button-secondary" type="button" data-action="close-modal">Done</button>
    </div>
  `;

  const modal = openModal({
    title: "Your booking is confirmed",
    subtitle: `${booking.brand || "Your car"} ${booking.model || ""} is now ready for pickup tracking and return handoff.`,
    size: "wide",
    content,
  });

  modal.querySelector("#downloadCollectionBtn")?.addEventListener("click", () => {
    downloadDataUrl(payload.collection_qr, `collection_qr_${bookingId}.png`);
  });

  modal.querySelector("#downloadReturnBtn")?.addEventListener("click", () => {
    downloadDataUrl(payload.return_qr, `return_qr_${bookingId}.png`);
  });
}

function openQrModal({ title, subtitle, qr, filename }) {
  if (!qr) {
    showToast("That QR is not available yet.", "warning");
    return;
  }

  const content = document.createElement("div");
  content.className = "stack-list";
  content.innerHTML = `
    <article class="qr-card">
      <img src="${qr}" alt="${escapeHtml(title)}" />
      <p class="detail-note">${escapeHtml(subtitle || "Keep this QR available when the team requests it.")}</p>
    </article>
    <div class="modal-actions">
      <button class="button button-primary" type="button" id="downloadQrBtn">Download QR</button>
      <button class="button button-secondary" type="button" data-action="close-modal">Close</button>
    </div>
  `;

  const modal = openModal({
    title,
    subtitle,
    content,
  });

  modal.querySelector("#downloadQrBtn")?.addEventListener("click", () => {
    downloadDataUrl(qr, filename);
  });
}

async function cancelBooking(booking) {
  if (!canCancelBooking(booking)) {
    showToast("Only upcoming or active bookings can be cancelled from the customer view.", "warning");
    return;
  }

  const confirmed = window.confirm(
    `Cancel booking #${getBookingId(booking)} for ${booking.brand || "your car"} ${booking.model || ""}? Refund rules still depend on how close the trip is to the start date.`
  );

  if (!confirmed) {
    return;
  }

  try {
    const result = await fetchJson("/api/cancel-booking", {
      method: "POST",
      body: JSON.stringify({
        booking_id: getBookingId(booking),
        customer_id: readUserSession().customerId,
        cancelled_by: "user",
        reason: "Cancelled by customer from upgraded user dashboard",
      }),
    });

    const refundAmount = Number(result.refundAmount ?? result.refund_amount ?? 0);
    showToast(
      refundAmount
        ? `Booking cancelled. Refund queued for ${formatCurrency(refundAmount)}.`
        : "Booking cancelled. No refund was required for this reservation.",
      "success"
    );
    await refreshActivePageData();
  } catch (error) {
    showToast(error.message || "Could not cancel this booking.", "error");
  }
}

async function refreshActivePageData() {
  const page = getPageName();
  if (page === "home") {
    await loadHomeData();
    return;
  }
  if (page === "book") {
    await loadBookPageData();
    return;
  }
  if (page === "history") {
    await loadHistoryData();
  }
}

function renderOfferCards(container, discounts, emptyTitle, emptyCopy) {
  if (!container) {
    return;
  }

  if (!Array.isArray(discounts) || !discounts.length) {
    container.innerHTML = emptyStateMarkup(emptyTitle, emptyCopy);
    return;
  }

  container.innerHTML = discounts.map((discount) => buildOfferCardMarkup(discount)).join("");
}

function buildOfferCardMarkup(discount) {
  const validity =
    discount.start_date && discount.end_date
      ? `Valid for trips between ${formatDate(discount.start_date)} and ${formatDate(discount.end_date)}.`
      : "Ready to be applied on an eligible upcoming booking.";

  return `
    <article class="offer-card">
      <strong>${escapeHtml(String(discount.percent || 0))}%</strong>
      <div class="stack-list">
        <div class="badge-row">
          <span class="offer-code">${escapeHtml(discount.code || "AUTO")}</span>
          <span class="pill">${discount.used ? "Used" : "Unused"}</span>
        </div>
        <p>${validity}</p>
      </div>
    </article>
  `;
}

function renderNotificationCards(container, notifications) {
  if (!container) {
    return;
  }

  if (!Array.isArray(notifications) || !notifications.length) {
    container.innerHTML = emptyStateMarkup(
      "No notifications yet",
      "Payment updates, cancellation notes, and admin-issued offers will show up here."
    );
    return;
  }

  container.innerHTML = notifications.slice(0, 6).map((notification) => `
    <article class="notification-item">
      <strong>${escapeHtml(notification.title || "Update")}</strong>
      <p>${escapeHtml(notification.message || "A new notification arrived.")}</p>
      <p class="fine-note">${notification.created_at ? formatDate(notification.created_at) : "Just now"}</p>
    </article>
  `).join("");
}

function renderBookingCards(container, bookings, options = {}) {
  if (!container) {
    return;
  }

  const source = Array.isArray(bookings) ? bookings : [];
  const rows = options.limit ? source.slice(0, options.limit) : source;
  if (!rows.length) {
    container.innerHTML = emptyStateMarkup(options.emptyTitle, options.emptyCopy);
    return;
  }

  container.innerHTML = rows.map((booking) => buildBookingCardMarkup(booking)).join("");
}

function buildBookingCardMarkup(booking) {
  const bookingId = getBookingId(booking);
  const badges = [];

  if (isCancelled(booking)) {
    badges.push(statusBadge("Cancelled", "danger"));
  } else if (isActiveBooking(booking)) {
    badges.push(statusBadge("Active", "sky"));
  } else {
    badges.push(statusBadge("Past trip", "neutral"));
  }

  if (booking.paid) {
    badges.push(statusBadge("Paid", "success"));
  } else if (!isCancelled(booking)) {
    badges.push(statusBadge("Awaiting payment", "warning"));
  }

  if (booking.verified) {
    badges.push(statusBadge("Pickup verified", "violet"));
  }

  const refundStatus = String(booking.refund_status || "").toLowerCase();
  if (refundStatus === "pending") {
    badges.push(statusBadge("Refund pending", "warning"));
  } else if (refundStatus === "processed") {
    badges.push(statusBadge("Refund processed", "success"));
  }

  const actions = [];
  if (isAwaitingPayment(booking)) {
    actions.push(
      `<button class="button button-primary button-inline" type="button" data-action="pay-booking" data-booking-id="${bookingId}">Pay now</button>`
    );
  }
  if (booking.collection_qr) {
    actions.push(
      `<button class="button button-secondary button-inline" type="button" data-action="show-collection" data-booking-id="${bookingId}">Collection QR</button>`
    );
  }
  if (booking.return_qr) {
    actions.push(
      `<button class="button button-secondary button-inline" type="button" data-action="show-return" data-booking-id="${bookingId}">Return QR</button>`
    );
  }
  if (canCancelBooking(booking)) {
    actions.push(
      `<button class="button button-danger button-inline" type="button" data-action="cancel-booking" data-booking-id="${bookingId}">Cancel booking</button>`
    );
  }

  return `
    <article class="booking-card${isCancelled(booking) ? " is-cancelled" : ""}">
      <div class="booking-body">
        <div class="booking-head">
          <div>
            <span class="eyebrow">Booking #${bookingId}</span>
            <h3>${escapeHtml(booking.brand || "A6")} ${escapeHtml(booking.model || "Vehicle")}</h3>
            <p class="support-copy">${escapeHtml(booking.location || "Location confirmed after booking")}</p>
          </div>
          <span class="booking-amount">${formatCurrency(booking.amount || 0)}</span>
        </div>
        <div class="badge-row">${badges.join("")}</div>
        <div class="booking-meta">
          <div>
            <span>Pickup</span>
            <strong>${formatDate(booking.start_date)}</strong>
          </div>
          <div>
            <span>Return</span>
            <strong>${formatDate(booking.end_date)}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>${formatDuration(booking.start_date, booking.end_date)}</strong>
          </div>
        </div>
        <p class="timeline-note">${escapeHtml(buildBookingSummary(booking))}</p>
        ${actions.length ? `<div class="card-actions">${actions.join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function buildBookingSummary(booking) {
  if (isCancelled(booking)) {
    const cancelledBy = booking.canceled_by === "admin" ? "admin" : "you";
    const refundAmount = Number(booking.cancel_refund_amount ?? booking.refund_amount ?? 0);
    if (refundAmount > 0) {
      return `Cancelled by ${cancelledBy}. Refund amount ${formatCurrency(refundAmount)} is currently ${String(booking.refund_status || "pending")}.`;
    }
    return `Cancelled by ${cancelledBy}. ${booking.cancelled_reason ? `Reason: ${booking.cancelled_reason}.` : "No refund was created for this booking."}`;
  }

  if (!booking.paid) {
    return "Payment is still pending. Add your payment reference to confirm the booking and unlock the collection and return QR passes.";
  }

  if (booking.verified) {
    return "Pickup has already been verified on the admin side. Keep the return QR ready when you hand the car back.";
  }

  const pickupDate = parseDate(booking.start_date);
  if (
    !booking.collection_verified &&
    pickupDate &&
    pickupDate < startOfToday() &&
    !booking.collection_qr
  ) {
    return "The collection QR has expired because pickup was not completed on the scheduled collection date.";
  }

  if (isActiveBooking(booking)) {
    return "Payment is confirmed and the reservation is active. Your QR passes are available directly from this booking card.";
  }

  return "This reservation is closed on the calendar, but its payment and QR history are still stored here for reference.";
}

function statusBadge(label, tone) {
  const toneClass = {
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    sky: "badge-sky",
    violet: "badge-violet",
  }[tone] || "badge-neutral";

  return `<span class="status-badge ${toneClass}">${escapeHtml(label)}</span>`;
}

function metricCard(label, value, note, accentClass) {
  return `
    <article class="stat-card ${accentClass}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function emptyStateMarkup(title, copy) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title || "Nothing to show")}</strong>
      <p>${escapeHtml(copy || "Try again in a moment.")}</p>
    </div>
  `;
}

function setContainerLoading(container, label) {
  if (!container) {
    return;
  }

  container.innerHTML = emptyStateMarkup(`${label || "Loading"}...`, "Please wait a moment while we pull the latest data.");
}

function openModal({ title, subtitle = "", content, size = "regular" }) {
  closeModal();

  const root = dom.modalRoot || ensureModalHost();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${size === "wide" ? "modal-wide" : ""}">
      <div class="modal-header">
        <div>
          <h3>${escapeHtml(title || "Details")}</h3>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close dialog">x</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  root.innerHTML = "";
  root.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const body = backdrop.querySelector(".modal-body");
  if (typeof content === "string") {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  }

  return backdrop;
}

function closeModal() {
  if (dom.modalRoot) {
    dom.modalRoot.innerHTML = "";
  }
  document.body.classList.remove("modal-open");
}

function showToast(message, tone = "neutral") {
  const root = dom.toastRoot || ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast${tone === "success" ? " toast-success" : tone === "error" ? " toast-error" : tone === "warning" ? " toast-warning" : ""}`;
  toast.textContent = message;
  root.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3800);
}

function setFeedback(element, message, tone) {
  if (!element) {
    return;
  }

  if (!message) {
    element.className = "feedback";
    element.textContent = "";
    return;
  }

  element.className = `feedback show ${tone === "success" ? "feedback-success" : "feedback-error"}`;
  element.textContent = message;
}

function setButtonBusy(button, busy, label) {
  if (!button) {
    return;
  }

  if (busy) {
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent;
    }
    button.disabled = true;
    button.textContent = label || "Working...";
    return;
  }

  button.disabled = false;
  button.textContent = button.dataset.defaultLabel || button.textContent;
}

async function fetchJson(path, options = {}) {
  if (!window.API_CONFIG || typeof window.API_CONFIG.fetch !== "function") {
    throw new Error("Frontend API configuration is missing.");
  }

  const response = await window.API_CONFIG.fetch(path, options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  let payload = {};
  if (contentType.includes("application/json")) {
    payload = text ? JSON.parse(text) : {};
  } else if (text) {
    payload = { message: text };
  }

  if (!response.ok) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }

  return payload;
}

function replaceBookingIndex(bookings) {
  pageState.bookingIndex = new Map();
  (bookings || []).forEach((booking) => {
    pageState.bookingIndex.set(getBookingId(booking), booking);
  });
}

function rememberBooking(booking) {
  pageState.bookingIndex.set(getBookingId(booking), booking);
}

function findBookingById(bookingId) {
  return pageState.bookingIndex.get(Number(bookingId)) || null;
}

function getBookingId(booking) {
  return Number(booking.booking_id || booking.id);
}

function isCancelled(booking) {
  return (
    String(booking.status || "").toLowerCase() === "cancelled" ||
    Boolean(booking.cancelled_at || booking.canceled_by)
  );
}

function isAwaitingPayment(booking) {
  return !isCancelled(booking) && !booking.paid;
}

function isActiveBooking(booking) {
  const end = parseDate(booking.end_date);
  return !isCancelled(booking) && Boolean(end && end >= startOfToday());
}

function canCancelBooking(booking) {
  const end = parseDate(booking.end_date);
  return !isCancelled(booking) && Boolean(end && end >= startOfToday());
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function todayAsInput() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDateInput(value) {
  const date = parseDate(value);
  if (!date) {
    return "";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftDate(value, amount) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) {
    return "Date pending";
  }
  return dateFormatter.format(date);
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function formatDuration(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) {
    return "Dates pending";
  }

  const days = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  return `${days} day${days === 1 ? "" : "s"}`;
}

function isDateRangeValid(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  return Boolean(startDate && endDate && endDate >= startDate);
}

function datesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const aStart = parseDate(leftStart);
  const aEnd = parseDate(leftEnd);
  const bStart = parseDate(rightStart);
  const bEnd = parseDate(rightEnd);

  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }

  return aStart <= bEnd && aEnd >= bStart;
}

function getAssetUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:/i.test(path) || path.startsWith("data:")) {
    return path;
  }

  return `${window.API_CONFIG.BACKEND_URL}${path}`;
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initializeVoiceAssistantIfAvailable() {
  const page = getPageName();
  if (!["home", "book", "history"].includes(page)) {
    return;
  }

  if (
    typeof window.initializeVoiceAssistant !== "function" ||
    typeof window.createVoiceUI !== "function"
  ) {
    return;
  }

  try {
    const assistant = window.initializeVoiceAssistant();
    if (assistant) {
      window.createVoiceUI("body");
      bindVoiceAssistantEvents();
    }
  } catch (error) {
    console.warn("Voice assistant could not be initialized:", error);
  }
}

function bindVoiceAssistantEvents() {
  if (voiceAssistantEventsBound) {
    return;
  }

  document.addEventListener("voiceAiAssistRequest", handleVoiceAiAssistRequest);
  document.addEventListener("voiceAiIntent", handleVoiceAiIntent);
  voiceAssistantEventsBound = true;
}

async function handleVoiceAiAssistRequest(event) {
  event.preventDefault();

  const transcript = String(event.detail?.transcript || "").trim();
  if (!transcript) {
    return;
  }

  if (typeof window.handleVoiceIntent !== "function") {
    showToast("AI assist is not available in this build.", "warning");
    speakVoiceAssistantMessage("AI assist is not available right now.");
    return;
  }

  try {
    await window.handleVoiceIntent(transcript);
  } catch (error) {
    const message = error?.message || "AI assist is unavailable right now.";
    console.warn("AI assist request failed:", error);

    if (/not configured/i.test(message)) {
      showToast("AI assist is not configured on the backend yet. Add OPENAI_API_KEY and restart the backend.", "warning");
      speakVoiceAssistantMessage("AI assist is not configured on the backend yet.");
      return;
    }

    showToast(message, "warning");
    speakVoiceAssistantMessage("I could not process that request right now. Please try again.");
  }
}

function handleVoiceAiIntent(event) {
  const intent = event.detail?.intent;
  if (!intent || typeof intent !== "object") {
    return;
  }

  applyVoiceIntent(intent);
}

function applyVoiceIntent(intent) {
  const type = String(intent.intent || "").trim().toLowerCase();

  if (type === "book") {
    applyVoiceBookingIntent(intent);
    return;
  }

  if (type === "history") {
    if (getPageName() === "history") {
      showToast("Your booking center is already open.", "success");
      speakVoiceAssistantMessage("Your booking center is already open.");
      return;
    }

    window.location.href = "/history.html";
    return;
  }

  if (type === "cancel") {
    if (getPageName() !== "history") {
      window.location.href = "/history.html";
      return;
    }

    showToast("Open the booking card you want and use the Cancel booking button there.", "warning");
    speakVoiceAssistantMessage("Open the booking card you want and use the cancel booking button.");
    return;
  }

  if (type === "help") {
    const helpMessage =
      getPageName() === "book"
        ? "You can ask me to book a car, open booking history, or filter by car and location."
        : "You can ask me to open bookings, start a new booking, or help with the next step.";
    showToast(helpMessage, "success");
    speakVoiceAssistantMessage(helpMessage);
  }
}

function restoreStoredVoiceBookingIntent() {
  const raw = sessionStorage.getItem("voiceBooking");
  if (!raw) {
    return;
  }

  let intent = null;
  try {
    intent = JSON.parse(raw);
  } catch (error) {
    console.warn("Stored voice booking intent is invalid:", error);
  }

  sessionStorage.removeItem("voiceBooking");

  if (intent) {
    applyVoiceBookingIntent(intent);
  }
}

function applyVoiceBookingIntent(intent) {
  if (getPageName() !== "book") {
    sessionStorage.setItem("voiceBooking", JSON.stringify(intent));
    window.location.href = "/book.html";
    return;
  }

  if (!dom.carGrid || !pageState.cars.length) {
    sessionStorage.setItem("voiceBooking", JSON.stringify(intent));
    return;
  }

  const requestedCar = String(intent.car || "").trim();
  const requestedLocation = String(intent.location || "").trim();

  if (dom.carSearchInput && requestedCar) {
    dom.carSearchInput.value = requestedCar;
    pageState.filters.carSearch = requestedCar.toLowerCase();
  }

  if (dom.carLocationSelect && requestedLocation) {
    const locationOption = Array.from(dom.carLocationSelect.options || []).find(
      (option) =>
        option.value !== "all" &&
        option.value.trim().toLowerCase() === requestedLocation.toLowerCase()
    );

    if (locationOption) {
      dom.carLocationSelect.value = locationOption.value;
      pageState.filters.carLocation = locationOption.value;
    }
  }

  renderCarGrid();

  const targetCar = findVoiceBookingCar(intent);
  if (!targetCar) {
    const noMatchMessage = requestedCar
      ? `I could not find ${requestedCar} in the current fleet.`
      : "I could not find a car that matches that request.";
    showToast(noMatchMessage, "warning");
    speakVoiceAssistantMessage(noMatchMessage);
    return;
  }

  const form = dom.carGrid.querySelector(`[data-car-form="${Number(targetCar.id)}"]`);
  if (!form) {
    return;
  }

  const appliedDates = applyVoiceDatesToBookingForm(form, intent);
  form.scrollIntoView({ behavior: "smooth", block: "center" });

  const carName = `${targetCar.brand || "A6"} ${targetCar.model || "Vehicle"}`.trim();
  const confirmationMessage = appliedDates.applied
    ? `I found ${carName} and filled the booking dates for you.`
    : `I found ${carName}. Select or review the dates, then continue with payment.`;

  showToast(confirmationMessage, "success");
  speakVoiceAssistantMessage(confirmationMessage);
}

function findVoiceBookingCar(intent) {
  const requestedCar = String(intent.car || "").trim().toLowerCase();
  const requestedLocation = String(intent.location || "").trim().toLowerCase();

  const candidates = pageState.cars.filter((car) => {
    const searchable = `${car.brand || ""} ${car.model || ""}`.trim().toLowerCase();
    const location = String(car.location || "").trim().toLowerCase();
    const matchesCurrentSearch =
      !pageState.filters.carSearch ||
      `${searchable} ${location}`.includes(pageState.filters.carSearch);
    const matchesCurrentLocation =
      pageState.filters.carLocation === "all" ||
      String(car.location || "").trim() === pageState.filters.carLocation;
    const matchesRequestedCar = !requestedCar || searchable.includes(requestedCar);
    const matchesRequestedLocation =
      !requestedLocation || location.includes(requestedLocation);

    return (
      matchesCurrentSearch &&
      matchesCurrentLocation &&
      matchesRequestedCar &&
      matchesRequestedLocation
    );
  });

  if (!candidates.length) {
    return null;
  }

  return candidates[0];
}

function applyVoiceDatesToBookingForm(form, intent) {
  const startInput = form.querySelector("[data-start-date]");
  const endInput = form.querySelector("[data-end-date]");
  if (!startInput || !endInput) {
    return { applied: false };
  }

  const startDate = normalizeVoiceDateInput(intent.start_date);
  const endDate =
    normalizeVoiceDateInput(intent.end_date) ||
    deriveVoiceEndDate(startDate, intent.days);

  if (startDate) {
    startInput.value = startDate;
    syncBookingFormDates(form, { changedField: "start", notify: false });
  }

  if (endDate) {
    endInput.value = endDate;
    syncBookingFormDates(form, { changedField: "end", notify: false });
  }

  return {
    applied: Boolean(startInput.value && endInput.value),
    start: startInput.value || "",
    end: endInput.value || "",
  };
}

function normalizeVoiceDateInput(value) {
  if (!value) {
    return "";
  }

  const date = parseDate(value);
  return date ? formatDateInput(date) : "";
}

function deriveVoiceEndDate(startDate, days) {
  const tripDays = Number(days);
  if (!startDate || !Number.isFinite(tripDays) || tripDays < 1) {
    return "";
  }

  const date = parseDate(startDate);
  if (!date) {
    return "";
  }

  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + Math.max(0, tripDays - 1));
  return formatDateInput(endDate);
}

function speakVoiceAssistantMessage(message) {
  if (!message) {
    return;
  }

  if (window.voiceAssistant && typeof window.voiceAssistant.speak === "function") {
    window.voiceAssistant.speak(message);
    return;
  }

  if (typeof window.speak === "function") {
    window.speak(message, "en");
  }
}

function ensureToastHost() {
  let root = document.getElementById("toastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "toastRoot";
    root.className = "toast-root";
    document.body.appendChild(root);
  }
  dom.toastRoot = root;
  return root;
}

function ensureModalHost() {
  let root = document.getElementById("modalRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "modalRoot";
    document.body.appendChild(root);
  }
  dom.modalRoot = root;
  return root;
}
