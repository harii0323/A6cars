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
  carpool: {
    trips: [],
    vehicles: [],
    rentalVehicles: [],
    activeTab: "find",
    activeDashSubtab: "created",
    searchFilters: {},
    pendingUploadImageUrl: "",
    dashboardData: null,
  },
};

const PENDING_BOOKING_KEY = "pendingBookingContext";

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
  init3DTiltEngine();
  setTimeout(init3DTiltEngine, 400);
});

const pageInitializers = {
  landing: initLandingPage,
  login: initLoginPage,
  register: initRegisterPage,
  home: initHomePage,
  book: initBookPage,
  history: initHistoryPage,
  "booking-alias": initBookingAliasPage,
  carpool: initCarpoolPage,
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
    "carpoolTabBar",
    "carpoolSpotlight",
    "findSection",
    "createSection",
    "vehiclesSection",
    "addVehicleSection",
    "dashboardSection",
    "carpoolSearchForm",
    "carpoolTripGrid",
    "offerRideForm",
    "offerVehicleSelect",
    "rentedCarNoticeBanner",
    "personalVehiclesGrid",
    "rentedVehiclesGrid",
    "registerVehicleForm",
    "dashboardMetrics",
    "dashboardSubtabs",
    "dashCreatedList",
    "dashJoinedList",
    "dashIncomingRequestsList",
    "dashSentRequestsList",
    "dashUpcomingList",
    "dashCompletedList",
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

    if (action === "close-nav") {
      closeResponsiveNavigation();
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

    if (action === "view-car-details") {
      openCarDetailsModal(Number(actionEl.dataset.carId));
      return;
    }

    if (action === "switch-carpool-tab") {
      switchCarpoolTab(actionEl.dataset.tab);
      return;
    }

    if (action === "join-carpool") {
      const tripId = Number(actionEl.dataset.tripId);
      const trip = (pageState.carpool?.trips || []).find((t) => t.id === tripId);
      if (trip) {
        openJoinCarpoolModal(trip);
      } else {
        fetchJson(`/api/carpool/trips/${tripId}`).then((res) => {
          if (res?.trip) openJoinCarpoolModal(res.trip);
        }).catch((err) => showToast(err.message || "Failed to load trip details.", "error"));
      }
      return;
    }

    if (action === "manage-trip-passengers") {
      openManagePassengersModal(Number(actionEl.dataset.tripId));
      return;
    }

    if (action === "update-trip-status") {
      const tripId = Number(actionEl.dataset.tripId);
      const newStatus = actionEl.dataset.status;
      updateTripStatusFlow(tripId, newStatus);
      return;
    }

    if (action === "accept-carpool-request") {
      acceptJoinRequest(Number(actionEl.dataset.requestId));
      return;
    }

    if (action === "reject-carpool-request") {
      rejectJoinRequest(Number(actionEl.dataset.requestId));
      return;
    }

    if (action === "cancel-carpool-request") {
      cancelJoinRequest(Number(actionEl.dataset.requestId));
      return;
    }

    if (action === "leave-carpool-trip") {
      leaveCarpoolTrip(Number(actionEl.dataset.tripId));
      return;
    }

    if (action === "review-carpool-driver") {
      openReviewDriverModal(Number(actionEl.dataset.tripId), actionEl.dataset.driverName || "Driver");
      return;
    }

    if (action === "offer-car-carpool") {
      const vehId = actionEl.dataset.vehicleId;
      switchCarpoolTab("create", { preselectVehicleId: vehId });
      return;
    }

    if (action === "offer-rental-carpool") {
      const bId = actionEl.dataset.bookingId;
      switchCarpoolTab("create", { preselectVehicleId: `rental_${bId}` });
      return;
    }

    if (action === "delete-user-vehicle") {
      deleteUserVehicle(Number(actionEl.dataset.vehicleId));
      return;
    }

    const bookingId = parseBookingId(actionEl.dataset.bookingId);
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
      closeResponsiveNavigation();
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
    toggle.setAttribute("aria-label", "Toggle navigation menu");
    toggle.setAttribute("aria-controls", dom.siteNavCluster.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `
      <span class="nav-toggle-bars" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
      <span class="sr-only">Toggle Menu</span>
    `;
    dom.siteHeader.insertBefore(toggle, dom.siteNavCluster);
    dom.siteNavToggle = toggle;
  }

  if (!dom.siteNavBackdrop) {
    const backdrop = document.createElement("div");
    backdrop.id = "siteNavBackdrop";
    backdrop.className = "nav-backdrop";
    backdrop.dataset.action = "close-nav";
    document.body.appendChild(backdrop);
    dom.siteNavBackdrop = backdrop;
  }

  if (!siteNavMediaQuery) {
    siteNavMediaQuery = window.matchMedia("(max-width: 768px)");
    const syncNav = () => syncResponsiveNavigation();
    if (typeof siteNavMediaQuery.addEventListener === "function") {
      siteNavMediaQuery.addEventListener("change", syncNav);
    } else {
      siteNavMediaQuery.addListener(syncNav);
    }
  }

  dom.siteNavCluster.addEventListener("click", (e) => {
    if (e.target.closest("a, button[data-action='logout']") && siteNavMediaQuery?.matches) {
      closeResponsiveNavigation();
    }
  });

  window.addEventListener("scroll", () => {
    if (dom.siteHeader) {
      dom.siteHeader.classList.toggle("is-scrolled", window.scrollY > 15);
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && dom.siteHeader.classList.contains("is-nav-open")) {
      closeResponsiveNavigation();
    }
  }, { passive: true });

  syncResponsiveNavigation();
}

function toggleResponsiveNavigation() {
  if (!dom.siteHeader) {
    return;
  }

  const willOpen = !dom.siteHeader.classList.contains("is-nav-open");
  dom.siteHeader.classList.toggle("is-nav-open", willOpen);
  document.body.classList.toggle("nav-drawer-open", willOpen);

  if (dom.siteNavToggle) {
    dom.siteNavToggle.setAttribute("aria-expanded", String(willOpen));
    dom.siteNavToggle.classList.toggle("is-active", willOpen);
  }
}

function closeResponsiveNavigation() {
  if (!dom.siteHeader) {
    return;
  }

  dom.siteHeader.classList.remove("is-nav-open");
  document.body.classList.remove("nav-drawer-open");

  if (dom.siteNavToggle) {
    dom.siteNavToggle.setAttribute("aria-expanded", "false");
    dom.siteNavToggle.classList.remove("is-active");
  }
}

function syncResponsiveNavigation() {
  if (!dom.siteHeader || !dom.siteNavToggle) {
    return;
  }

  const compact = Boolean(siteNavMediaQuery?.matches);
  if (!compact) {
    closeResponsiveNavigation();
  }
  dom.siteNavToggle.hidden = !compact;
  dom.siteNavToggle.style.display = compact ? "flex" : "none";
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

function getPendingBookingContext() {
  const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
  if (!raw) {
    return null;
  }

  try {
    const context = JSON.parse(raw);
    return context && Number(context.carId) ? context : null;
  } catch (error) {
    console.warn("Stored booking context is invalid:", error);
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
    return null;
  }
}

function savePendingBookingContext(context) {
  sessionStorage.setItem(
    PENDING_BOOKING_KEY,
    JSON.stringify({
      ...context,
      createdAt: new Date().toISOString(),
      returnPath: "/book.html",
    })
  );
}

function clearPendingBookingContext() {
  sessionStorage.removeItem(PENDING_BOOKING_KEY);
}

function markPendingBookingAuthCancelled() {
  const pendingBooking = getPendingBookingContext();
  if (!pendingBooking) {
    return;
  }

  savePendingBookingContext({
    ...pendingBooking,
    continueAfterAuth: false,
  });
}

function getPostAuthRedirect() {
  const pendingBooking = getPendingBookingContext();
  if (pendingBooking?.returnPath) {
    return pendingBooking.returnPath;
  }
  return sessionStorage.getItem("postLoginRedirect") || "/home.html";
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
  const urlSearch = window.location.search || "";
  const isLogged = hasUserSession();
  const isAdmin = hasAdminSession();

  const isCarpoolVehicles = page === "carpool" && (urlSearch.includes("tab=vehicles") || urlSearch.includes("tab=add-vehicle"));
  const isCarpoolDashboard = page === "carpool" && urlSearch.includes("tab=dashboard");
  const isCarpoolMain = page === "carpool" && !isCarpoolVehicles && !isCarpoolDashboard;

  const links = [
    navLink(isLogged ? "/home.html" : "/index.html", "Home", page === "home" || page === "landing"),
    navLink("/book.html", "Cars", page === "book"),
    navLink("/carpool.html", "Carpooling", isCarpoolMain),
    navLink("/history.html", "My Rentals", page === "history" || page === "booking-alias"),
    navLink("/carpool.html?tab=vehicles", "My Vehicles", isCarpoolVehicles),
    navLink("/carpool.html?tab=dashboard", "My Trips", isCarpoolDashboard),
    navLink(isLogged ? "/home.html#profile" : "/login.html", "Profile", false),
  ];

  let actions = "";
  if (isLogged) {
    actions = `
      <span class="user-pill" title="Signed in as ${escapeHtml(session.email || session.name || 'Member')}">
        <span class="user-avatar-dot"></span>
        <span class="user-name-text">${escapeHtml(session.name || "Member")}</span>
      </span>
      <button class="button button-ghost button-logout" type="button" data-action="logout">Logout</button>
    `;
  } else if (isAdmin) {
    links.push(navLink("/admin.html", "Admin", false));
    actions = `
      <span class="user-pill">Admin</span>
      <button class="button button-ghost button-logout" type="button" data-action="logout">Logout</button>
    `;
  } else {
    actions = `
      <a class="nav-link nav-login-link" href="/login.html">Login</a>
      <a class="button button-primary nav-signup-btn" href="/register.html">Sign Up</a>
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
      dom.landingGreeting.innerHTML = `Welcome back, <span class="accent-text">${escapeHtml(session.name || "Driver")}</span>.`;
    } else if (hasAdminSession()) {
      dom.landingGreeting.innerHTML = `Admin Workspace <span class="accent-text">Active</span>.`;
    } else {
      dom.landingGreeting.innerHTML = `YOUR <span class="accent-text">JOURNEY.</span><br />YOUR <span class="gradient-text-alt">CAR.</span><br />YOUR WAY.`;
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
    <a class="button button-primary" href="/book.html">Browse Cars</a>
    <a class="button button-warm" href="/login.html">Sign In</a>
  `;
}

async function initLoginPage() {
  if (hasUserSession()) {
    window.location.replace(getPostAuthRedirect());
    return;
  }

  renderAuthBookingNotice("login");

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

      const redirectTarget = getPostAuthRedirect();
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
    window.location.replace(getPostAuthRedirect());
    return;
  }

  renderAuthBookingNotice("register");

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

      if (result.token && result.customer_id) {
        clearAdminSession();
        setUserSession(result);
      }

      setFeedback(dom.registerFeedback, result.message || "Registration successful.", "success");
      showToast(result.token ? "Account created. Continuing your booking." : "Account created. You can sign in now.", "success");
      window.setTimeout(() => {
        if (result.token && result.customer_id) {
          const redirectTarget = getPostAuthRedirect();
          sessionStorage.removeItem("postLoginRedirect");
          window.location.href = redirectTarget;
        } else {
          window.location.href = "/login.html";
        }
      }, 900);
    } catch (error) {
      setFeedback(dom.registerFeedback, error.message || "Registration failed.", "error");
    } finally {
      setButtonBusy(submitBtn, false);
    }
  });
}

function renderAuthBookingNotice(mode) {
  const pendingBooking = getPendingBookingContext();
  if (!pendingBooking) {
    return;
  }

  const formCard = document.querySelector(".auth-form-card");
  if (!formCard || formCard.querySelector(".auth-context-note")) {
    return;
  }

  const carName = pendingBooking.carLabel || "your selected car";
  const dateRange =
    pendingBooking.startDate && pendingBooking.endDate
      ? `${formatDate(pendingBooking.startDate)} to ${formatDate(pendingBooking.endDate)}`
      : "your selected dates";
  const verb = mode === "register" ? "Create an account" : "Sign in";
  const alternateLink =
    mode === "register"
      ? '<a href="/login.html"><strong>Sign in instead</strong></a>'
      : '<a href="/register.html"><strong>Create an account instead</strong></a>';

  const note = document.createElement("div");
  note.className = "auth-context-note";
  note.innerHTML = `
    <strong>Authentication is required to continue booking.</strong>
    <span>${escapeHtml(verb)} to keep booking ${escapeHtml(carName)} for ${escapeHtml(dateRange)}. Your car, dates, and payment choice are saved.</span>
    <span>${alternateLink} or <a href="/book.html?authCancelled=1"><strong>return to the selected car</strong></a>.</span>
  `;
  formCard.insertBefore(note, formCard.firstChild);
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
  init3DTiltEngine();
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
  if (new URLSearchParams(window.location.search).get("authCancelled") === "1") {
    markPendingBookingAuthCancelled();
    window.history.replaceState({}, "", "/book.html");
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
    await submitCarBooking(form, event.submitter);
  });

  await loadBookPageData();
  restoreStoredVoiceBookingIntent();
  await restorePendingBookingContextAfterAuth();
}

async function loadBookPageData() {
  setContainerLoading(dom.carGrid, "Loading cars");
  const customerId = readUserSession().customerId;
  const [cars, discounts] = await Promise.all([
    fetchJson("/api/cars"),
    hasUserSession() ? fetchJson(`/api/discounts/${customerId}`).catch(() => []) : Promise.resolve([]),
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
  init3DTiltEngine();
}

function buildCarCardMarkup(car) {
  const bookings = pageState.carBookings[Number(car.id)] || [];
  const isAvailable = bookings.length === 0;
  const rating = car.rating || (4.6 + (Number(car.id) % 4) * 0.1).toFixed(1);
  const fuel = car.fuel_type || "Petrol";
  const mileage = car.mileage || "18 km/l";
  const seats = car.seats || 5;
  const carType = car.type || "Sedan";

  return `
    <article class="vehicle-card modern-car-card">
      <div class="vehicle-media">
        ${getCarMediaMarkup(car)}
        <span class="car-rating-chip"><span class="star-icon">★</span> ${rating}</span>
        <span class="car-availability-chip ${isAvailable ? 'badge-success' : 'badge-warning'}">
          ${isAvailable ? '● Available Now' : '● Dates Blocked'}
        </span>
      </div>
      <div class="vehicle-body">
        <div class="vehicle-head">
          <div>
            <span class="eyebrow">${escapeHtml(String(car.year || "2023"))} &bull; ${escapeHtml(carType)}</span>
            <h3 class="car-title">${escapeHtml(car.brand || "A6")} ${escapeHtml(car.model || "Vehicle")}</h3>
            <p class="support-copy"><span class="loc-pin">📍</span> ${escapeHtml(car.location || "Fleet Hub")}</p>
          </div>
          <div class="price-container">
            <span class="price-chip">${formatCurrency(car.daily_rate || 0)}</span>
            <small class="per-day-note">/ day</small>
          </div>
        </div>

        <div class="car-spec-chips">
          <span class="spec-pill">⛽ ${escapeHtml(fuel)}</span>
          <span class="spec-pill">⚡ ${escapeHtml(mileage)}</span>
          <span class="spec-pill">👥 ${escapeHtml(String(seats))} Seats</span>
        </div>

        <form class="field-grid booking-inline-form" data-car-form="${Number(car.id)}">
          <label class="field-block">
            <span>Start date</span>
            <button class="date-trigger" type="button" data-action="open-date-picker" data-field="start">
              <span class="date-trigger-value" data-start-date-display>Select start date</span>
              <span class="date-trigger-note" data-start-date-note>Booked dates disabled</span>
            </button>
            <input type="hidden" data-start-date value="" />
          </label>
          <label class="field-block">
            <span>End date</span>
            <button class="date-trigger" type="button" data-action="open-date-picker" data-field="end">
              <span class="date-trigger-value" data-end-date-display>Select end date</span>
              <span class="date-trigger-note" data-end-date-note>Select start date first</span>
            </button>
            <input type="hidden" data-end-date value="" />
          </label>
          <div class="card-actions" style="grid-column: 1 / -1;">
            <button class="button button-primary" type="submit" data-payment-plan="reserve">Rent Now</button>
            <button class="button button-navy" type="button" data-action="view-car-details" data-car-id="${Number(car.id)}">View Details</button>
          </div>
        </form>
      </div>
    </article>
  `;
}

function openCarDetailsModal(carId) {
  const car = pageState.cars.find((item) => Number(item.id) === Number(carId));
  if (!car) {
    showToast("That vehicle could not be found.", "warning");
    return;
  }

  const bookings = pageState.carBookings[Number(carId)] || [];
  const images = Array.isArray(car.images) && car.images.length
    ? car.images.map((img) => getAssetUrl(img))
    : car.image_url
    ? [getAssetUrl(car.image_url)]
    : [];

  const rating = car.rating || (4.6 + (Number(car.id) % 4) * 0.1).toFixed(1);

  const content = document.createElement("div");
  content.className = "car-details-split-layout";
  content.innerHTML = `
    <div class="car-gallery-column">
      <div class="main-gallery-view">
        ${images.length ? `<img id="carGalleryMainImg" src="${images[0]}" alt="${escapeHtml(`${car.brand} ${car.model}`)}" />` : `<div style="padding: 60px; text-align: center; background: #101828; color: #D0D5DD; border-radius: 16px;">🚗 No image available</div>`}
      </div>
      ${images.length > 1 ? `
        <div class="gallery-thumbs-row">
          ${images.map((img, idx) => `<img class="gallery-thumb ${idx === 0 ? 'active' : ''}" src="${img}" onclick="document.getElementById('carGalleryMainImg').src='${img}'; document.querySelectorAll('.gallery-thumb').forEach(t=>t.classList.remove('active')); this.classList.add('active');" />`).join("")}
        </div>
      ` : ""}
      <div class="car-specs-pill-row">
        <span class="spec-pill">⛽ ${escapeHtml(car.fuel_type || "Petrol")}</span>
        <span class="spec-pill">⚡ ${escapeHtml(car.mileage || "18 km/l")}</span>
        <span class="spec-pill">👥 ${escapeHtml(String(car.seats || 5))} Seats</span>
        <span class="spec-pill">📍 ${escapeHtml(car.location || "Fleet Hub")}</span>
      </div>
    </div>

    <div class="car-booking-panel-dark">
      <div class="panel-rate-box">
        <span class="panel-rate-label">Daily Rental Rate</span>
        <div class="panel-price-row">
          <span class="panel-price-val">${formatCurrency(car.daily_rate || 0)}</span>
          <span class="panel-price-unit">/ day</span>
        </div>
      </div>

      <div class="booking-terms-box">
        <div class="term-line">
          <span>Vehicle Type:</span>
          <strong>${escapeHtml(car.type || "Sedan")}</strong>
        </div>
        <div class="term-line">
          <span>Rating:</span>
          <strong style="color: #F79009;">★ ${rating} / 5.0</strong>
        </div>
        <div class="term-line">
          <span>Deposit Requirement:</span>
          <strong style="color: var(--accent);">10% Advance Deposit</strong>
        </div>
        <div class="term-line">
          <span>Collection:</span>
          <strong>Instant PIN & QR Handoff</strong>
        </div>
      </div>

      <div class="panel-availability-summary">
        <h4>Availability Schedule</h4>
        <p>${bookings.length ? `${bookings.length} upcoming reservation window(s). All other dates are open.` : "Completely available for immediate reservation."}</p>
        ${bookings.length ? `
          <div class="blocked-dates-list">
            ${bookings.map(b => `<span class="blocked-chip">Blocked: ${formatDate(b.start_date)} - ${formatDate(b.end_date)}</span>`).join("")}
          </div>
        ` : ""}
      </div>

      <div class="panel-cta-actions">
        <button class="button button-primary" type="button" data-action="close-modal" onclick="document.querySelector('[data-car-form=\\'${Number(car.id)}\\'] [data-field=\\'start\\']')?.focus();">
          Rent This Car Now
        </button>
        <button class="button button-ghost" type="button" data-action="close-modal">Close</button>
      </div>
    </div>
  `;

  openModal({
    title: `${car.brand || "A6"} ${car.model || "Vehicle"} (${car.year || "2023"})`,
    subtitle: "Complete vehicle specifications, photos, and current rental terms.",
    size: "wide",
    content,
  });
}

function getCarMediaMarkup(car) {
  const firstImage = Array.isArray(car.images) && car.images.length ? getAssetUrl(car.images[0]) : "";
  if (firstImage) {
    return `<img src="${firstImage}" alt="${escapeHtml(`${car.brand || ""} ${car.model || ""}`.trim())}" loading="lazy" onerror="this.onerror=null;this.src='/assets/hero-car.jpg';" />`;
  }

  const shortLabel = escapeHtml(
    `${String(car.brand || "A").slice(0, 1)}${String(car.model || "6").slice(0, 1)}`.toUpperCase()
  );
  return `<div class="vehicle-placeholder">${shortLabel}</div>`;
}

async function submitCarBooking(form, submitter = null) {
  if (form.dataset.bookingSubmitting === "true") {
    return;
  }

  const carId = Number(form.dataset.carForm);
  const car = pageState.cars.find((item) => Number(item.id) === carId);
  const previousStart = form.querySelector("[data-start-date]")?.value || "";
  const previousEnd = form.querySelector("[data-end-date]")?.value || "";
  const submitBtn = form.querySelector('button[type="submit"]');
  const paymentPlan = submitter?.dataset?.paymentPlan === "full" ? "full" : "reserve";

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

  if (!hasUserSession()) {
    savePendingBookingContext({
      carId,
      carLabel: `${car.brand || "A6"} ${car.model || "Vehicle"}`.trim(),
      location: car.location || "",
      startDate: start,
      endDate: end,
      paymentPlan,
      continueAfterAuth: true,
    });
    sessionStorage.setItem("postLoginRedirect", "/book.html");
    showToast("Sign in or create an account to continue this booking.", "warning");
    window.location.href = "/login.html?bookingRequired=1";
    return;
  }

  form.dataset.bookingSubmitting = "true";
  setButtonBusy(submitter || submitBtn, true, paymentPlan === "reserve" ? "Reserving..." : "Booking...");

  try {
    const result = await fetchJson("/api/book", {
      method: "POST",
      body: JSON.stringify({
        car_id: carId,
        start_date: start,
        end_date: end,
        payment_plan: paymentPlan,
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
      amount_due: result.amount_due,
      payment_plan: result.payment_plan,
      reserve_amount: result.reserve_amount,
      remaining_amount: result.remaining_amount,
      paid: false,
      verified: false,
      status: "pending",
      images: car.images || [],
    };

    rememberBooking(draftBooking);
    showToast(
      paymentPlan === "reserve"
        ? "Reservation created. Pay 10% now to hold the car."
        : "Booking created. Finish payment now or later from your booking center.",
      "success"
    );
    await loadBookPageData();
    openPaymentModal(draftBooking, result.payment_qr);
  } catch (error) {
    showToast(error.message || "Booking failed.", "error");
  } finally {
    delete form.dataset.bookingSubmitting;
    setButtonBusy(submitter || submitBtn, false);
  }
}

async function restorePendingBookingContextAfterAuth() {
  const pendingBooking = getPendingBookingContext();
  if (!pendingBooking || getPageName() !== "book") {
    return;
  }

  const carId = Number(pendingBooking.carId);
  const form = dom.carGrid?.querySelector(`[data-car-form="${carId}"]`);
  if (!form) {
    if (hasUserSession()) {
      clearPendingBookingContext();
    }
    showToast("The selected car is no longer available. Choose another car to continue.", "warning");
    return;
  }

  const startInput = form.querySelector("[data-start-date]");
  const endInput = form.querySelector("[data-end-date]");
  if (startInput) startInput.value = pendingBooking.startDate || "";
  if (endInput) endInput.value = pendingBooking.endDate || "";
  syncBookingFormDates(form, { notify: false });
  form.scrollIntoView({ behavior: "smooth", block: "center" });

  const submitter =
    form.querySelector(`[data-payment-plan="${pendingBooking.paymentPlan === "full" ? "full" : "reserve"}"]`) ||
    form.querySelector('button[type="submit"]');

  const shouldContinue = hasUserSession() && pendingBooking.continueAfterAuth;
  if (!shouldContinue) {
    showToast("Your selected car and dates are restored.", "success");
    return;
  }

  clearPendingBookingContext();
  showToast("You are signed in. Continuing your booking now.", "success");
  await submitCarBooking(form, submitter);
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
    const search = (pageState.filters.historySearch || "").trim().toLowerCase();
    const bId = getBookingId(booking);
    const bRef = String(booking.booking_reference || `A6-2026-${bId}`).toLowerCase();
    const parsedQuery = parseBookingId(search);

    const matchesSearch =
      !search ||
      (parsedQuery && bId === parsedQuery) ||
      bRef.includes(search) ||
      `${booking.brand || ""} ${booking.model || ""} ${booking.location || ""} ${bId} ${bRef}`
        .toLowerCase()
        .includes(search);

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

    openPaymentModal(
      {
        ...booking,
        amount_due: result.amount,
        payment_plan: result.payment_plan || booking.payment_plan,
        current_payment_stage: result.current_payment_stage || booking.current_payment_stage,
        reserve_amount: result.reserve_amount ?? booking.reserve_amount,
        remaining_amount: result.remaining_amount ?? booking.remaining_amount,
      },
      result.qr
    );
  } catch (error) {
    showToast(error.message || "Could not load the payment QR.", "error");
  }
}

function openPaymentModal(booking, qr) {
  const bookingId = getBookingId(booking);
  const paymentStage = String(booking.current_payment_stage || (booking.payment_plan === "reserve" ? "reserve" : "full"));
  const amountDue = Number(booking.amount_due || booking.amount || 0);
  const paymentLabel =
    paymentStage === "reserve"
      ? "Reserve amount"
      : paymentStage === "final"
      ? "Remaining amount"
      : "Amount";
  const paymentCopy =
    paymentStage === "reserve"
      ? "Pay 10% now to reserve the car. Admin will verify this reference, then the remaining 90% payment will open before pickup."
      : paymentStage === "final"
      ? "Pay the remaining 90% and submit the reference. Admin must match it before pickup QR access is enabled."
      : "Scan the QR to pay, then paste the payment reference. Admin will match this reference with your booking before confirming payment.";
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
        <span>${paymentLabel}</span>
        <strong>${formatCurrency(amountDue)}</strong>
      </div>
    </div>
    <article class="qr-card">
      <img src="${qr}" alt="Payment QR" />
      <p class="detail-note">${escapeHtml(paymentCopy)}</p>
    </article>
    <label class="field-block">
      <span>Payment reference ID</span>
      <input class="input" type="text" id="paymentReferenceInput" placeholder="Example: UPI123456" />
    </label>
    <div class="feedback feedback-error" id="paymentVerifyFeedback"></div>
    <div class="modal-actions">
      <button class="button button-primary" type="button" id="paymentVerifyBtn">Submit Reference</button>
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
    setButtonBusy(verifyBtn, true, "Submitting...");

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
      showToast(result.message || "Payment reference submitted.", "success");
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
  const bookingRef = payload.booking_reference || booking.booking_reference || `A6-2026-${bookingId}`;
  const txnId = payload.transaction_id || booking.transaction_id || `TXN-A6-${74000000 + Number(bookingId)}`;
  const collectionPin = payload.collection_pin || booking.collection_pin || "5827";
  const amountPaid = formatCurrency(payload.amount || booking.amount || 0);
  const datesText = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
  const hasReturnQr = Boolean(payload.return_qr);

  const content = document.createElement("div");
  content.className = "stack-list";
  content.innerHTML = `
    <div class="badge-row">
      <span class="status-badge badge-success">Payment confirmed</span>
      <span class="status-badge badge-sky">Booking #${bookingId}</span>
    </div>

    <div class="itinerary-confirmed-card" style="background: rgba(244, 239, 230, 0.7); border: 1px solid rgba(216, 154, 61, 0.3); border-radius: 16px; padding: 18px; margin: 10px 0;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 12px;">
        <div>
          <span style="font-size: 0.8rem; color: #53657f; display: block;">Booking ID</span>
          <strong style="font-size: 1.05rem; font-family: monospace; color: #14253f;">${escapeHtml(bookingRef)}</strong>
        </div>
        <div>
          <span style="font-size: 0.8rem; color: #53657f; display: block;">Transaction ID</span>
          <strong style="font-size: 1.05rem; font-family: monospace; color: #14253f;">${escapeHtml(txnId)}</strong>
        </div>
        <div>
          <span style="font-size: 0.8rem; color: #53657f; display: block;">Amount Paid</span>
          <strong style="font-size: 1.05rem; color: #178a7b;">${amountPaid}</strong>
        </div>
        <div>
          <span style="font-size: 0.8rem; color: #53657f; display: block;">Collection PIN</span>
          <strong style="font-size: 1.15rem; color: #a0640a; letter-spacing: 0.08em; font-family: monospace;">${escapeHtml(collectionPin)}</strong>
        </div>
      </div>
      <div style="border-top: 1px dashed rgba(26,43,71,0.15); padding-top: 10px;">
        <span style="font-size: 0.8rem; color: #53657f; display: block;">Pickup Dates</span>
        <strong style="color: #14253f;">${datesText}</strong>
      </div>
    </div>

    <p class="detail-note">${
      hasReturnQr
        ? "Save the available QR passes now. The collection QR or Collection PIN is used at pickup, and the return QR is used when you hand the car back."
        : "Your collection QR and PIN are ready now. Hand over the Collection PIN at the pickup counter to verify vehicle release."
    }</p>
    <div class="qr-grid">
      <article class="qr-card">
        <h4>Collection QR</h4>
        <img src="${payload.collection_qr}" alt="Collection QR" />
        <div class="card-actions">
          <button class="button button-secondary button-inline" type="button" id="downloadCollectionBtn">Download</button>
        </div>
      </article>
      ${
        hasReturnQr
          ? `<article class="qr-card">
        <h4>Return QR</h4>
        <img src="${payload.return_qr}" alt="Return QR" />
        <div class="card-actions">
          <button class="button button-secondary button-inline" type="button" id="downloadReturnBtn">Download</button>
        </div>
      </article>`
          : ""
      }
    <div class="modal-actions">
      <a class="button button-accent" href="/carpool.html?action=offer-rental&booking_id=${bookingId}">🚗 Use This Rented Car for Carpooling</a>
      <a class="button button-primary" href="/history.html">Open Booking Center</a>
      <button class="button button-secondary" type="button" data-action="close-modal">Done</button>
    </div>
  `;

  const modal = openModal({
    title: "Reservation Confirmed",
    subtitle: `${booking.brand || "Your vehicle"} ${booking.model || ""} is confirmed and linked to your itinerary.`,
    size: "wide",
    content,
  });

  modal.querySelector("#downloadCollectionBtn")?.addEventListener("click", () => {
    downloadDataUrl(payload.collection_qr, `collection_qr_${bookingId}.png`);
  });

  if (hasReturnQr) {
    modal.querySelector("#downloadReturnBtn")?.addEventListener("click", () => {
      downloadDataUrl(payload.return_qr, `return_qr_${bookingId}.png`);
    });
  }
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
  init3DTiltEngine();
}

function buildBookingCardMarkup(booking) {
  const bookingId = getBookingId(booking);
  const badges = [];

  if (isCancelled(booking)) {
    badges.push(statusBadge("Cancelled", "danger"));
  } else if (isReturnedBooking(booking)) {
    badges.push(statusBadge("Returned", "success"));
  } else if (isActiveBooking(booking)) {
    badges.push(statusBadge("Active", "sky"));
  } else {
    badges.push(statusBadge("Past trip", "neutral"));
  }

  if (booking.paid) {
    badges.push(statusBadge("Paid", "success"));
  } else if (booking.reserve_paid) {
    badges.push(statusBadge("Reserved 10%", "success"));
  } else if (!isCancelled(booking)) {
    badges.push(statusBadge("Awaiting payment", "warning"));
  }

  if (isReturnedBooking(booking)) {
    badges.push(statusBadge("Return verified", "success"));
  } else if (booking.verified) {
    badges.push(statusBadge("Pickup verified", "violet"));
  }

  const refundStatus = String(booking.refund_status || "").toLowerCase();
  if (refundStatus === "pending") {
    badges.push(statusBadge("Refund pending", "warning"));
  } else if (refundStatus === "processed") {
    badges.push(statusBadge("Refund processed", "success"));
  }

  if (booking.collection_pin && !booking.collection_verified && !isCancelled(booking)) {
    badges.push(`<span class="status-badge" style="background: rgba(216, 154, 61, 0.16); color: #8d5710; font-weight: 800; font-family: monospace;"><i class="fas fa-key"></i> PIN: ${escapeHtml(booking.collection_pin)}</span>`);
  }

  const actions = [];
  if (isAwaitingPayment(booking)) {
    actions.push(
      `<button class="button button-primary button-inline" type="button" data-action="pay-booking" data-booking-id="${bookingId}">Pay now</button>`
    );
  }
  if (booking.collection_qr && !booking.collection_verified && !isCancelled(booking)) {
    actions.push(
      `<button class="button button-secondary button-inline" type="button" data-action="show-collection" data-booking-id="${bookingId}">Collection QR</button>`
    );
  }
  if (
    booking.return_qr &&
    booking.collection_verified &&
    !booking.return_verified &&
    !isCancelled(booking)
  ) {
    actions.push(
      `<button class="button button-secondary button-inline" type="button" data-action="show-return" data-booking-id="${bookingId}">Return QR</button>`
    );
  }
  if (
    !isCancelled(booking) &&
    !isReturnedBooking(booking) &&
    (booking.paid || booking.reserve_paid)
  ) {
    actions.push(
      `<a class="button button-accent button-inline" href="/carpool.html?action=offer-rental&booking_id=${bookingId}" title="Offer this rented vehicle for carpooling during your rental period">🚗 Offer for Carpooling</a>`
    );
  }
  if (canCancelBooking(booking)) {
    actions.push(
      `<button class="button button-danger button-inline" type="button" data-action="cancel-booking" data-booking-id="${bookingId}">Cancel booking</button>`
    );
  }

  const bookingRef = booking.booking_reference || `A6-2026-${bookingId}`;

  return `
    <article class="booking-card${isCancelled(booking) ? " is-cancelled" : ""}">
      <div class="booking-body">
        <div class="booking-head">
          <div>
            <span class="eyebrow">Booking #${bookingId} &bull; ${escapeHtml(bookingRef)}</span>
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
    if (booking.payment_plan === "reserve" && booking.reserve_paid) {
      return "Your 10% reserve payment is verified. Pay the remaining 90% and submit the reference so admin can confirm the booking before pickup.";
    }
    if (booking.payment_plan === "reserve") {
      return "Reservation is waiting for the 10% payment reference to be verified by admin. Missed pickup reservations are cancelled without refund.";
    }
    return "Payment is still pending. Add your payment reference to confirm the booking and unlock the collection and return QR passes.";
  }

  if (isReturnedBooking(booking)) {
    return "Return has already been verified. This trip is complete and the booking can no longer be cancelled.";
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
    return "Payment is confirmed and the reservation is active. Your collection QR is available now, and the return QR will appear after pickup verification.";
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

function formatMetricNumber(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val || 0);
  return num < 10 && num >= 0 ? `0${num}` : String(num);
}

function metricCard(label, value, note, accentClass) {
  const formattedVal = formatMetricNumber(value);
  return `
    <article class="stat-card ${accentClass || ''}">
      <span class="stat-label">${escapeHtml(label)}</span>
      <strong class="stat-value">${escapeHtml(formattedVal)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function emptyStateMarkup(title, copy, icon = "🚗") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHtml(title || "Nothing to show")}</h3>
      <p>${escapeHtml(copy || "Try again in a moment or adjust your search filters.")}</p>
    </div>
  `;
}

function setContainerLoading(container, label) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-shimmer" style="height: 180px; width: 100%; border-radius: 14px;"></div>
      <div class="skeleton-shimmer" style="height: 24px; width: 65%; margin-top: 12px;"></div>
      <div class="skeleton-shimmer" style="height: 16px; width: 45%;"></div>
      <div class="skeleton-shimmer" style="height: 42px; width: 100%; margin-top: 10px;"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-shimmer" style="height: 180px; width: 100%; border-radius: 14px;"></div>
      <div class="skeleton-shimmer" style="height: 24px; width: 65%; margin-top: 12px;"></div>
      <div class="skeleton-shimmer" style="height: 16px; width: 45%;"></div>
      <div class="skeleton-shimmer" style="height: 42px; width: 100%; margin-top: 10px;"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-shimmer" style="height: 180px; width: 100%; border-radius: 14px;"></div>
      <div class="skeleton-shimmer" style="height: 24px; width: 65%; margin-top: 12px;"></div>
      <div class="skeleton-shimmer" style="height: 16px; width: 45%;"></div>
      <div class="skeleton-shimmer" style="height: 42px; width: 100%; margin-top: 10px;"></div>
    </div>
  `;
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBookingId(rawId) {
  if (rawId == null) return 0;
  const str = String(rawId).trim().replace(/^#/, "");
  const match = str.match(/^(?:A6-\d{4}-)?(\d+)$/i);
  if (match) {
    return toNumber(match[1]);
  }
  const trailingMatch = str.match(/(\d+)$/);
  if (trailingMatch) {
    return toNumber(trailingMatch[1]);
  }
  return toNumber(str);
}

function formatBookingReference(bookingId, year = null) {
  const y = year || new Date().getFullYear();
  return `A6-${y}-${bookingId}`;
}

function findBookingById(bookingId) {
  const parsedId = parseBookingId(bookingId);
  if (parsedId && pageState.bookingIndex.has(parsedId)) {
    return pageState.bookingIndex.get(parsedId);
  }
  const clean = String(bookingId || "").trim().toLowerCase();
  for (const [, booking] of pageState.bookingIndex) {
    const ref = String(booking.booking_reference || `a6-2026-${getBookingId(booking)}`).toLowerCase();
    if (ref === clean) {
      return booking;
    }
  }
  return null;
}

function getBookingId(booking) {
  return parseBookingId(booking?.booking_id || booking?.id);
}

function isCancelled(booking) {
  return (
    String(booking.status || "").toLowerCase() === "cancelled" ||
    Boolean(booking.cancelled_at || booking.canceled_by)
  );
}

function isReturnedBooking(booking) {
  return (
    String(booking.status || "").toLowerCase() === "returned" ||
    Boolean(booking.return_verified)
  );
}

function isAwaitingPayment(booking) {
  return !isCancelled(booking) && !booking.paid;
}

function isActiveBooking(booking) {
  const end = parseDate(booking.end_date);
  return !isCancelled(booking) && !isReturnedBooking(booking) && Boolean(end && end >= startOfToday());
}

function canCancelBooking(booking) {
  const end = parseDate(booking.end_date);
  return !isCancelled(booking) && !isReturnedBooking(booking) && Boolean(end && end >= startOfToday());
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

// ---------------------------------------------------------------------------
// Event binding — connects all voice + wizard custom events
// ---------------------------------------------------------------------------

function bindVoiceAssistantEvents() {
  if (voiceAssistantEventsBound) {
    return;
  }

  document.addEventListener("voiceAiAssistRequest", handleVoiceAiAssistRequest);
  document.addEventListener("voiceAiIntent",        handleVoiceAiIntent);
  document.addEventListener("voiceCommand",         handleVoiceCommand);
  document.addEventListener("voiceWizardStep",      handleVoiceWizardStep);
  document.addEventListener("voiceWizardReset",     handleVoiceWizardReset);
  voiceAssistantEventsBound = true;
}

// ---------------------------------------------------------------------------
// handleVoiceCommand — routes confirm_booking, cancel, and wizard steps
// ---------------------------------------------------------------------------

function handleVoiceCommand(event) {
  const { commandType } = event.detail || {};

  if (commandType === "cancel") {
    clearVoiceCarHighlights();
    _hideWizardPanel();
    return;
  }

  if (commandType !== "confirm_booking") {
    return;
  }

  if (getPageName() !== "book") {
    return;
  }

  // Prefer the wizard's targeted car form
  const wizardCarId = window.voiceWizard?.carId;
  let readyForm = null;

  if (wizardCarId) {
    const wizardForm = dom.carGrid?.querySelector(`[data-car-form="${Number(wizardCarId)}"]`);
    if (wizardForm) {
      const s = wizardForm.querySelector("[data-start-date]");
      const e = wizardForm.querySelector("[data-end-date]");
      if (s?.value && e?.value) readyForm = wizardForm;
    }
  }

  // Fallback: first form with both dates filled
  if (!readyForm) {
    const forms = Array.from(dom.carGrid?.querySelectorAll("[data-car-form]") || []);
    readyForm = forms.find((form) => {
      const s = form.querySelector("[data-start-date]");
      const e = form.querySelector("[data-end-date]");
      return s?.value && e?.value;
    });
  }

  if (readyForm) {
    const plan     = window.voiceWizard?.paymentPlan || "reserve";
    const submitter = readyForm.querySelector(
      plan === "full" ? '[data-payment-plan="full"]' : '[data-payment-plan="reserve"]'
    );
    readyForm.requestSubmit(submitter || undefined);
  } else {
    showToast("Please fill the dates on a car before confirming.", "warning");
    speakAndPrompt("Please choose a car and fill the dates first.", null);
  }
}

// ---------------------------------------------------------------------------
// handleVoiceWizardStep — update UI when wizard advances to a new step
// ---------------------------------------------------------------------------

function handleVoiceWizardStep(event) {
  const { step, wizard } = event.detail || {};
  if (!step) return;

  _showWizardPanelStep(step, wizard);

  // Highlight car when we move past car selection
  if (step === "start_date" && wizard?.carId) {
    highlightVoiceTargetedCar(wizard.carId);
  }

  // Fill dates into the form as the wizard advances
  if (["end_date", "payment", "confirm"].includes(step) && wizard?.carId) {
    const form = dom.carGrid?.querySelector(`[data-car-form="${Number(wizard.carId)}"]`);
    if (form) {
      const startInput = form.querySelector("[data-start-date]");
      const endInput   = form.querySelector("[data-end-date]");
      if (startInput && wizard.startDate && !startInput.value) {
        startInput.value = wizard.startDate;
        syncBookingFormDates(form, { changedField: "start", notify: false });
      }
      if (endInput && wizard.endDate && !endInput.value) {
        endInput.value = wizard.endDate;
        syncBookingFormDates(form, { changedField: "end", notify: false });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// handleVoiceWizardReset — clear all highlights and hide the step panel
// ---------------------------------------------------------------------------

function handleVoiceWizardReset() {
  clearVoiceCarHighlights();
  _hideWizardPanel();
}

// ---------------------------------------------------------------------------
// Car highlight system
// ---------------------------------------------------------------------------

function highlightVoiceTargetedCar(carId) {
  clearVoiceCarHighlights();
  const card = dom.carGrid
    ?.querySelector(`[data-car-form="${Number(carId)}"]`)
    ?.closest(".vehicle-card");
  if (card) {
    card.classList.add("voice-targeted");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function clearVoiceCarHighlights() {
  document.querySelectorAll(".voice-targeted").forEach((el) =>
    el.classList.remove("voice-targeted")
  );
}

// ---------------------------------------------------------------------------
// Wizard panel helpers
// ---------------------------------------------------------------------------

function _showWizardPanelStep(step, wizard) {
  const promptEl = document.getElementById("voice-wizard-step-prompt");
  if (!promptEl) return;

  const assistant = window.voiceAssistant;
  const lang      = assistant?.language || "en-IN";
  let text        = assistant?._prompt(step, lang) || "";

  // Enrich confirm step with full summary
  if (step === "confirm" && wizard) {
    const days    = wizard.days || 0;
    const cost    = wizard.totalCost;
    const costStr = cost ? `\u20B9${Number(cost).toLocaleString("en-IN")}` : "";
    const parts   = [
      wizard.carLabel,
      wizard.startDate && wizard.endDate ? `${wizard.startDate} \u2192 ${wizard.endDate}` : "",
      days ? `${days} day${days !== 1 ? "s" : ""}` : "",
      costStr ? `Pay ${costStr}` : "",
    ].filter(Boolean);
    if (parts.length) text = `\uD83D\uDCCB ${parts.join(" \u00B7 ")}. ${text}`;
  }

  // Enrich start_date step with car name
  if (step === "start_date" && wizard?.carLabel) {
    const prefixes = {
      "en-IN": `Car: ${wizard.carLabel}. `,
      "hi-IN": `\u0917\u093E\u0921\u093C\u0940: ${wizard.carLabel}. `,
      "ta-IN": `\u0B95\u0BBE\u0BB0\u0BCD: ${wizard.carLabel}. `,
      "te-IN": `\u0C15\u0C3E\u0C30\u0C41: ${wizard.carLabel}. `,
      "kn-IN": `\u0C95\u0CBE\u0CB0\u0CCD: ${wizard.carLabel}. `,
    };
    text = (prefixes[lang] || prefixes["en-IN"]) + text;
  }

  promptEl.textContent = text;
  promptEl.classList.remove("hidden");
}

function _hideWizardPanel() {
  const promptEl  = document.getElementById("voice-wizard-step-prompt");
  const trackerEl = document.getElementById("voice-step-tracker");
  if (promptEl)  { promptEl.textContent = ""; promptEl.classList.add("hidden"); }
  if (trackerEl) trackerEl.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// handleVoiceAiAssistRequest — calls backend AI intent endpoint
// ---------------------------------------------------------------------------

async function handleVoiceAiAssistRequest(event) {
  event.preventDefault();

  const transcript = String(event.detail?.transcript || "").trim();
  if (!transcript) {
    return;
  }

  if (typeof window.handleVoiceIntent !== "function") {
    showToast("AI assist is not available in this build.", "warning");
    speakAndPrompt("AI assist is not available right now.", null);
    return;
  }

  try {
    await window.handleVoiceIntent(transcript);
  } catch (error) {
    const message = error?.message || "AI assist is unavailable right now.";
    console.warn("AI assist request failed:", error);

    if (/not configured/i.test(message)) {
      showToast(
        "AI assist is not configured. Add OPENAI_API_KEY and restart the backend.",
        "warning"
      );
      speakAndPrompt("AI assist is not configured on the backend yet.", null);
      return;
    }

    showToast(message, "warning");
    speakAndPrompt("I could not process that request. Please try again.", null);
  }
}

// ---------------------------------------------------------------------------
// handleVoiceAiIntent — processes structured AI intent
// ---------------------------------------------------------------------------

function handleVoiceAiIntent(event) {
  const intent = event.detail?.intent;
  if (!intent || typeof intent !== "object") {
    return;
  }
  applyVoiceIntent(intent);
}

// ---------------------------------------------------------------------------
// applyVoiceIntent — top-level intent dispatcher
// ---------------------------------------------------------------------------

function applyVoiceIntent(intent) {
  const type = String(intent.intent || "").trim().toLowerCase();

  if (type === "book") {
    // Redirect from home / history → book page
    if (getPageName() !== "book") {
      sessionStorage.setItem("voiceBooking", JSON.stringify(intent));
      window.location.href = "/book.html";
      return;
    }
    applyVoiceBookingIntent(intent);
    return;
  }

  if (type === "history") {
    if (getPageName() === "history") {
      showToast("Your booking center is already open.", "success");
      speakAndPrompt("Your booking center is already open.", null);
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
    showToast(
      "Open the booking card you want and use the Cancel booking button there.",
      "warning"
    );
    speakAndPrompt(
      "Open the booking card you want and use the cancel booking button.",
      null
    );
    return;
  }

  if (type === "help") {
    const helpMessage =
      getPageName() === "book"
        ? "You can say: book a car, start date, end date, reserve, full payment, or confirm."
        : "You can say: book a car, open my bookings, or ask for help anytime.";
    showToast(helpMessage, "success");
    speakAndPrompt(helpMessage, null);
  }
}

// ---------------------------------------------------------------------------
// restoreStoredVoiceBookingIntent
// ---------------------------------------------------------------------------

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
    sessionStorage.removeItem("voiceBooking");
    return;
  }

  if (intent) {
    sessionStorage.removeItem("voiceBooking");
    applyVoiceBookingIntent(intent);
  } else {
    sessionStorage.removeItem("voiceBooking");
  }
}

// ---------------------------------------------------------------------------
// applyVoiceBookingIntent — fills the car grid + dates + syncs wizard state
// ---------------------------------------------------------------------------

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

  const requestedCar      = String(intent.car      || "").trim();
  const requestedLocation = String(intent.location  || "").trim();

  if (dom.carSearchInput && requestedCar) {
    dom.carSearchInput.value    = requestedCar;
    pageState.filters.carSearch = requestedCar.toLowerCase();
  }

  if (dom.carLocationSelect && requestedLocation) {
    const locationOption = Array.from(dom.carLocationSelect.options || []).find(
      (option) =>
        option.value !== "all" &&
        option.value.trim().toLowerCase() === requestedLocation.toLowerCase()
    );
    if (locationOption) {
      dom.carLocationSelect.value   = locationOption.value;
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
    speakAndPrompt(noMatchMessage, null);
    return;
  }

  const form = dom.carGrid.querySelector(`[data-car-form="${Number(targetCar.id)}"]`);
  if (!form) return;

  const appliedDates = applyVoiceDatesToBookingForm(form, intent);

  // Highlight the matched car and scroll to it
  highlightVoiceTargetedCar(targetCar.id);

  // Sync wizard state
  const wizard = window.voiceWizard;
  if (wizard) {
    wizard.setCarInfo({
      carId:    targetCar.id,
      carLabel: `${targetCar.brand || "A6"} ${targetCar.model || "Vehicle"}`.trim(),
      dailyRate: targetCar.daily_rate || 0,
    });
    if (appliedDates.start) wizard.setStartDate(appliedDates.start);
    if (appliedDates.end)   wizard.setEndDate(appliedDates.end);

    if (appliedDates.applied) {
      wizard.advance("payment");
    } else if (appliedDates.start) {
      wizard.advance("end_date");
    } else {
      wizard.advance("start_date");
    }
  }

  const carName = `${targetCar.brand || "A6"} ${targetCar.model || "Vehicle"}`.trim();
  const confirmationMessage = appliedDates.applied
    ? `Found ${carName} and filled the dates. Now choose your payment plan.`
    : `Found ${carName}. Tell me your start date.`;

  showToast(confirmationMessage, "success");
  speakAndPrompt(confirmationMessage, null);
}

// ---------------------------------------------------------------------------
// findVoiceBookingCar — match intent to a car in the fleet
// ---------------------------------------------------------------------------

function findVoiceBookingCar(intent) {
  const requestedCar      = String(intent.car      || "").trim().toLowerCase();
  const requestedLocation = String(intent.location  || "").trim().toLowerCase();

  const candidates = pageState.cars.filter((car) => {
    const searchable = `${car.brand || ""} ${car.model || ""}`.trim().toLowerCase();
    const location   = String(car.location || "").trim().toLowerCase();
    const matchesCurrentSearch =
      !pageState.filters.carSearch ||
      `${searchable} ${location}`.includes(pageState.filters.carSearch);
    const matchesCurrentLocation =
      pageState.filters.carLocation === "all" ||
      String(car.location || "").trim() === pageState.filters.carLocation;
    const matchesRequestedCar      = !requestedCar      || searchable.includes(requestedCar);
    const matchesRequestedLocation = !requestedLocation || location.includes(requestedLocation);

    return (
      matchesCurrentSearch &&
      matchesCurrentLocation &&
      matchesRequestedCar &&
      matchesRequestedLocation
    );
  });

  return candidates.length ? candidates[0] : null;
}

// ---------------------------------------------------------------------------
// applyVoiceDatesToBookingForm — fill hidden date inputs from intent
// ---------------------------------------------------------------------------

function applyVoiceDatesToBookingForm(form, intent) {
  const startInput = form.querySelector("[data-start-date]");
  const endInput   = form.querySelector("[data-end-date]");
  if (!startInput || !endInput) {
    return { applied: false };
  }

  const startDate = normalizeVoiceDateInput(intent.start_date);
  const endDate   =
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
    start:   startInput.value || "",
    end:     endInput.value   || "",
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function normalizeVoiceDateInput(value) {
  if (!value) return "";
  const date = parseDate(value);
  return date ? formatDateInput(date) : "";
}

function deriveVoiceEndDate(startDate, days) {
  const tripDays = Number(days);
  if (!startDate || !Number.isFinite(tripDays) || tripDays < 1) return "";
  const date = parseDate(startDate);
  if (!date) return "";
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + Math.max(0, tripDays - 1));
  return formatDateInput(endDate);
}

// ---------------------------------------------------------------------------
// speakAndPrompt — speak a message AND update the wizard prompt card
// ---------------------------------------------------------------------------

function speakAndPrompt(message, promptOverride) {
  if (!message) return;

  if (window.voiceAssistant && typeof window.voiceAssistant.speak === "function") {
    window.voiceAssistant.speak(message);
  } else if (typeof window.speak === "function") {
    window.speak(message, "en");
  }

  const promptEl = document.getElementById("voice-wizard-step-prompt");
  if (promptEl && promptOverride !== null) {
    const text = promptOverride ?? message;
    promptEl.textContent = text;
    promptEl.classList.toggle("hidden", !text);
  }
}

/** @deprecated — use speakAndPrompt instead */
function speakVoiceAssistantMessage(message) {
  speakAndPrompt(message, null);
}


function handleVoiceCommand(event) {
  const { commandType } = event.detail || {};

  if (commandType !== "confirm_booking") {
    return;
  }

  if (getPageName() !== "book") {
    return;
  }

  // Find the first booking form in the car grid that has both dates filled
  const forms = Array.from(dom.carGrid?.querySelectorAll("[data-car-form]") || []);
  const readyForm = forms.find((form) => {
    const startInput = form.querySelector("[data-start-date]");
    const endInput = form.querySelector("[data-end-date]");
    return startInput?.value && endInput?.value;
  });

  if (readyForm) {
    readyForm.requestSubmit();
  } else {
    showToast("Please fill the dates on a car before confirming.", "warning");
    speakVoiceAssistantMessage("Please choose a car and fill the dates first.");
  }
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
    sessionStorage.removeItem("voiceBooking");
    return;
  }

  if (intent) {
    // Remove before applying — applyVoiceBookingIntent may re-save it
    // if it needs to redirect to /book.html first, and that is intentional.
    sessionStorage.removeItem("voiceBooking");
    applyVoiceBookingIntent(intent);
  } else {
    sessionStorage.removeItem("voiceBooking");
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

// ============================================================================
// CARPOOL SYSTEM MODULE (STANDALONE FLEET & USER CARPOOLING)
// ============================================================================

async function initCarpoolPage() {
  cacheCarpoolDom();
  bindCarpoolEvents();
  initCarpoolTabBar();
  initAddVehicleForm();

  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get("tab") || "find";
  const action = urlParams.get("action");
  const bookingId = urlParams.get("booking_id");

  await Promise.all([
    loadCarpoolTrips(),
    hasUserSession() ? loadCarpoolVehicles() : Promise.resolve(),
    hasUserSession() ? loadCarpoolDashboard() : Promise.resolve(),
  ]);

  if (action === "offer-rental" && bookingId) {
    switchCarpoolTab("create", { preselectVehicleId: `rental_${bookingId}` });
  } else {
    switchCarpoolTab(targetTab);
  }
}

function cacheCarpoolDom() {
  [
    "carpoolTabBar",
    "carpoolSpotlight",
    "findSection",
    "createSection",
    "vehiclesSection",
    "addVehicleSection",
    "dashboardSection",
    "carpoolSearchForm",
    "searchFrom",
    "searchTo",
    "searchDate",
    "searchTime",
    "searchPassengers",
    "searchMaxPrice",
    "searchVehicleType",
    "resetSearchBtn",
    "carpoolResultsContainer",
    "carpoolTripGrid",
    "offerRideForm",
    "rentedCarNoticeBanner",
    "rentedCarNoticeText",
    "offerVehicleSelect",
    "offerSource",
    "offerDestination",
    "offerStops",
    "offerDate",
    "offerTime",
    "offerSeats",
    "offerPrice",
    "offerContactPref",
    "offerVehicleTypeDisplay",
    "offerDescription",
    "offerRoutePreviewCard",
    "routePreviewDistance",
    "routePreviewDuration",
    "publishTripBtn",
    "personalVehiclesCount",
    "rentedVehiclesCount",
    "personalVehiclesGrid",
    "rentedVehiclesGrid",
    "registerVehicleForm",
    "vehRegNumber",
    "vehYear",
    "vehBrand",
    "vehModel",
    "vehType",
    "vehFuelType",
    "vehMileage",
    "vehCapacity",
    "vehFileDropArea",
    "vehImageFile",
    "vehImageUrl",
    "vehImagePreviewBox",
    "vehPreviewImg",
    "removeVehImageBtn",
    "vehLocation",
    "vehOfferNowCheckbox",
    "saveVehicleBtn",
    "dashboardMetrics",
    "dashActiveRentalsCount",
    "dashMyVehiclesCount",
    "dashCreatedCount",
    "dashJoinedCount",
    "dashPendingRequestsCount",
    "dashUpcomingCount",
    "dashCompletedCount",
    "dashboardSubtabs",
    "dashSubtabCreatedBadge",
    "dashSubtabJoinedBadge",
    "dashSubtabRequestsBadge",
    "dashSubtabUpcomingBadge",
    "dashSubtabCompletedBadge",
    "dashCreatedContent",
    "dashJoinedContent",
    "dashRequestsContent",
    "dashUpcomingContent",
    "dashCompletedContent",
    "dashCreatedList",
    "dashJoinedList",
    "dashIncomingRequestsList",
    "dashSentRequestsList",
    "dashUpcomingList",
    "dashCompletedList",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

function bindCarpoolEvents() {
  dom.carpoolSearchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    loadCarpoolTrips();
  });

  dom.resetSearchBtn?.addEventListener("click", () => {
    dom.carpoolSearchForm?.reset();
    loadCarpoolTrips();
  });

  dom.offerVehicleSelect?.addEventListener("change", handleOfferVehicleChange);

  let routeDebounceTimer = null;
  const triggerRoutePreview = () => {
    clearTimeout(routeDebounceTimer);
    routeDebounceTimer = setTimeout(checkOfferRoutePreview, 400);
  };
  dom.offerSource?.addEventListener("input", triggerRoutePreview);
  dom.offerDestination?.addEventListener("input", triggerRoutePreview);
  dom.offerStops?.addEventListener("input", triggerRoutePreview);

  dom.offerRideForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitOfferTrip(dom.offerRideForm);
  });

  dom.dashboardSubtabs?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dash-subtab]");
    if (btn) {
      switchDashboardSubtab(btn.dataset.dashSubtab);
    }
  });
}

function initCarpoolTabBar() {
  document.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-action='switch-carpool-tab'], .carpool-tab-btn");
    if (tabBtn && tabBtn.dataset.tab) {
      switchCarpoolTab(tabBtn.dataset.tab);
    }
  });
}

function switchCarpoolTab(tabName, options = {}) {
  const validTabs = ["find", "create", "vehicles", "add-vehicle", "dashboard"];
  const target = validTabs.includes(tabName) ? tabName : "find";

  if (target !== "find" && !hasUserSession()) {
    showToast("Please sign in or create an account to access this carpooling feature.", "warning");
    sessionStorage.setItem("postLoginRedirect", `/carpool.html?tab=${target}`);
    window.location.href = "/login.html";
    return;
  }

  pageState.carpool.activeTab = target;

  document.querySelectorAll(".carpool-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === target);
  });

  const sectionMap = {
    find: dom.findSection,
    create: dom.createSection,
    vehicles: dom.vehiclesSection,
    "add-vehicle": dom.addVehicleSection,
    dashboard: dom.dashboardSection,
  };

  Object.entries(sectionMap).forEach(([key, sectionEl]) => {
    if (sectionEl) {
      sectionEl.classList.toggle("hidden", key !== target);
    }
  });

  if (target === "create" && options.preselectVehicleId && dom.offerVehicleSelect) {
    dom.offerVehicleSelect.value = options.preselectVehicleId;
    handleOfferVehicleChange();
  }

  if (target === "dashboard") {
    loadCarpoolDashboard();
  } else if (target === "vehicles") {
    loadCarpoolVehicles();
  }

  const url = new URL(window.location);
  url.searchParams.set("tab", target);
  window.history.replaceState({}, "", url);
  renderNavigation();
}

async function loadCarpoolTrips(customQuery = null) {
  if (!dom.carpoolTripGrid) return;
  dom.carpoolTripGrid.innerHTML = `
    <div class="empty-state">
      <div class="skeleton-pulse" style="height: 180px; border-radius: 18px; margin-bottom: 12px; background: rgba(15,23,42,0.06);"></div>
      <p style="color: #64748b;">Finding open carpools...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (customQuery) {
      Object.entries(customQuery).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    } else {
      if (dom.searchFrom?.value.trim()) params.set("from", dom.searchFrom.value.trim());
      if (dom.searchTo?.value.trim()) params.set("to", dom.searchTo.value.trim());
      if (dom.searchDate?.value) params.set("date", dom.searchDate.value);
      if (dom.searchTime?.value) params.set("time", dom.searchTime.value);
      if (dom.searchPassengers?.value) params.set("passengers", dom.searchPassengers.value);
      if (dom.searchMaxPrice?.value) params.set("maxPrice", dom.searchMaxPrice.value);
      if (dom.searchVehicleType?.value && dom.searchVehicleType.value !== "all") {
        params.set("vehicleType", dom.searchVehicleType.value);
      }
    }

    const data = await fetchJson(`/api/carpool/trips?${params.toString()}`);
    pageState.carpool.trips = Array.isArray(data.trips) ? data.trips : [];
    renderCarpoolCards(pageState.carpool.trips);
  } catch (error) {
    dom.carpoolTripGrid.innerHTML = emptyStateMarkup(
      "Could not load rides",
      error.message || "Failed to search carpools. Please try again."
    );
  }
}

function renderCarpoolCards(trips) {
  if (!dom.carpoolTripGrid) return;

  if (!trips.length) {
    dom.carpoolTripGrid.innerHTML = `
      <div class="empty-state carpool-empty-state">
        <div class="empty-icon">🚗</div>
        <h3>No matching carpool rides found</h3>
        <p>No open rides currently match your selected filters. Try widening your date or search parameters, or offer a ride yourself!</p>
        <button class="button button-primary" type="button" data-action="switch-carpool-tab" data-tab="create">+ Offer a Ride Now</button>
      </div>
    `;
    return;
  }

  dom.carpoolTripGrid.innerHTML = trips.map(buildCarpoolCardMarkup).join("");
  init3DTiltEngine();
}

function buildCarpoolCardMarkup(trip) {
  const currentUserId = Number(readUserSession().customerId || 0);
  const isDriver = currentUserId && trip.driver_id === currentUserId;
  const isFull = trip.available_seats <= 0 || trip.status === "FULL";
  const isStarted = trip.status === "STARTED";
  const isCompleted = trip.status === "COMPLETED";
  const isCancelled = trip.status === "CANCELLED";

  let statusBadgeMarkup = "";
  if (isCancelled) {
    statusBadgeMarkup = '<span class="status-badge badge-danger">Cancelled</span>';
  } else if (isCompleted) {
    statusBadgeMarkup = '<span class="status-badge badge-neutral">Completed</span>';
  } else if (isStarted) {
    statusBadgeMarkup = '<span class="status-badge badge-sky">On Trip</span>';
  } else if (isFull) {
    statusBadgeMarkup = '<span class="status-badge badge-warning">Full</span>';
  } else if (trip.available_seats === 1) {
    statusBadgeMarkup = '<span class="status-badge badge-warning">Almost Full (1 Left)</span>';
  } else {
    statusBadgeMarkup = '<span class="status-badge badge-success">Available</span>';
  }

  const defaultCarImg = "/assets/a6cars-logo.png";
  const vehicleImg = trip.vehicle_image ? getAssetUrl(trip.vehicle_image) : defaultCarImg;
  const driverRating = Number(trip.driver_rating || 5.0).toFixed(1);
  const driverReviews = trip.driver_reviews_count || 0;
  const stopsText = Array.isArray(trip.stops) && trip.stops.length ? trip.stops.join(" &bull; ") : "";
  const totalSeats = trip.total_seats || trip.available_seats || 4;

  let actionButton = "";
  if (isDriver) {
    actionButton = `<button class="button button-ghost" type="button" data-action="switch-carpool-tab" data-tab="dashboard">Your Offered Trip</button>`;
  } else if (isCancelled) {
    actionButton = `<button class="button button-ghost" disabled>Trip Cancelled</button>`;
  } else if (isCompleted) {
    actionButton = `<button class="button button-ghost" disabled>Trip Completed</button>`;
  } else if (isFull) {
    actionButton = `<button class="button button-ghost" disabled>Fully Booked</button>`;
  } else {
    actionButton = `<button class="button button-primary" type="button" data-action="join-carpool" data-trip-id="${trip.id}">Join Carpool</button>`;
  }

  return `
    <article class="carpool-card">
      <div class="carpool-card-head">
        <div class="route-header-main">
          <span class="route-cities-title">${escapeHtml(trip.source)} &rarr; ${escapeHtml(trip.destination)}</span>
          <div class="route-indicator-orange">
            <span class="route-dot-orange">●</span>
            <span class="route-line-orange">─────────</span>
            <span class="route-dot-orange">●</span>
            ${trip.estimated_distance_km ? `<span class="route-dist">${trip.estimated_distance_km} km</span>` : ""}
          </div>
        </div>
        <div class="carpool-card-status">
          ${statusBadgeMarkup}
        </div>
      </div>

      ${stopsText ? `<div class="route-stops-tag"><span>Via:</span> ${escapeHtml(stopsText)}</div>` : ""}

      <div class="carpool-card-body">
        <div class="carpool-vehicle-thumb">
          <img src="${vehicleImg}" alt="${escapeHtml(trip.vehicle_name || 'Vehicle')}" loading="lazy" onerror="this.onerror=null;this.src='/assets/hero-car.jpg';" />
          ${trip.is_rental ? '<span class="rental-badge-chip">A6 Rented Car</span>' : ''}
        </div>

        <div class="carpool-driver-info">
          <div class="driver-avatar-circle">${escapeHtml((trip.driver_name || "D").slice(0, 1).toUpperCase())}</div>
          <div>
            <strong class="driver-name">${escapeHtml(trip.driver_name || "Verified Driver")}</strong>
            <div class="driver-meta">
              <span class="star-rating">★ ${driverRating}</span>
              <span class="reviews-count">(${driverReviews} rides)</span>
            </div>
            <p class="vehicle-model-line">${escapeHtml(trip.vehicle_name || trip.vehicle_model || 'Sedan')} &bull; <span class="masked-reg">${escapeHtml(trip.vehicle_reg_number_masked || 'Private')}</span></p>
          </div>
        </div>

        <div class="carpool-trip-schedule">
          <div class="schedule-item">
            <span class="meta-label">Travel Date & Time</span>
            <strong class="schedule-time">📅 ${formatDate(trip.travel_date)} &bull; ⏰ ${escapeHtml(trip.departure_time)}</strong>
          </div>
          <div class="schedule-item">
            <span class="meta-label">Seats Available</span>
            <div class="seat-availability-indicator">
              <span class="seat-fraction">${trip.available_seats} / ${totalSeats} Seats Available</span>
              <div class="seat-dots">
                ${Array.from({ length: totalSeats }).map((_, i) => `<span class="seat-dot ${i < trip.available_seats ? 'open' : 'filled'}"></span>`).join("")}
              </div>
            </div>
          </div>
        </div>

        ${trip.pickup_points ? `
          <div class="pickup-point-row">
            <span style="color: var(--accent); font-weight: 700;">📍 Pickup:</span>
            <span>${escapeHtml(trip.pickup_points)}</span>
          </div>
        ` : ""}

        <div class="carpool-card-footer">
          <div class="price-block">
            <span class="price-val">${formatCurrency(trip.price_per_seat)}</span>
            <small class="price-per">/ seat cost share</small>
          </div>
          <div class="card-action-box">
            ${actionButton}
          </div>
        </div>
      </div>
    </article>
  `;
}

function openJoinCarpoolModal(trip) {
  if (!ensureUserSession()) return;

  const currentUserId = Number(readUserSession().customerId || 0);
  if (trip.driver_id === currentUserId) {
    showToast("You are the driver of this trip.", "warning");
    return;
  }

  if (trip.available_seats <= 0 || trip.status === "FULL") {
    showToast("This trip is fully booked.", "warning");
    return;
  }

  const content = document.createElement("div");
  content.className = "join-carpool-modal-layout";
  content.innerHTML = `
    <div class="modal-trip-summary-box">
      <div class="summary-route">
        <strong>${escapeHtml(trip.source)} ➔ ${escapeHtml(trip.destination)}</strong>
        <p>📅 ${formatDate(trip.travel_date)} at ${escapeHtml(trip.departure_time)}</p>
      </div>
      <div class="summary-driver">
        <span>Driver: <strong>${escapeHtml(trip.driver_name)}</strong></span>
        <span>Vehicle: <strong>${escapeHtml(trip.vehicle_name || trip.vehicle_model)}</strong> (${escapeHtml(trip.vehicle_type)})</span>
        <span>Available: <strong>${trip.available_seats} seat(s)</strong></span>
        <span>Cost per seat: <strong class="accent-cost">${formatCurrency(trip.price_per_seat)}</strong></span>
      </div>
    </div>

    <form id="joinTripForm" class="stack-list" style="margin-top: 14px;">
      <div class="field-grid">
        <div class="field-block">
          <label for="joinSeatsInput">Seats to Book *</label>
          <input class="input" id="joinSeatsInput" type="number" min="1" max="${trip.available_seats}" value="1" required />
          <small class="field-note">Maximum ${trip.available_seats} seat(s) open.</small>
        </div>
        <div class="field-block">
          <label>Estimated Total Share</label>
          <div class="computed-price-box" id="joinTotalDisplay">${formatCurrency(trip.price_per_seat)}</div>
        </div>
      </div>

      <div class="field-block">
        <label for="joinPickupPoint">Pickup Location *</label>
        <input class="input" id="joinPickupPoint" type="text" value="${escapeHtml(trip.source)}" placeholder="Specify exact pickup landmark" required />
      </div>

      <div class="field-block">
        <label for="joinDropoffPoint">Drop-off Location *</label>
        <input class="input" id="joinDropoffPoint" type="text" value="${escapeHtml(trip.destination)}" placeholder="Specify exact drop-off landmark" required />
      </div>

      <div class="field-block">
        <label for="joinMessage">Message for Driver (Optional)</label>
        <textarea class="input input-textarea" id="joinMessage" rows="2" placeholder="e.g. Traveling with a backpack, will wait near the metro station entrance."></textarea>
      </div>

      <div class="modal-actions" style="margin-top: 16px;">
        <button class="button button-primary" type="submit" id="submitJoinRequestBtn">
          <span>📩</span> Send Join Request
        </button>
        <button class="button button-secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </form>
  `;

  const seatsInput = content.querySelector("#joinSeatsInput");
  const totalDisplay = content.querySelector("#joinTotalDisplay");
  seatsInput?.addEventListener("input", () => {
    const s = Math.max(1, Math.min(trip.available_seats, Number(seatsInput.value) || 1));
    totalDisplay.textContent = formatCurrency(trip.price_per_seat * s);
  });

  const form = content.querySelector("#joinTripForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("#submitJoinRequestBtn");
    setButtonBusy(btn, true, "Submitting...");

    try {
      const seats = Number(seatsInput.value) || 1;
      const pickup = content.querySelector("#joinPickupPoint").value.trim();
      const dropoff = content.querySelector("#joinDropoffPoint").value.trim();
      const message = content.querySelector("#joinMessage").value.trim();

      const result = await fetchJson(`/api/carpool/trips/${trip.id}/request`, {
        method: "POST",
        body: JSON.stringify({
          seats_requested: seats,
          pickup_point: pickup,
          dropoff_point: dropoff,
          message,
        }),
      });

      closeModal();
      showToast(result.message || "Join request sent! The driver has been notified.", "success");
      await loadCarpoolTrips();
      switchCarpoolTab("dashboard");
      switchDashboardSubtab("requests");
    } catch (err) {
      showToast(err.message || "Failed to submit join request.", "error");
    } finally {
      setButtonBusy(btn, false);
    }
  });

  openModal({
    title: "Join Carpool Ride",
    subtitle: `Request to join ${trip.driver_name}'s carpool journey.`,
    size: "wide",
    content,
  });
}

async function loadCarpoolVehicles() {
  if (!hasUserSession()) return;
  try {
    const data = await fetchJson("/api/carpool/vehicles");
    pageState.carpool.vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    pageState.carpool.rentalVehicles = Array.isArray(data.rental_vehicles) ? data.rental_vehicles : [];

    if (dom.personalVehiclesCount) dom.personalVehiclesCount.textContent = String(pageState.carpool.vehicles.length);
    if (dom.rentedVehiclesCount) dom.rentedVehiclesCount.textContent = String(pageState.carpool.rentalVehicles.length);
    if (dom.dashActiveRentalsCount) dom.dashActiveRentalsCount.textContent = formatMetricNumber(pageState.carpool.rentalVehicles.length);
    if (dom.dashMyVehiclesCount) dom.dashMyVehiclesCount.textContent = formatMetricNumber(pageState.carpool.vehicles.length);

    populateOfferVehicleSelect();
    renderVehiclesHub();
  } catch (error) {
    console.error("Failed to load user vehicles:", error);
  }
}

function populateOfferVehicleSelect() {
  if (!dom.offerVehicleSelect) return;
  const userVehicles = pageState.carpool.vehicles || [];
  const rentalVehicles = pageState.carpool.rentalVehicles || [];

  if (!userVehicles.length && !rentalVehicles.length) {
    dom.offerVehicleSelect.innerHTML = `
      <option value="">No registered or rented vehicles found</option>
    `;
    return;
  }

  const options = ['<option value="">-- Choose vehicle for trip --</option>'];

  if (userVehicles.length) {
    options.push('<optgroup label="🚗 User\'s Own Vehicles">');
    userVehicles.forEach((v) => {
      options.push(
        `<option value="${v.id}" data-type="${escapeHtml(v.vehicle_type || 'Sedan')}" data-seats="${v.seating_capacity || 4}">
          ${escapeHtml(v.brand)} ${escapeHtml(v.model)} (${escapeHtml(v.reg_number)})
        </option>`
      );
    });
    options.push('</optgroup>');
  }

  if (rentalVehicles.length) {
    options.push('<optgroup label="🚙 Active Rented Fleet Cars">');
    rentalVehicles.forEach((r) => {
      options.push(
        `<option value="rental_${r.booking_id}" data-type="${escapeHtml(r.vehicle_type || 'Sedan')}" data-seats="${r.seating_capacity || 5}" data-start="${r.start_date}" data-end="${r.end_date}" data-ref="${r.booking_reference}">
          [Rented] ${escapeHtml(r.brand)} ${escapeHtml(r.model)} (Valid: ${r.start_date} to ${r.end_date})
        </option>`
      );
    });
    options.push('</optgroup>');
  }

  dom.offerVehicleSelect.innerHTML = options.join("");
}

function handleOfferVehicleChange() {
  const select = dom.offerVehicleSelect;
  if (!select) return;

  const val = select.value;
  const opt = select.selectedOptions[0];
  const noticeBanner = dom.rentedCarNoticeBanner;
  const noticeText = dom.rentedCarNoticeText;
  const dateInput = dom.offerDate;
  const dateHelp = dom.offerDateHelp;
  const typeDisplay = dom.offerVehicleTypeDisplay;

  if (val.startsWith("rental_") && opt) {
    const start = opt.dataset.start;
    const end = opt.dataset.end;
    const ref = opt.dataset.ref || val.replace("rental_", "");

    if (noticeBanner) noticeBanner.classList.remove("hidden");
    if (noticeText) {
      noticeText.innerHTML = `
        <strong>Active Rental Carpool Window:</strong> This vehicle is valid for carpool trips strictly from <strong>${formatDate(start)}</strong> to <strong>${formatDate(end)}</strong> (Booking #${ref}).
      `;
    }
    if (dateInput) {
      dateInput.min = start;
      dateInput.max = end;
      if (!dateInput.value || dateInput.value < start || dateInput.value > end) {
        dateInput.value = start;
      }
    }
    if (dateHelp) {
      dateHelp.textContent = `Allowed trip dates: ${formatDate(start)} to ${formatDate(end)}`;
    }
    if (typeDisplay && opt.dataset.type) {
      typeDisplay.value = opt.dataset.type;
    }
  } else if (val && opt) {
    if (noticeBanner) noticeBanner.classList.add("hidden");
    if (dateInput) {
      dateInput.min = todayAsInput();
      dateInput.removeAttribute("max");
    }
    if (dateHelp) {
      dateHelp.textContent = "Must be today or a future date.";
    }
    if (typeDisplay && opt.dataset.type) {
      typeDisplay.value = opt.dataset.type;
    }
  } else {
    if (noticeBanner) noticeBanner.classList.add("hidden");
    if (dateInput) {
      dateInput.min = todayAsInput();
      dateInput.removeAttribute("max");
    }
    if (typeDisplay) typeDisplay.value = "";
  }
}

async function checkOfferRoutePreview() {
  const from = dom.offerSource?.value.trim();
  const to = dom.offerDestination?.value.trim();
  const stops = dom.offerStops?.value.trim() || "";

  if (!from || !to) {
    dom.offerRoutePreviewCard?.classList.add("hidden");
    return;
  }

  try {
    const res = await fetchJson(`/api/carpool/route-preview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&stops=${encodeURIComponent(stops)}`);
    if (res && res.distanceKm) {
      if (dom.routePreviewDistance) dom.routePreviewDistance.textContent = `${res.distanceKm} km`;
      if (dom.routePreviewDuration) dom.routePreviewDuration.textContent = res.formattedDuration || "—";
      dom.offerRoutePreviewCard?.classList.remove("hidden");
    }
  } catch (err) {
    dom.offerRoutePreviewCard?.classList.add("hidden");
  }
}

async function submitOfferTrip(form) {
  if (!ensureUserSession()) return;
  const submitBtn = dom.publishTripBtn;
  setButtonBusy(submitBtn, true, "Publishing Trip...");

  try {
    const vehicleVal = dom.offerVehicleSelect?.value;
    if (!vehicleVal) {
      throw new Error("Please select a vehicle for this carpool trip.");
    }

    const source = dom.offerSource?.value.trim();
    const destination = dom.offerDestination?.value.trim();
    const stopsStr = dom.offerStops?.value.trim() || "";
    const travelDate = dom.offerDate?.value;
    const departureTime = dom.offerTime?.value;
    const availableSeats = Number(dom.offerSeats?.value) || 1;
    const price = Number(dom.offerPrice?.value) || 0;
    const contactPref = dom.offerContactPref?.value || "phone";
    const description = dom.offerDescription?.value.trim() || "";

    const isRental = vehicleVal.startsWith("rental_");
    let bookingId = null;
    let vehicleId = null;

    if (isRental) {
      bookingId = Number(vehicleVal.replace("rental_", ""));
    } else {
      vehicleId = Number(vehicleVal);
    }

    const payload = {
      source,
      destination,
      stops: stopsStr.split(",").map((s) => s.trim()).filter(Boolean),
      travel_date: travelDate,
      departure_time: departureTime,
      available_seats: availableSeats,
      price_per_seat: price,
      contact_preference: contactPref,
      description,
      vehicle_id: vehicleVal,
      is_rental: isRental,
      booking_id: bookingId,
    };

    const res = await fetchJson("/api/carpool/trips", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(res.message || "Carpool trip created successfully!", "success");
    form.reset();
    dom.offerRoutePreviewCard?.classList.add("hidden");
    dom.rentedCarNoticeBanner?.classList.add("hidden");

    await Promise.all([loadCarpoolTrips(), loadCarpoolDashboard()]);
    switchCarpoolTab("dashboard");
    switchDashboardSubtab("created");
  } catch (error) {
    showToast(error.message || "Failed to publish trip.", "error");
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

function renderVehiclesHub() {
  const personal = pageState.carpool.vehicles || [];
  const rentals = pageState.carpool.rentalVehicles || [];

  if (dom.personalVehiclesGrid) {
    if (!personal.length) {
      dom.personalVehiclesGrid.innerHTML = `
        <div class="empty-state">
          <h4>No personal vehicles registered</h4>
          <p>Add your car to start offering rides and sharing commute costs.</p>
          <button class="button button-primary" type="button" data-action="switch-carpool-tab" data-tab="add-vehicle">+ Register Personal Car</button>
        </div>
      `;
    } else {
      dom.personalVehiclesGrid.innerHTML = personal
        .map((v) => {
          const img = v.image_url || v.images?.[0] ? getAssetUrl(v.image_url || v.images[0]) : "/assets/a6cars-logo.png";
          return `
            <article class="vehicle-hub-card">
              <div class="veh-card-img">
                <img src="${img}" alt="${escapeHtml(v.brand)} ${escapeHtml(v.model)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/hero-car.jpg';" />
              </div>
              <div class="veh-card-body">
                <span class="eyebrow">${escapeHtml(v.vehicle_type)} &bull; ${escapeHtml(String(v.year || 2022))}</span>
                <h3>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h3>
                <p class="reg-tag">🚗 ${escapeHtml(v.reg_number)}</p>
                <div class="veh-specs-row">
                  <span>⛽ ${escapeHtml(v.fuel_type)}</span>
                  <span>⚡ ${escapeHtml(v.mileage)}</span>
                  <span>👥 ${v.seating_capacity} Seats</span>
                  <span>📍 ${escapeHtml(v.location || 'Local')}</span>
                </div>
                <div class="veh-actions">
                  <button class="button button-primary" type="button" data-action="offer-car-carpool" data-vehicle-id="${v.id}">
                    🚗 Offer This Car for Carpooling
                  </button>
                  <button class="button button-ghost button-danger-text" type="button" data-action="delete-user-vehicle" data-vehicle-id="${v.id}">
                    Remove
                  </button>
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    }
  }

  if (dom.rentedVehiclesGrid) {
    if (!rentals.length) {
      dom.rentedVehiclesGrid.innerHTML = `
        <div class="empty-state">
          <h4>No active rented cars found</h4>
          <p>Book a fleet vehicle from A6 Cars to use it for both self-drive travel and carpooling.</p>
          <a class="button button-secondary" href="/book.html">Browse Fleet Cars</a>
        </div>
      `;
    } else {
      dom.rentedVehiclesGrid.innerHTML = rentals
        .map((r) => {
          const img = r.image_url || r.images?.[0] ? getAssetUrl(r.image_url || r.images[0]) : "/assets/a6cars-logo.png";
          return `
            <article class="vehicle-hub-card is-rental-card">
              <div class="veh-card-img">
                <img src="${img}" alt="${escapeHtml(r.brand)} ${escapeHtml(r.model)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/hero-car.jpg';" />
                <span class="rental-badge-chip">A6 Fleet Rental</span>
              </div>
              <div class="veh-card-body">
                <span class="eyebrow">${escapeHtml(r.vehicle_type)} &bull; Booking #${r.booking_id}</span>
                <h3>${escapeHtml(r.brand)} ${escapeHtml(r.model)}</h3>
                <div class="rental-period-box">
                  <span>Valid Rental Window:</span>
                  <strong>📅 ${formatDate(r.start_date)} to ${formatDate(r.end_date)}</strong>
                </div>
                <div class="veh-specs-row">
                  <span>⛽ ${escapeHtml(r.fuel_type)}</span>
                  <span>⚡ ${escapeHtml(r.mileage)}</span>
                  <span>👥 ${r.seating_capacity} Seats</span>
                </div>
                <div class="veh-actions">
                  <button class="button button-accent" type="button" data-action="offer-rental-carpool" data-booking-id="${r.booking_id}">
                    🚙 Use This Rented Car for Carpooling
                  </button>
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    }
  }
  init3DTiltEngine();
}

function initAddVehicleForm() {
  const dropArea = dom.vehFileDropArea;
  const fileInput = dom.vehImageFile;
  const previewBox = dom.vehImagePreviewBox;
  const previewImg = dom.vehPreviewImg;
  const removeBtn = dom.removeVehImageBtn;
  const urlInput = dom.vehImageUrl;

  dropArea?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", async () => {
    if (fileInput.files && fileInput.files[0]) {
      await handleVehicleImageUpload(fileInput.files[0]);
    }
  });

  urlInput?.addEventListener("input", () => {
    const val = urlInput.value.trim();
    if (val) {
      pageState.carpool.pendingUploadImageUrl = val;
      if (previewImg) previewImg.src = val;
      previewBox?.classList.remove("hidden");
    }
  });

  removeBtn?.addEventListener("click", () => {
    pageState.carpool.pendingUploadImageUrl = "";
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    previewBox?.classList.add("hidden");
  });

  dom.registerVehicleForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitRegisterVehicle(dom.registerVehicleForm);
  });
}

async function handleVehicleImageUpload(file) {
  try {
    showToast("Uploading vehicle photo...", "warning");
    const formData = new FormData();
    formData.append("image", file);

    const token = readUserSession().token;
    const res = await fetch("/api/carpool/vehicles/upload-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to upload image.");

    pageState.carpool.pendingUploadImageUrl = data.imageUrl || data.image_url;
    if (dom.vehPreviewImg) dom.vehPreviewImg.src = getAssetUrl(pageState.carpool.pendingUploadImageUrl);
    dom.vehImagePreviewBox?.classList.remove("hidden");
    showToast("Vehicle image uploaded successfully!", "success");
  } catch (error) {
    showToast(error.message || "Failed to upload image.", "error");
  }
}

async function submitRegisterVehicle(form) {
  if (!ensureUserSession()) return;
  const submitBtn = dom.saveVehicleBtn;
  setButtonBusy(submitBtn, true, "Saving Vehicle...");

  try {
    const regNumber = dom.vehRegNumber?.value.trim().toUpperCase();
    const year = Number(dom.vehYear?.value) || 2022;
    const brand = dom.vehBrand?.value.trim();
    const model = dom.vehModel?.value.trim();
    const vehicleType = dom.vehType?.value || "Sedan";
    const fuelType = dom.vehFuelType?.value || "Petrol";
    const mileage = dom.vehMileage?.value.trim() || "18 km/l";
    const seatingCapacity = Number(dom.vehCapacity?.value) || 4;
    const location = dom.vehLocation?.value.trim() || "Hyderabad";
    const offerNow = dom.vehOfferNowCheckbox?.checked;

    const imageUrl = pageState.carpool.pendingUploadImageUrl || dom.vehImageUrl?.value.trim() || "";

    const payload = {
      reg_number: regNumber,
      year,
      brand,
      model,
      name: `${brand} ${model}`,
      vehicle_type: vehicleType,
      fuel_type: fuelType,
      mileage,
      seating_capacity: seatingCapacity,
      location,
      image_url: imageUrl,
      images: imageUrl ? [imageUrl] : [],
    };

    const result = await fetchJson("/api/carpool/vehicles", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(result.message || "Vehicle registered successfully! You can now offer this car for carpooling.", "success");
    form.reset();
    pageState.carpool.pendingUploadImageUrl = "";
    dom.vehImagePreviewBox?.classList.add("hidden");

    await loadCarpoolVehicles();

    if (offerNow && result.vehicle) {
      switchCarpoolTab("create", { preselectVehicleId: String(result.vehicle.id) });
    } else {
      switchCarpoolTab("vehicles");
    }
  } catch (error) {
    showToast(error.message || "Failed to register vehicle.", "error");
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function deleteUserVehicle(vehicleId) {
  const confirmed = window.confirm("Are you sure you want to remove this personal vehicle?");
  if (!confirmed) return;

  try {
    const res = await fetchJson(`/api/carpool/vehicles/${vehicleId}`, { method: "DELETE" });
    showToast(res.message || "Vehicle removed successfully.", "success");
    await loadCarpoolVehicles();
  } catch (error) {
    showToast(error.message || "Failed to remove vehicle.", "error");
  }
}

async function loadCarpoolDashboard() {
  if (!hasUserSession()) return;
  try {
    const data = await fetchJson("/api/carpool/dashboard-summary");
    pageState.carpool.dashboardData = data;

    renderDashboardMetrics(data.summary || {});
    renderDashCreatedTrips(data.created_trips || []);
    renderDashJoinedTrips(data.joined_trips || []);
    renderDashRequests(data.incoming_requests || [], data.sent_requests || []);
    renderDashUpcomingTrips(data.upcoming || { host: [], passenger: [] });
    renderDashCompletedTrips(data.completed || { host: [], passenger: [] });
  } catch (error) {
    console.error("Dashboard load failed:", error);
  }
}

function renderDashboardMetrics(summary) {
  const activeRentals = pageState.carpool?.rentalVehicles ? pageState.carpool.rentalVehicles.length : 0;
  const myVehicles = pageState.carpool?.vehicles ? pageState.carpool.vehicles.length : 0;

  if (dom.dashActiveRentalsCount) dom.dashActiveRentalsCount.textContent = formatMetricNumber(activeRentals);
  if (dom.dashMyVehiclesCount) dom.dashMyVehiclesCount.textContent = formatMetricNumber(myVehicles);
  if (dom.dashCreatedCount) dom.dashCreatedCount.textContent = formatMetricNumber(summary.created_count || 0);
  if (dom.dashJoinedCount) dom.dashJoinedCount.textContent = formatMetricNumber(summary.joined_count || 0);
  if (dom.dashPendingRequestsCount) dom.dashPendingRequestsCount.textContent = formatMetricNumber((summary.pending_incoming_count || 0) + (summary.pending_sent_count || 0));
  if (dom.dashUpcomingCount) dom.dashUpcomingCount.textContent = formatMetricNumber(summary.upcoming_count || 0);
  if (dom.dashCompletedCount) dom.dashCompletedCount.textContent = formatMetricNumber(summary.completed_count || 0);

  if (dom.dashSubtabCreatedBadge) dom.dashSubtabCreatedBadge.textContent = String(summary.created_count || 0);
  if (dom.dashSubtabJoinedBadge) dom.dashSubtabJoinedBadge.textContent = String(summary.joined_count || 0);
  if (dom.dashSubtabRequestsBadge) dom.dashSubtabRequestsBadge.textContent = String(summary.pending_incoming_count || 0);
  if (dom.dashSubtabUpcomingBadge) dom.dashSubtabUpcomingBadge.textContent = String(summary.upcoming_count || 0);
  if (dom.dashSubtabCompletedBadge) dom.dashSubtabCompletedBadge.textContent = String(summary.completed_count || 0);
}

function switchDashboardSubtab(subtabName) {
  pageState.carpool.activeDashSubtab = subtabName;
  document.querySelectorAll("[data-dash-subtab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dashSubtab === subtabName);
  });

  const subtabContentMap = {
    created: dom.dashCreatedContent,
    joined: dom.dashJoinedContent,
    requests: dom.dashRequestsContent,
    upcoming: dom.dashUpcomingContent,
    completed: dom.dashCompletedContent,
  };

  Object.entries(subtabContentMap).forEach(([k, el]) => {
    if (el) el.classList.toggle("hidden", k !== subtabName);
  });
}

function renderDashCreatedTrips(trips) {
  if (!dom.dashCreatedList) return;
  if (!trips.length) {
    dom.dashCreatedList.innerHTML = `
      <div class="empty-state">
        <p>You haven't offered any carpool rides yet.</p>
        <button class="button button-primary" type="button" data-action="switch-carpool-tab" data-tab="create">+ Offer a Ride</button>
      </div>
    `;
    return;
  }

  dom.dashCreatedList.innerHTML = trips
    .map((trip) => {
      const isCancelled = trip.status === "CANCELLED";
      const isCompleted = trip.status === "COMPLETED";
      const isStarted = trip.status === "STARTED";

      let statusBadge = "";
      if (isCancelled) statusBadge = '<span class="status-badge badge-danger">Cancelled</span>';
      else if (isCompleted) statusBadge = '<span class="status-badge badge-neutral">Completed</span>';
      else if (isStarted) statusBadge = '<span class="status-badge badge-sky">Started</span>';
      else if (trip.available_seats === 0 || trip.status === "FULL") statusBadge = '<span class="status-badge badge-warning">Full</span>';
      else statusBadge = '<span class="status-badge badge-success">Open</span>';

      return `
        <article class="dash-trip-card">
          <div class="dash-trip-header">
            <div>
              <span class="eyebrow">Trip #${trip.id} &bull; ${escapeHtml(trip.vehicle_name || 'Vehicle')}</span>
              <h3>${escapeHtml(trip.source)} ➔ ${escapeHtml(trip.destination)}</h3>
              <p class="support-copy">📅 ${formatDate(trip.travel_date)} at ${escapeHtml(trip.departure_time)} &bull; ${formatCurrency(trip.price_per_seat)}/seat</p>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="dash-trip-meta">
            <span>Occupied Seats: <strong>${trip.occupied_seats || 0} / ${trip.total_seats || trip.available_seats}</strong></span>
            <span>Pending Requests: <strong>${trip.pending_requests_count || 0}</strong></span>
          </div>

          <div class="dash-trip-actions">
            <button class="button button-secondary" type="button" data-action="manage-trip-passengers" data-trip-id="${trip.id}">
              👥 Manage Passengers & Requests (${trip.pending_requests_count || 0} new)
            </button>
            ${!isCancelled && !isCompleted && !isStarted ? `
              <button class="button button-primary" type="button" data-action="update-trip-status" data-trip-id="${trip.id}" data-status="STARTED">
                ▶ Start Trip
              </button>
            ` : ""}
            ${isStarted ? `
              <button class="button button-success" type="button" data-action="update-trip-status" data-trip-id="${trip.id}" data-status="COMPLETED">
                ✓ Mark Completed
              </button>
            ` : ""}
            ${!isCancelled && !isCompleted ? `
              <button class="button button-danger" type="button" data-action="update-trip-status" data-trip-id="${trip.id}" data-status="CANCELLED">
                ✕ Cancel Trip
              </button>
            ` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDashJoinedTrips(rides) {
  if (!dom.dashJoinedList) return;
  if (!rides.length) {
    dom.dashJoinedList.innerHTML = `
      <div class="empty-state">
        <p>You haven't joined any carpool rides yet.</p>
        <button class="button button-primary" type="button" data-action="switch-carpool-tab" data-tab="find">🔍 Find a Ride</button>
      </div>
    `;
    return;
  }

  dom.dashJoinedList.innerHTML = rides
    .map((item) => {
      const trip = item.trip;
      if (!trip) return "";
      const isCompleted = item.status === "COMPLETED" || trip.status === "COMPLETED";
      const isCancelled = item.status === "CANCELLED" || trip.status === "CANCELLED";

      return `
        <article class="dash-trip-card">
          <div class="dash-trip-header">
            <div>
              <span class="eyebrow">Joined as Passenger &bull; ${item.seats} Seat(s)</span>
              <h3>${escapeHtml(trip.source)} ➔ ${escapeHtml(trip.destination)}</h3>
              <p class="support-copy">Driver: <strong>${escapeHtml(trip.driver_name)}</strong> &bull; 📅 ${formatDate(trip.travel_date)} at ${escapeHtml(trip.departure_time)}</p>
            </div>
            <div>
              <span class="status-badge ${isCompleted ? 'badge-neutral' : isCancelled ? 'badge-danger' : 'badge-success'}">
                ${isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : 'Confirmed'}
              </span>
            </div>
          </div>

          <div class="dash-trip-meta">
            <span>Pickup: <strong>${escapeHtml(item.pickup_point || trip.source)}</strong></span>
            <span>Total Share: <strong>${formatCurrency(trip.price_per_seat * item.seats)}</strong></span>
          </div>

          <div class="dash-trip-actions">
            ${isCompleted ? `
              <button class="button button-accent" type="button" data-action="review-carpool-driver" data-trip-id="${trip.id}" data-driver-name="${escapeHtml(trip.driver_name)}">
                ★ Rate & Review Driver
              </button>
            ` : ""}
            ${!isCompleted && !isCancelled ? `
              <button class="button button-ghost button-danger-text" type="button" data-action="leave-carpool-trip" data-trip-id="${trip.id}">
                Leave Carpool
              </button>
            ` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDashRequests(incoming, sent) {
  if (dom.dashIncomingRequestsList) {
    if (!incoming.length) {
      dom.dashIncomingRequestsList.innerHTML = '<p class="empty-note">No pending join requests from co-passengers.</p>';
    } else {
      dom.dashIncomingRequestsList.innerHTML = incoming
        .map((r) => `
          <div class="request-item-card">
            <div class="req-header">
              <strong>👤 ${escapeHtml(r.passenger_name)}</strong>
              <span class="status-badge badge-warning">Requested ${r.seats_requested} Seat(s)</span>
            </div>
            <p class="req-trip-note">Trip: ${escapeHtml(r.trip_source)} ➔ ${escapeHtml(r.trip_destination)} (${formatDate(r.travel_date)})</p>
            <p class="req-pickup-note">Pickup: <strong>${escapeHtml(r.pickup_point)}</strong> &bull; Drop: <strong>${escapeHtml(r.dropoff_point)}</strong></p>
            ${r.message ? `<p class="req-msg">"${escapeHtml(r.message)}"</p>` : ""}
            <div class="req-actions">
              <button class="button button-primary button-sm" type="button" data-action="accept-carpool-request" data-request-id="${r.id}">✓ Accept</button>
              <button class="button button-ghost button-sm" type="button" data-action="reject-carpool-request" data-request-id="${r.id}">✕ Reject</button>
            </div>
          </div>
        `)
        .join("");
    }
  }

  if (dom.dashSentRequestsList) {
    if (!sent.length) {
      dom.dashSentRequestsList.innerHTML = '<p class="empty-note">You have not sent any pending requests.</p>';
    } else {
      dom.dashSentRequestsList.innerHTML = sent
        .map((r) => `
          <div class="request-item-card">
            <div class="req-header">
              <strong>${r.trip ? `${escapeHtml(r.trip.source)} ➔ ${escapeHtml(r.trip.destination)}` : 'Trip Request'}</strong>
              <span class="status-badge ${r.status === 'ACCEPTED' ? 'badge-success' : r.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}">${r.status}</span>
            </div>
            <p class="req-trip-note">Seats: ${r.seats_requested} &bull; Pickup: ${escapeHtml(r.pickup_point)}</p>
            ${r.status === 'PENDING' ? `
              <div class="req-actions">
                <button class="button button-ghost button-sm button-danger-text" type="button" data-action="cancel-carpool-request" data-request-id="${r.id}">Cancel Request</button>
              </div>
            ` : ""}
          </div>
        `)
        .join("");
    }
  }
}

function renderDashUpcomingTrips(upcoming) {
  if (!dom.dashUpcomingList) return;
  const host = upcoming.host || [];
  const passenger = upcoming.passenger || [];
  const allUpcoming = [...host.map(t => ({ ...t, role: 'driver' })), ...passenger.map(j => ({ ...j.trip, role: 'passenger', seats_joined: j.seats }))];

  if (!allUpcoming.length) {
    dom.dashUpcomingList.innerHTML = `
      <div class="empty-state">
        <p>No upcoming carpool journeys on your schedule.</p>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
          <button class="button button-primary" type="button" data-action="switch-carpool-tab" data-tab="find">Find a Ride</button>
          <button class="button button-secondary" type="button" data-action="switch-carpool-tab" data-tab="create">Offer a Ride</button>
        </div>
      </div>
    `;
    return;
  }

  dom.dashUpcomingList.innerHTML = allUpcoming
    .map((item) => `
      <article class="dash-trip-card">
        <div class="dash-trip-header">
          <div>
            <span class="eyebrow">${item.role === 'driver' ? '🚗 You are Driving' : '👥 You are Riding'} &bull; ${formatDate(item.travel_date)} at ${escapeHtml(item.departure_time)}</span>
            <h3>${escapeHtml(item.source)} ➔ ${escapeHtml(item.destination)}</h3>
            <p class="support-copy">Vehicle: ${escapeHtml(item.vehicle_name || 'Vehicle')} &bull; Status: ${item.status}</p>
          </div>
          <span class="status-badge badge-sky">Upcoming</span>
        </div>
      </article>
    `)
    .join("");
}

function renderDashCompletedTrips(completed) {
  if (!dom.dashCompletedList) return;
  const host = completed.host || [];
  const passenger = completed.passenger || [];
  const allCompleted = [...host.map(t => ({ ...t, role: 'driver' })), ...passenger.map(j => ({ ...j.trip, role: 'passenger', seats_joined: j.seats }))];

  if (!allCompleted.length) {
    dom.dashCompletedList.innerHTML = '<div class="empty-state"><p>No completed carpool trips yet.</p></div>';
    return;
  }

  dom.dashCompletedList.innerHTML = allCompleted
    .map((item) => `
      <article class="dash-trip-card">
        <div class="dash-trip-header">
          <div>
            <span class="eyebrow">${item.role === 'driver' ? '🚗 Driven by You' : '👥 Joined as Passenger'} &bull; Completed</span>
            <h3>${escapeHtml(item.source)} ➔ ${escapeHtml(item.destination)}</h3>
            <p class="support-copy">Date: ${formatDate(item.travel_date)} &bull; Vehicle: ${escapeHtml(item.vehicle_name || 'Vehicle')}</p>
          </div>
          <span class="status-badge badge-neutral">Finished</span>
        </div>
      </article>
    `)
    .join("");
}

async function updateTripStatusFlow(tripId, newStatus) {
  let reason = "";
  if (newStatus === "CANCELLED") {
    const promptReason = window.prompt("Reason for cancelling this trip (passengers will be notified):", "Change of schedule");
    if (promptReason === null) return;
    reason = promptReason.trim();
  } else {
    const confirm = window.confirm(`Update trip status to ${newStatus}?`);
    if (!confirm) return;
  }

  try {
    const res = await fetchJson(`/api/carpool/trips/${tripId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: newStatus, reason }),
    });
    showToast(res.message || `Trip status updated to ${newStatus}.`, "success");
    await Promise.all([loadCarpoolDashboard(), loadCarpoolTrips()]);
  } catch (error) {
    showToast(error.message || "Failed to update trip status.", "error");
  }
}

async function openManagePassengersModal(tripId) {
  try {
    const data = await fetchJson(`/api/carpool/trips/${tripId}/requests`);
    const trip = data.trip;
    const passengers = data.passengers || [];
    const requests = data.requests || [];

    const content = document.createElement("div");
    content.className = "stack-list";
    content.innerHTML = `
      <div class="summary-route" style="margin-bottom: 12px;">
        <strong>${escapeHtml(trip.source)} ➔ ${escapeHtml(trip.destination)}</strong>
        <p>Available Seats: <strong>${trip.available_seats}</strong> / Total: ${trip.total_seats || 4}</p>
      </div>

      <div style="border-bottom: 1px solid rgba(15,23,42,0.1); padding-bottom: 12px; margin-bottom: 12px;">
        <h4>Confirmed Passengers (${passengers.length})</h4>
        ${!passengers.length ? '<p style="color: #64748b; font-size: 0.9rem;">No confirmed passengers on this trip yet.</p>' : `
          <div class="stack-list">
            ${passengers.map(p => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(15,23,42,0.03); border-radius: 10px;">
                <div>
                  <strong>👤 ${escapeHtml(p.passenger_name)}</strong>
                  <span style="font-size: 0.85rem; color: #64748b; display: block;">${p.seats} seat(s) &bull; Pickup: ${escapeHtml(p.pickup_point)} &bull; Phone: ${escapeHtml(p.passenger_phone || 'Private')}</span>
                </div>
                <span class="status-badge badge-success">Confirmed</span>
              </div>
            `).join("")}
          </div>
        `}
      </div>

      <div>
        <h4>Pending Requests (${requests.filter(r => r.status === 'PENDING').length})</h4>
        ${!requests.filter(r => r.status === 'PENDING').length ? '<p style="color: #64748b; font-size: 0.9rem;">No pending requests awaiting approval.</p>' : `
          <div class="stack-list">
            ${requests.filter(r => r.status === 'PENDING').map(r => `
              <div style="padding: 12px; border: 1px solid rgba(37,99,235,0.2); border-radius: 12px; background: rgba(37,99,235,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>👤 ${escapeHtml(r.passenger_name)}</strong>
                  <span class="status-badge badge-warning">${r.seats_requested} Seat(s) Requested</span>
                </div>
                <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0;">Pickup: ${escapeHtml(r.pickup_point)} &bull; Drop: ${escapeHtml(r.dropoff_point)}</p>
                ${r.message ? `<p style="font-style: italic; font-size: 0.85rem; color: #334155;">"${escapeHtml(r.message)}"</p>` : ""}
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button class="button button-primary button-inline" type="button" onclick="acceptJoinRequest(${r.id}); closeModal();">✓ Accept & Lock Seat</button>
                  <button class="button button-ghost button-inline" type="button" onclick="rejectJoinRequest(${r.id}); closeModal();">✕ Reject</button>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      </div>

      <div class="modal-actions" style="margin-top: 16px;">
        <button class="button button-secondary" type="button" data-action="close-modal">Close</button>
      </div>
    `;

    openModal({
      title: "Manage Trip Passengers",
      subtitle: `Review passengers and pending requests for trip #${tripId}.`,
      size: "wide",
      content,
    });
  } catch (error) {
    showToast(error.message || "Failed to load trip passengers.", "error");
  }
}

async function acceptJoinRequest(requestId) {
  try {
    const res = await fetchJson(`/api/carpool/requests/${requestId}/accept`, { method: "PUT" });
    showToast(res.message || "Passenger request accepted!", "success");
    await Promise.all([loadCarpoolDashboard(), loadCarpoolTrips()]);
  } catch (error) {
    showToast(error.message || "Failed to accept request.", "error");
  }
}

async function rejectJoinRequest(requestId) {
  try {
    const res = await fetchJson(`/api/carpool/requests/${requestId}/reject`, { method: "PUT" });
    showToast(res.message || "Request rejected.", "warning");
    await loadCarpoolDashboard();
  } catch (error) {
    showToast(error.message || "Failed to reject request.", "error");
  }
}

async function cancelJoinRequest(requestId) {
  try {
    const res = await fetchJson(`/api/carpool/requests/${requestId}/cancel`, { method: "PUT" });
    showToast(res.message || "Join request cancelled.", "success");
    await loadCarpoolDashboard();
  } catch (error) {
    showToast(error.message || "Failed to cancel request.", "error");
  }
}

async function leaveCarpoolTrip(tripId) {
  const confirm = window.confirm("Are you sure you want to leave this carpool? Your reserved seat will be returned to the driver.");
  if (!confirm) return;

  try {
    const res = await fetchJson(`/api/carpool/trips/${tripId}/leave`, { method: "DELETE" });
    showToast(res.message || "You have left the carpool trip.", "success");
    await Promise.all([loadCarpoolDashboard(), loadCarpoolTrips()]);
  } catch (error) {
    showToast(error.message || "Failed to leave carpool trip.", "error");
  }
}

function openReviewDriverModal(tripId, driverName) {
  const content = document.createElement("div");
  content.className = "stack-list";
  content.innerHTML = `
    <p>Share your travel experience with <strong>${escapeHtml(driverName)}</strong>.</p>
    <div class="field-block">
      <label>Rating (1 to 5 Stars)</label>
      <select class="select" id="reviewRatingInput">
        <option value="5">★★★★★ - Excellent (5 Stars)</option>
        <option value="4">★★★★☆ - Very Good (4 Stars)</option>
        <option value="3">★★★☆☆ - Average (3 Stars)</option>
        <option value="2">★★☆☆☆ - Poor (2 Stars)</option>
        <option value="1">★☆☆☆☆ - Very Bad (1 Star)</option>
      </select>
    </div>
    <div class="field-block">
      <label for="reviewCommentsInput">Comments & Feedback</label>
      <textarea class="input input-textarea" id="reviewCommentsInput" rows="3" placeholder="Punctual driver, smooth ride, clean car..."></textarea>
    </div>
    <div class="modal-actions" style="margin-top: 14px;">
      <button class="button button-primary" type="button" id="submitReviewBtn">Submit Review</button>
      <button class="button button-secondary" type="button" data-action="close-modal">Cancel</button>
    </div>
  `;

  content.querySelector("#submitReviewBtn")?.addEventListener("click", async () => {
    const rating = Number(content.querySelector("#reviewRatingInput").value) || 5;
    const comments = content.querySelector("#reviewCommentsInput").value.trim();

    try {
      const res = await fetchJson("/api/carpool/reviews", {
        method: "POST",
        body: JSON.stringify({
          trip_id: tripId,
          rating,
          comment: comments,
          role: "passenger_to_driver",
        }),
      });
      closeModal();
      showToast(res.message || "Thank you! Your review has been submitted.", "success");
    } catch (err) {
      showToast(err.message || "Failed to submit review.", "error");
    }
  });

  openModal({
    title: "Rate Your Carpool Journey",
    subtitle: `Review driver ${escapeHtml(driverName)}.`,
    content,
  });
}

/**
 * Advanced 3D Interactive Tilt & Specular Glare Engine
 * Brings physics-based depth, cursor tracking, and glossy light glare
 * to cards, hero showcases, and panels.
 */
function init3DTiltEngine() {
  if (typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) return;
  if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;

  const selector = [
    ".modern-car-card:not([data-tilt-bound])",
    ".vehicle-card:not([data-tilt-bound])",
    ".carpool-card:not([data-tilt-bound])",
    ".feature-card:not([data-tilt-bound])",
    ".hero-car-stage:not([data-tilt-bound])",
    ".floating-search-panel:not([data-tilt-bound])",
    ".home-priority-card:not([data-tilt-bound])",
    ".stat-card:not([data-tilt-bound])",
    ".metric-card:not([data-tilt-bound])",
    ".vehicle-hub-card:not([data-tilt-bound])",
    ".hero-3d-route-highway:not([data-tilt-bound])",
    ".glass-spotlight:not([data-tilt-bound])",
    ".benefit-card:not([data-tilt-bound])"
  ].join(", ");

  const targets = document.querySelectorAll(selector);

  targets.forEach((card) => {
    card.setAttribute("data-tilt-bound", "true");
    card.style.transformStyle = "preserve-3d";

    const isStage = card.classList.contains("hero-car-stage");
    const isSearch = card.classList.contains("floating-search-panel");
    const isHighway = card.classList.contains("hero-3d-route-highway");

    // Create dynamic specular reflection glare layer
    let glare = card.querySelector(".tilt-specular-glare");
    if (!glare && !isStage && !isSearch) {
      glare = document.createElement("div");
      glare.className = "tilt-specular-glare";
      card.appendChild(glare);
    }

    let rect = null;
    let rafId = null;

    function onMouseEnter() {
      rect = card.getBoundingClientRect();
      card.style.transition = "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.12s ease";
      if (glare) {
        glare.style.opacity = "1";
        glare.style.transition = "opacity 0.2s ease";
      }
    }

    function onMouseMove(e) {
      if (!rect) rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const xPct = Math.max(0, Math.min(1, x / rect.width));
      const yPct = Math.max(0, Math.min(1, y / rect.height));

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const tiltMax = isStage ? 6 : isHighway ? 5 : 10;
        const tiltX = (0.5 - yPct) * tiltMax;
        const tiltY = (xPct - 0.5) * tiltMax;
        const lift = isStage ? 0 : -8;
        const scale = isStage ? 1.01 : 1.02;

        card.style.transform = `perspective(1000px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(${lift}px) scale3d(${scale}, ${scale}, ${scale})`;

        if (glare) {
          glare.style.background = `radial-gradient(circle at ${(xPct * 100).toFixed(1)}% ${(yPct * 100).toFixed(1)}%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 45%, transparent 75%)`;
        }
      });
    }

    function onMouseLeave() {
      if (rafId) cancelAnimationFrame(rafId);
      card.style.transition = "transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.65s ease";
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)";
      if (glare) {
        glare.style.opacity = "0";
        glare.style.transition = "opacity 0.5s ease";
      }
      rect = null;
    }

    card.addEventListener("mouseenter", onMouseEnter);
    card.addEventListener("mousemove", onMouseMove);
    card.addEventListener("mouseleave", onMouseLeave);
  });
}


