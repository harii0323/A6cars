const state = {
  cars: [],
  bookings: [],
  transactions: [],
  cancellations: [],
  refunds: [],
  scheduleCarId: "",
  fleetSearch: "",
  transactionSearch: "",
  transactionFilter: "all",
  lastSync: null,
  activeModule: sessionStorage.getItem("adminActiveModule") || "overviewSection",
  sidebarExpanded: true,
};

const scannerState = {
  active: false,
  stream: null,
  timer: null,
  canvas: null,
  context: null,
};

const dom = {};
const compactSidebarMediaQuery = window.matchMedia("(max-width: 1180px)");

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindEvents();
  configureResponsiveSidebar();
  initializeAdminPage();
});

window.addEventListener("beforeunload", () => {
  stopScanner(false);
});

function cacheDom() {
  [
    "loginView",
    "dashboardView",
    "sidebar",
    "sidebarContent",
    "sidebarToggleBtn",
    "topbarTitle",
    "topbarCopy",
    "loginForm",
    "loginEmail",
    "loginPassword",
    "loginError",
    "loginSubmitBtn",
    "miniCars",
    "miniBookings",
    "miniRefunds",
    "syncChip",
    "syncText",
    "heroSummary",
    "actionCards",
    "metricBookings",
    "metricRevenue",
    "metricAvailable",
    "metricPendingPayments",
    "metricUpcoming",
    "metricRefunds",
    "metricBookingsNote",
    "metricRevenueNote",
    "metricAvailableNote",
    "metricPendingPaymentsNote",
    "metricUpcomingNote",
    "metricRefundsNote",
    "statusMixTag",
    "statusBreakdown",
    "bookingTrendChart",
    "transactionSearchInput",
    "transactionTableBody",
    "fleetSearchInput",
    "fleetGrid",
    "carImagesInput",
    "carImagesPreview",
    "addCarForm",
    "addCarSubmitBtn",
    "scheduleCarSelect",
    "loadScheduleBtn",
    "scheduleOutput",
    "scannerVideo",
    "scannerStatus",
    "startScannerBtn",
    "stopScannerBtn",
    "manualVerifyForm",
    "manualBookingId",
    "manualPaymentReference",
    "paymentVerificationResult",
    "refundSummary",
    "cancellationsTableBody",
    "refundsTableBody",
    "refreshDashboardBtn",
    "topLogoutBtn",
    "sidebarLogoutBtn",
    "processRefundsBtn",
    "exportAllCarsBtn",
    "toastRoot",
    "modalRoot",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });

  dom.navButtons = Array.from(document.querySelectorAll(".nav-button"));
  dom.moduleViews = Array.from(document.querySelectorAll("[data-module-view]"));
  dom.transactionFilterPills = Array.from(
    document.querySelectorAll("#transactionFilterPills .filter-pill")
  );
}

function initializeAdminPage() {
  if (ensureAuthenticated()) {
    refreshDashboard();
  } else {
    setAdminSessionState(false);
  }
}

function bindEvents() {
  dom.loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loginAdmin();
  });

  dom.sidebarToggleBtn?.addEventListener("click", toggleResponsiveSidebar);

  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNav(button.dataset.target);
      if (isCompactSidebar()) {
        setSidebarExpanded(false);
      }
    });
  });

  dom.refreshDashboardBtn?.addEventListener("click", refreshDashboard);
  dom.topLogoutBtn?.addEventListener("click", logout);
  dom.sidebarLogoutBtn?.addEventListener("click", logout);

  dom.transactionSearchInput?.addEventListener("input", (event) => {
    state.transactionSearch = event.target.value.trim().toLowerCase();
    renderTransactions();
  });

  dom.transactionFilterPills.forEach((button) => {
    button.addEventListener("click", () => {
      state.transactionFilter = button.dataset.filter || "all";
      dom.transactionFilterPills.forEach((pill) =>
        pill.classList.toggle("active", pill === button)
      );
      renderTransactions();
    });
  });

  dom.fleetSearchInput?.addEventListener("input", (event) => {
    state.fleetSearch = event.target.value.trim().toLowerCase();
    renderFleet();
  });

  dom.exportAllCarsBtn?.addEventListener("click", () => {
    exportRowsAsCsv("a6cars-all-bookings.csv", state.bookings);
  });

  dom.carImagesInput?.addEventListener("change", renderSelectedImages);

  dom.addCarForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAddCarForm(event.currentTarget);
  });

  dom.fleetGrid?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const carId = Number(actionButton.dataset.carId);
    const car = state.cars.find((item) => Number(item.id) === carId);
    if (!car) {
      return;
    }

    const action = actionButton.dataset.action;
    if (action === "view-bookings") {
      openCarBookingsModal(car);
    } else if (action === "export-car") {
      const rows = state.bookings.filter(
        (booking) => Number(booking.car_id) === Number(car.id)
      );
      exportRowsAsCsv(
        `${slugify(`${car.brand}-${car.model}`)}-bookings.csv`,
        rows
      );
    } else if (action === "delete-car") {
      await deleteCar(car);
    }
  });

  dom.loadScheduleBtn?.addEventListener("click", async () => {
    const carId = dom.scheduleCarSelect?.value;
    if (!carId) {
      showToast("Select a car before loading the schedule.", "error");
      return;
    }
    state.scheduleCarId = carId;
    await loadSchedule(carId);
  });

  dom.scheduleOutput?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-cancel-booking]");
    if (!actionButton) {
      return;
    }
    const bookingId = Number(actionButton.dataset.cancelBooking);
    if (!bookingId) {
      return;
    }
    await cancelBookingFromSchedule(bookingId);
  });

  dom.startScannerBtn?.addEventListener("click", startScanner);
  dom.stopScannerBtn?.addEventListener("click", () => stopScanner(true));

  dom.manualVerifyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const bookingId = dom.manualBookingId?.value.trim();
    const paymentReference = dom.manualPaymentReference?.value.trim();

    if (!bookingId || !paymentReference) {
      setVerificationResult("Booking ID and payment reference are required.", "error");
      return;
    }

    await verifyPayment(bookingId, paymentReference);
  });

  dom.processRefundsBtn?.addEventListener("click", async () => {
    const ok = window.confirm("Process every pending refund in the current queue?");
    if (!ok) {
      return;
    }

    try {
      const result = await fetchJson("/api/admin/process-refunds", {
        method: "POST",
        body: JSON.stringify({}),
      });
      showToast(result.message || "Refund queue processed.", "success");
      await refreshDashboard();
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  dom.modalRoot?.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function configureResponsiveSidebar() {
  syncResponsiveSidebar();

  const handleSidebarMediaChange = () => {
    syncResponsiveSidebar();
  };

  if (typeof compactSidebarMediaQuery.addEventListener === "function") {
    compactSidebarMediaQuery.addEventListener("change", handleSidebarMediaChange);
  } else {
    compactSidebarMediaQuery.addListener(handleSidebarMediaChange);
  }
}

function isCompactSidebar() {
  return compactSidebarMediaQuery.matches;
}

function toggleResponsiveSidebar() {
  if (!isCompactSidebar()) {
    return;
  }

  setSidebarExpanded(!state.sidebarExpanded);
}

function syncResponsiveSidebar() {
  setSidebarExpanded(!isCompactSidebar());
}

function setSidebarExpanded(expanded) {
  state.sidebarExpanded = expanded;

  if (!dom.sidebar || !dom.sidebarToggleBtn) {
    return;
  }

  const collapsed = isCompactSidebar() && !expanded;
  dom.sidebar.classList.toggle("is-collapsed", collapsed);
  dom.sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  dom.sidebarToggleBtn.innerHTML = collapsed
    ? '<i class="fas fa-bars"></i><span>Menu</span>'
    : '<i class="fas fa-xmark"></i><span>Close</span>';
}

function ensureAuthenticated() {
  const token = getAdminToken();
  if (!token) {
    clearAdminSession();
    return false;
  }

  sessionStorage.setItem("adminLoggedIn", "true");
  setAdminSessionState(true);
  return true;
}

function getAdminToken() {
  return sessionStorage.getItem("adminToken") || "";
}

function resolveBackendUrl() {
  const host = window.location.hostname;
  const protocol = window.location.protocol;

  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:10000";
  }

  if (host.includes("onrender.com")) {
    return "https://a6cars-backend-ylx7.onrender.com";
  }

  return `${protocol}//api.${host}`;
}

function api(path) {
  const base = resolveBackendUrl();
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

async function fetchJson(path, options = {}) {
  const { auth = true, headers = {}, body, method = "GET" } = options;
  const requestHeaders = { ...headers };

  if (!(body instanceof FormData) && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    requestHeaders.Authorization = `Bearer ${getAdminToken()}`;
  }

  const response = await fetch(api(path), {
    method,
    headers: requestHeaders,
    body,
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    if (auth && (response.status === 401 || response.status === 403)) {
      clearAdminSession();
      setAdminSessionState(false);
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

function clearAdminSession() {
  stopScanner(false);
  sessionStorage.removeItem("adminToken");
  sessionStorage.removeItem("adminLoggedIn");
  closeModal();
}

function setAdminSessionState(isLoggedIn) {
  dom.loginView?.classList.toggle("hidden", isLoggedIn);
  dom.dashboardView?.classList.toggle("hidden", !isLoggedIn);
  syncResponsiveSidebar();

  if (isLoggedIn) {
    sessionStorage.setItem("adminLoggedIn", "true");
    hideLoginError();
    dom.loginPassword && (dom.loginPassword.value = "");
    setActiveNav(state.activeModule, { persist: false });
  } else {
    state.activeModule = "overviewSection";
    setActiveNav(state.activeModule, { persist: false });
    setSyncStatus("Waiting for first sync", "idle");
    setVerificationResult("Verification results will appear here.", "");
    dom.scannerStatus && (dom.scannerStatus.textContent = "Scanner idle.");
    dom.loginForm?.reset();
  }
}

function logout() {
  clearAdminSession();
  setAdminSessionState(false);
  showToast("Logged out successfully.", "info");
}

async function loginAdmin() {
  hideLoginError();

  const email = dom.loginEmail?.value.trim();
  const password = dom.loginPassword?.value || "";

  if (!email || !password) {
    showLoginError("Email and password are required.");
    return;
  }

  dom.loginSubmitBtn?.setAttribute("disabled", "disabled");
  if (dom.loginSubmitBtn) {
    dom.loginSubmitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Signing In</span>`;
  }

  try {
    const result = await fetchJson("/api/admin/login", {
      auth: false,
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    sessionStorage.setItem("adminToken", result.token || "");
    sessionStorage.setItem("adminLoggedIn", "true");
    setAdminSessionState(true);
    showToast("Admin login successful.", "success");
    await refreshDashboard();
  } catch (error) {
    showLoginError(error.message || "Login failed.");
  } finally {
    dom.loginSubmitBtn?.removeAttribute("disabled");
    if (dom.loginSubmitBtn) {
      dom.loginSubmitBtn.innerHTML = `<i class="fas fa-lock"></i><span>Sign In</span>`;
    }
  }
}

function showLoginError(message) {
  if (!dom.loginError) {
    return;
  }
  dom.loginError.textContent = message;
  dom.loginError.classList.remove("hidden");
}

function hideLoginError() {
  if (!dom.loginError) {
    return;
  }
  dom.loginError.textContent = "";
  dom.loginError.classList.add("hidden");
}

async function refreshDashboard() {
  setSyncStatus("Syncing dashboard data...", "loading");
  dom.refreshDashboardBtn?.setAttribute("disabled", "disabled");

  const selectedCarId = dom.scheduleCarSelect?.value || state.scheduleCarId || "";
  const pendingFailures = [];

  try {
    const [carsResult, bookingsResult, transactionsResult, cancellationsResult, refundsResult] =
      await Promise.allSettled([
        fetchJson("/api/cars", { auth: false }),
        fetchJson("/api/bookings/all"),
        fetchJson("/api/admin/transactions?page=1&pageSize=200"),
        fetchJson("/api/admin/canceled-bookings"),
        fetchJson("/api/admin/refunds"),
      ]);

    state.cars = settleResult(carsResult, [], "cars", pendingFailures);
    state.bookings = settleResult(bookingsResult, [], "bookings", pendingFailures);
    state.transactions = normalizeTransactions(
      settleResult(transactionsResult, [], "transactions", pendingFailures)
    );
    state.cancellations = settleResult(
      cancellationsResult,
      [],
      "cancellations",
      pendingFailures
    );
    state.refunds = settleResult(refundsResult, [], "refunds", pendingFailures);
    state.lastSync = new Date();

    renderDashboard();

    if (selectedCarId && state.cars.some((car) => String(car.id) === String(selectedCarId))) {
      state.scheduleCarId = selectedCarId;
      dom.scheduleCarSelect.value = selectedCarId;
      await loadSchedule(selectedCarId);
    }

    if (pendingFailures.length) {
      const label = pendingFailures.join(", ");
      setSyncStatus(`Loaded with partial data: ${label}`, "error");
      showToast(`Some dashboard data could not be loaded: ${label}.`, "error");
    } else {
      setSyncStatus(`Updated ${formatTime(state.lastSync)}`, "ok");
    }
  } catch (error) {
    setSyncStatus("Unable to refresh dashboard", "error");
    showToast(error.message, "error");
  } finally {
    dom.refreshDashboardBtn?.removeAttribute("disabled");
  }
}

function settleResult(result, fallback, label, failures) {
  if (result.status === "fulfilled") {
    return Array.isArray(result.value) ? result.value : result.value || fallback;
  }
  failures.push(label);
  return fallback;
}

function normalizeTransactions(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

function renderDashboard() {
  const metrics = computeMetrics();
  renderHero(metrics);
  renderMetrics(metrics);
  renderStatusBreakdown(metrics);
  renderTrendChart(metrics);
  renderTransactions();
  renderFleet();
  renderScheduleOptions();
  renderRefunds(metrics);
}

function computeMetrics() {
  const today = startOfDay(new Date());
  const nextWeek = addDays(today, 7);
  const activeCarIds = new Set();
  const statusCounts = {
    pending: 0,
    confirmed: 0,
    collected: 0,
    returned: 0,
    cancelled: 0,
    other: 0,
  };

  state.bookings.forEach((booking) => {
    const normalized = normalizeBookingStatus(booking.status);
    statusCounts[normalized] = (statusCounts[normalized] || 0) + 1;

    const startDate = toDate(booking.start_date);
    const endDate = toDate(booking.end_date);
    if (
      normalized !== "cancelled" &&
      startDate &&
      endDate &&
      startDate <= today &&
      endDate >= today
    ) {
      activeCarIds.add(String(booking.car_id));
    }
  });

  const completedTransactions = state.transactions.filter(isCompletedTransaction);
  const pendingTransactions = state.transactions.filter(
    (transaction) => !isCompletedTransaction(transaction)
  );
  const pendingRefunds = state.refunds.filter(
    (refund) => normalizeSimpleStatus(refund.status) === "pending"
  );
  const processedRefunds = state.refunds.filter(
    (refund) => normalizeSimpleStatus(refund.status) === "processed"
  );
  const upcomingPickups = state.bookings.filter((booking) => {
    const normalized = normalizeBookingStatus(booking.status);
    const startDate = toDate(booking.start_date);
    return (
      normalized !== "cancelled" &&
      startDate &&
      startDate >= today &&
      startDate <= nextWeek
    );
  });

  const pendingRefundAmount = pendingRefunds.reduce(
    (sum, refund) => sum + toNumber(refund.amount),
    0
  );

  const completedRevenue = completedTransactions.reduce(
    (sum, transaction) => sum + toNumber(transaction.payment_amount || transaction.amount),
    0
  );

  return {
    totalCars: state.cars.length,
    totalBookings: state.bookings.length,
    availableNow: Math.max(0, state.cars.length - activeCarIds.size),
    activeCars: activeCarIds.size,
    completedRevenue,
    pendingPayments: pendingTransactions.length,
    completedPayments: completedTransactions.length,
    upcomingPickups: upcomingPickups.length,
    pendingRefundCount: pendingRefunds.length,
    pendingRefundAmount,
    processedRefundCount: processedRefunds.length,
    statusCounts,
    monthlyBookings: buildMonthlyBookingSeries(state.bookings),
    cancellationCount: state.cancellations.length,
  };
}

function renderHero(metrics) {
  const actionCards = [];
  if (metrics.pendingRefundCount > 0) {
    actionCards.push({
      title: "Refund queue needs attention",
      body: `${metrics.pendingRefundCount} refund requests are still pending.`,
      foot: `${formatCurrency(metrics.pendingRefundAmount)} waiting to be processed.`,
    });
  } else {
    actionCards.push({
      title: "Refund queue is clear",
      body: "No pending refunds are waiting on admin action.",
      foot: `${metrics.processedRefundCount} refunds have already been processed.`,
    });
  }

  if (metrics.pendingPayments > 0) {
    actionCards.push({
      title: "Payment follow-up required",
      body: `${metrics.pendingPayments} payment records are still marked pending.`,
      foot: "Use the verification panel to clear manual payments faster.",
    });
  } else {
    actionCards.push({
      title: "Payments are in good shape",
      body: "No pending payment backlog is currently visible.",
      foot: `${metrics.completedPayments} completed payments are on record.`,
    });
  }

  actionCards.push({
    title: "Fleet readiness",
    body: `${metrics.availableNow} of ${metrics.totalCars} cars are available right now.`,
    foot:
      metrics.upcomingPickups > 0
        ? `${metrics.upcomingPickups} pickups start in the next 7 days.`
        : "No near-term pickup pressure detected in the next 7 days.",
  });

  dom.actionCards.innerHTML = actionCards
    .map(
      (card) => `
        <article class="action-card">
          <h4>${escapeHtml(card.title)}</h4>
          <p>${escapeHtml(card.body)}</p>
          <strong>${escapeHtml(card.foot)}</strong>
        </article>
      `
    )
    .join("");

  const summaryParts = [];
  summaryParts.push(`${metrics.totalBookings} total bookings tracked.`);
  summaryParts.push(`${metrics.availableNow} cars are free today.`);
  summaryParts.push(`${metrics.pendingPayments} payment cases still need follow-up.`);
  dom.heroSummary.textContent = summaryParts.join(" ");

  dom.miniCars.textContent = String(metrics.totalCars);
  dom.miniBookings.textContent = String(metrics.totalBookings);
  dom.miniRefunds.textContent = String(metrics.pendingRefundCount);
}

function renderMetrics(metrics) {
  dom.metricBookings.textContent = String(metrics.totalBookings);
  dom.metricBookingsNote.textContent = `${metrics.cancellationCount} cancellations logged`;

  dom.metricRevenue.textContent = formatCurrency(metrics.completedRevenue);
  dom.metricRevenueNote.textContent = `${metrics.completedPayments} completed payments`;

  dom.metricAvailable.textContent = `${metrics.availableNow}/${metrics.totalCars}`;
  dom.metricAvailableNote.textContent = `${metrics.activeCars} cars currently active`;

  dom.metricPendingPayments.textContent = String(metrics.pendingPayments);
  dom.metricPendingPaymentsNote.textContent =
    metrics.pendingPayments > 0
      ? "Needs verification or customer follow-up"
      : "No payment backlog right now";

  dom.metricUpcoming.textContent = String(metrics.upcomingPickups);
  dom.metricUpcomingNote.textContent =
    metrics.upcomingPickups > 0
      ? "Trips starting in the next 7 days"
      : "No near-term pickups scheduled";

  dom.metricRefunds.textContent = formatCurrency(metrics.pendingRefundAmount);
  dom.metricRefundsNote.textContent = `${metrics.pendingRefundCount} refund requests pending`;
}

function renderStatusBreakdown(metrics) {
  const labels = [
    { key: "pending", label: "Pending", color: "#d89a3d" },
    { key: "confirmed", label: "Confirmed / Booked", color: "#3c77d1" },
    { key: "collected", label: "Collected", color: "#178a7b" },
    { key: "returned", label: "Returned", color: "#7c4ed9" },
    { key: "cancelled", label: "Cancelled", color: "#d85a5a" },
    { key: "other", label: "Other", color: "#5f6f87" },
  ];
  const maxCount = Math.max(
    1,
    ...labels.map((item) => Number(metrics.statusCounts[item.key] || 0))
  );

  dom.statusBreakdown.innerHTML = labels
    .map((item) => {
      const count = Number(metrics.statusCounts[item.key] || 0);
      const width = `${Math.max(6, (count / maxCount) * 100)}%`;
      return `
        <div class="stack-item">
          <div class="stack-line">
            <span>${escapeHtml(item.label)}</span>
            <strong>${count}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${width}; background:${item.color};"></div>
          </div>
        </div>
      `;
    })
    .join("");

  dom.statusMixTag.textContent = `${metrics.totalBookings} bookings mapped`;
}

function renderTrendChart(metrics) {
  const series = metrics.monthlyBookings;
  const maxValue = Math.max(1, ...series.map((point) => point.value));

  dom.bookingTrendChart.innerHTML = series
    .map((point) => {
      const height = Math.max(18, (point.value / maxValue) * 170);
      return `
        <div class="bar-column">
          <div class="bar-value">${point.value}</div>
          <div class="bar-stick" style="height:${height}px;"></div>
          <div class="bar-label">${escapeHtml(point.label)}</div>
        </div>
      `;
    })
    .join("");
}

function renderTransactions() {
  const filtered = state.transactions.filter((transaction) => {
    const searchMatches = !state.transactionSearch
      ? true
      : [
          transaction.payment_id,
          transaction.booking_id,
          transaction.customer_name,
          transaction.email,
          transaction.brand,
          transaction.model,
        ]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(state.transactionSearch));

    const status = normalizeTransactionStatus(transaction.payment_status || transaction.status);
    const filterMatches =
      state.transactionFilter === "all"
        ? true
        : state.transactionFilter === "completed"
        ? status === "completed"
        : status !== "completed";

    return searchMatches && filterMatches;
  });

  if (!filtered.length) {
    dom.transactionTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state compact">No transactions match the current filters.</div>
        </td>
      </tr>
    `;
    return;
  }

  dom.transactionTableBody.innerHTML = filtered
    .slice(0, 14)
    .map((transaction) => {
      const status = normalizeTransactionStatus(transaction.payment_status || transaction.status);
      const tone = badgeToneForStatus(status);
      return `
        <tr>
          ${tableCell(
            "Payment",
            `
              <strong>#${escapeHtml(transaction.payment_id || transaction.id || "-")}</strong>
              <span class="muted">Booking #${escapeHtml(
                transaction.booking_id || transaction.booking_id_row || "-"
              )}</span>
            `
          )}
          ${tableCell(
            "Customer",
            `
              <strong>${escapeHtml(transaction.customer_name || "Unknown customer")}</strong>
              <span class="muted">${escapeHtml(transaction.email || "No email")}</span>
            `
          )}
          ${tableCell(
            "Car",
            `
              <strong>${escapeHtml(
                `${transaction.brand || "Unknown"} ${transaction.model || ""}`.trim()
              )}</strong>
            `
          )}
          ${tableCell("Amount", formatCurrency(transaction.payment_amount || transaction.amount))}
          ${tableCell("Status", renderStatusBadge(status, tone))}
          ${tableCell(
            "Trip dates",
            `
              <strong>${formatDate(transaction.start_date)}</strong>
              <span class="muted">${formatDate(transaction.end_date)}</span>
            `
          )}
        </tr>
      `;
    })
    .join("");
}

function renderFleet() {
  const today = startOfDay(new Date());
  const filteredCars = state.cars.filter((car) => {
    if (!state.fleetSearch) {
      return true;
    }
    const haystack = `${car.brand || ""} ${car.model || ""} ${car.location || ""}`
      .toLowerCase()
      .trim();
    return haystack.includes(state.fleetSearch);
  });

  if (!filteredCars.length) {
    dom.fleetGrid.innerHTML = `<div class="empty-state">No cars match the current fleet search.</div>`;
    return;
  }

  dom.fleetGrid.innerHTML = filteredCars
    .map((car) => {
      const carBookings = state.bookings.filter(
        (booking) => Number(booking.car_id) === Number(car.id)
      );
      const isActiveToday = carBookings.some((booking) => {
        const normalized = normalizeBookingStatus(booking.status);
        const startDate = toDate(booking.start_date);
        const endDate = toDate(booking.end_date);
        return (
          normalized !== "cancelled" &&
          startDate &&
          endDate &&
          startDate <= today &&
          endDate >= today
        );
      });
      const nextBooking = carBookings
        .filter((booking) => {
          const startDate = toDate(booking.start_date);
          return (
            normalizeBookingStatus(booking.status) !== "cancelled" &&
            startDate &&
            startDate >= today
          );
        })
        .sort((left, right) => toDate(left.start_date) - toDate(right.start_date))[0];

      const imageUrl = resolveImageUrl(car.images && car.images[0]);
      return `
        <article class="fleet-card">
          <img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(
            `${car.brand || "Car"} ${car.model || ""}`.trim()
          )}" onerror="this.src='https://via.placeholder.com/320x220?text=A6+Cars';" />
          <div class="fleet-copy">
            <div class="fleet-heading">
              <div>
                <h4>${escapeHtml(`${car.brand || "Unknown"} ${car.model || ""}`.trim())}</h4>
                <div class="fleet-meta">
                  <span>${escapeHtml(car.location || "Location not set")}</span>
                  <span>${escapeHtml(car.year || "-")}</span>
                  <span>${formatCurrency(car.daily_rate)} / day</span>
                </div>
              </div>
              <div class="badge-row">
                ${renderStatusBadge(
                  isActiveToday ? "Booked today" : "Available",
                  isActiveToday ? "warning" : "success"
                )}
              </div>
            </div>
            <div class="fleet-meta">
              <span>${carBookings.length} total bookings</span>
              <span>${
                nextBooking
                  ? `Next pickup ${formatDate(nextBooking.start_date)}`
                  : "No upcoming bookings"
              }</span>
            </div>
            <div class="card-actions">
              <button class="card-button" type="button" data-action="view-bookings" data-car-id="${car.id}">View bookings</button>
              <button class="card-button" type="button" data-action="export-car" data-car-id="${car.id}">Export CSV</button>
              <button class="card-button danger" type="button" data-action="delete-car" data-car-id="${car.id}">Delete</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSelectedImages() {
  const files = Array.from(dom.carImagesInput?.files || []);
  if (!files.length) {
    dom.carImagesPreview.textContent = "No images selected yet.";
    return;
  }

  dom.carImagesPreview.innerHTML = files
    .map((file) => `<div>${escapeHtml(file.name)} (${formatFileSize(file.size)})</div>`)
    .join("");
}

async function submitAddCarForm(form) {
  const submitButton = dom.addCarSubmitBtn;
  submitButton?.setAttribute("disabled", "disabled");
  if (submitButton) {
    submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Adding car</span>`;
  }

  try {
    const formData = new FormData(form);
    const result = await fetchJson("/api/admin/addcar", {
      method: "POST",
      body: formData,
    });
    showToast(result.message || "Car added successfully.", "success");
    form.reset();
    renderSelectedImages();
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton?.removeAttribute("disabled");
    if (submitButton) {
      submitButton.innerHTML = `<i class="fas fa-plus"></i><span>Add Car</span>`;
    }
  }
}

async function deleteCar(car) {
  const confirmed = window.confirm(
    `Delete ${car.brand || "this car"} ${car.model || ""} and all of its bookings?`
  );
  if (!confirmed) {
    return;
  }

  try {
    const result = await fetchJson("/api/deletecar", {
      method: "POST",
      body: JSON.stringify({ car_id: car.id }),
    });
    showToast(result.message || "Car deleted.", "success");
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderScheduleOptions() {
  if (!dom.scheduleCarSelect) {
    return;
  }

  const previousValue = state.scheduleCarId || dom.scheduleCarSelect.value;
  dom.scheduleCarSelect.innerHTML = [
    `<option value="">Choose a car</option>`,
    ...state.cars.map(
      (car) =>
        `<option value="${car.id}">${escapeHtml(
          `${car.brand || "Unknown"} ${car.model || ""} - ${car.location || "No location"}`
        )}</option>`
    ),
  ].join("");

  if (previousValue && state.cars.some((car) => String(car.id) === String(previousValue))) {
    dom.scheduleCarSelect.value = previousValue;
  }
}

async function loadSchedule(carId) {
  dom.scheduleOutput.innerHTML = `<div class="empty-state compact">Loading schedule...</div>`;
  try {
    const data = await fetchJson(`/api/admin/car-schedule/${carId}`);
    renderSchedule(data);
  } catch (error) {
    dom.scheduleOutput.innerHTML = `<div class="empty-state compact">${escapeHtml(
      error.message
    )}</div>`;
  }
}

function renderSchedule(data) {
  const bookings = Array.isArray(data.bookings) ? data.bookings : [];
  const vacancies = Array.isArray(data.vacancies) ? data.vacancies : [];

  const bookingBlock = bookings.length
    ? `
      <div class="schedule-block">
        <div class="subpanel-head">
          <h4>Booked windows</h4>
          <span class="panel-tag">${bookings.length} trips</span>
        </div>
        <div class="table-wrap compact">
          <table class="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${bookings
                .map((booking) => {
                  const normalized = normalizeBookingStatus(booking.status);
                  return `
                    <tr>
                      ${tableCell("Booking", `#${escapeHtml(booking.id)}`)}
                      ${tableCell(
                        "Dates",
                        `
                          <strong>${formatDate(booking.start_date)}</strong>
                          <span class="muted">${formatDate(booking.end_date)}</span>
                        `
                      )}
                      ${tableCell(
                        "Status",
                        renderStatusBadge(normalized, badgeToneForStatus(normalized))
                      )}
                      ${tableCell(
                        "Action",
                        normalized !== "cancelled"
                          ? `<button class="card-button danger" type="button" data-cancel-booking="${booking.id}">Cancel</button>`
                          : "-"
                      )}
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `
    : `
      <div class="schedule-block">
        <div class="empty-state compact">No active bookings are scheduled for this car.</div>
      </div>
    `;

  const vacancyBlock = vacancies.length
    ? `
      <div class="schedule-block">
        <div class="subpanel-head">
          <h4>Open dates</h4>
          <span class="panel-tag">${vacancies.length} windows</span>
        </div>
        <div class="vacancy-grid">
          ${vacancies
            .map(
              (range) => `
                <div class="vacancy-card">
                  <strong>${formatDate(range.start)}</strong>
                  <span class="muted">through ${formatDate(range.end)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `
    : `
      <div class="schedule-block">
        <div class="empty-state compact">No vacancy windows were returned for this car.</div>
      </div>
    `;

  dom.scheduleOutput.innerHTML = bookingBlock + vacancyBlock;
}

async function cancelBookingFromSchedule(bookingId) {
  const reason = window.prompt("Enter the cancellation reason for this booking:");
  if (!reason) {
    return;
  }

  try {
    const result = await fetchJson("/api/admin/cancel-booking", {
      method: "POST",
      body: JSON.stringify({ booking_id: bookingId, reason }),
    });
    showToast(result.message || "Booking cancelled.", "success");
    await refreshDashboard();
    if (state.scheduleCarId) {
      await loadSchedule(state.scheduleCarId);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function verifyPayment(bookingId, paymentReference) {
  setVerificationResult("Verifying payment reference...", "");

  try {
    const result = await fetchJson("/api/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        booking_id: Number(bookingId),
        payment_reference_id: paymentReference,
      }),
    });
    setVerificationResult(
      result.message || "Payment verified successfully.",
      "success"
    );
    showToast("Payment verification completed.", "success");
    await refreshDashboard();
  } catch (error) {
    setVerificationResult(error.message, "error");
    showToast(error.message, "error");
  }
}

function setVerificationResult(message, tone) {
  dom.paymentVerificationResult.textContent = message;
  dom.paymentVerificationResult.classList.remove("success", "error");
  if (tone) {
    dom.paymentVerificationResult.classList.add(tone);
  }
}

async function startScanner() {
  if (scannerState.active) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dom.scannerStatus.textContent = "Camera access is not supported in this browser.";
    showToast("Camera access is not supported in this browser.", "error");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });

    scannerState.stream = stream;
    scannerState.active = true;
    scannerState.canvas = document.createElement("canvas");
    scannerState.context = scannerState.canvas.getContext("2d", {
      willReadFrequently: true,
    });

    dom.scannerVideo.srcObject = stream;
    await dom.scannerVideo.play();
    dom.scannerStatus.textContent = "Scanner active. Hold the QR code steady in front of the camera.";

    scannerState.timer = window.setInterval(() => {
      if (!scannerState.active || !window.jsQR) {
        return;
      }

      if (dom.scannerVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      scannerState.canvas.width = dom.scannerVideo.videoWidth;
      scannerState.canvas.height = dom.scannerVideo.videoHeight;
      scannerState.context.drawImage(
        dom.scannerVideo,
        0,
        0,
        scannerState.canvas.width,
        scannerState.canvas.height
      );

      const imageData = scannerState.context.getImageData(
        0,
        0,
        scannerState.canvas.width,
        scannerState.canvas.height
      );

      const code = window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height
      );

      if (code && code.data) {
        handleQrData(code.data);
      }
    }, 180);
  } catch (error) {
    dom.scannerStatus.textContent = `Unable to start scanner: ${error.message}`;
    showToast(error.message, "error");
    stopScanner(false);
  }
}

function stopScanner(updateStatus = true) {
  if (scannerState.timer) {
    window.clearInterval(scannerState.timer);
    scannerState.timer = null;
  }

  if (scannerState.stream) {
    scannerState.stream.getTracks().forEach((track) => track.stop());
    scannerState.stream = null;
  }

  scannerState.active = false;

  if (dom.scannerVideo) {
    dom.scannerVideo.pause();
    dom.scannerVideo.srcObject = null;
  }

  if (updateStatus && dom.scannerStatus) {
    dom.scannerStatus.textContent = "Scanner stopped.";
  }
}

async function handleQrData(rawValue) {
  stopScanner(false);
  dom.scannerStatus.textContent = "QR captured. Parsing booking details...";

  const parsed = parseQrPayload(rawValue);
  if (!parsed) {
    dom.scannerStatus.textContent =
      "The scanned QR payload could not be matched to a booking and payment reference.";
    showToast("Invalid QR payload for payment verification.", "error");
    return;
  }

  dom.manualBookingId.value = parsed.booking_id;
  dom.manualPaymentReference.value = parsed.payment_reference_id;
  dom.scannerStatus.textContent = "QR data extracted. Verifying payment now.";
  await verifyPayment(parsed.booking_id, parsed.payment_reference_id);
}

function parseQrPayload(rawValue) {
  try {
    const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    const bookingId = Number(parsed.booking_id || parsed.id);
    const paymentReference = String(
      parsed.payment_reference_id || parsed.reference || parsed.ref || ""
    ).trim();

    if (!bookingId || !paymentReference) {
      return null;
    }

    return {
      booking_id: bookingId,
      payment_reference_id: paymentReference,
    };
  } catch (error) {
    return null;
  }
}

function renderRefunds(metrics) {
  dom.refundSummary.innerHTML = `
    <div class="summary-card">
      <span>Pending refunds</span>
      <strong>${metrics.pendingRefundCount}</strong>
    </div>
    <div class="summary-card">
      <span>Pending value</span>
      <strong>${formatCurrency(metrics.pendingRefundAmount)}</strong>
    </div>
    <div class="summary-card">
      <span>Processed refunds</span>
      <strong>${metrics.processedRefundCount}</strong>
    </div>
  `;

  if (!state.cancellations.length) {
    dom.cancellationsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state compact">No cancellations found.</div>
        </td>
      </tr>
    `;
  } else {
    dom.cancellationsTableBody.innerHTML = state.cancellations
      .slice(0, 8)
      .map((item) => {
        const tone = badgeToneForStatus(normalizeSimpleStatus(item.status || "pending"));
        return `
          <tr>
            ${tableCell(
              "Booking",
              `
                <strong>#${escapeHtml(item.booking_id || "-")}</strong>
                <span class="muted">${formatDate(item.cancelled_at || item.created_at)}</span>
              `
            )}
            ${tableCell(
              "Customer",
              `
                <strong>${escapeHtml(item.customer_name || "Unknown customer")}</strong>
                <span class="muted">${escapeHtml(item.reason || "No reason provided")}</span>
              `
            )}
            ${tableCell("Car", escapeHtml(`${item.brand || "Unknown"} ${item.model || ""}`.trim()))}
            ${tableCell("Refund", formatCurrency(item.refund_amount || item.amount))}
            ${tableCell("Status", renderStatusBadge(item.status || "pending", tone))}
          </tr>
        `;
      })
      .join("");
  }

  if (!state.refunds.length) {
    dom.refundsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state compact">No refunds have been recorded yet.</div>
        </td>
      </tr>
    `;
  } else {
    dom.refundsTableBody.innerHTML = state.refunds
      .slice(0, 8)
      .map((refund) => {
        const status = normalizeSimpleStatus(refund.status || "pending");
        return `
          <tr>
            ${tableCell(
              "Refund",
              `
                <strong>#${escapeHtml(refund.id || "-")}</strong>
                <span class="muted">Booking #${escapeHtml(refund.booking_id || "-")}</span>
              `
            )}
            ${tableCell(
              "Customer",
              `
                <strong>${escapeHtml(refund.customer_name || "Unknown customer")}</strong>
                <span class="muted">${escapeHtml(refund.email || "No email")}</span>
              `
            )}
            ${tableCell("Amount", formatCurrency(refund.amount))}
            ${tableCell("Status", renderStatusBadge(status, badgeToneForStatus(status)))}
            ${tableCell("Created", formatDate(refund.created_at || refund.processed_at))}
          </tr>
        `;
      })
      .join("");
  }
}

function openCarBookingsModal(car) {
  const rows = state.bookings
    .filter((booking) => Number(booking.car_id) === Number(car.id))
    .sort((left, right) => toDate(right.start_date) - toDate(left.start_date));

  const content = rows.length
    ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Customer</th>
              <th>Dates</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (booking) => `
                  <tr>
                    ${tableCell("Booking", `#${escapeHtml(booking.booking_id || booking.id || "-")}`)}
                    ${tableCell(
                      "Customer",
                      `
                        <strong>${escapeHtml(booking.customer_name || "Unknown customer")}</strong>
                        <span class="muted">${escapeHtml(
                          booking.customer_email || "No email"
                        )}</span>
                      `
                    )}
                    ${tableCell(
                      "Dates",
                      `
                        <strong>${formatDate(booking.start_date)}</strong>
                        <span class="muted">${formatDate(booking.end_date)}</span>
                      `
                    )}
                    ${tableCell("Amount", formatCurrency(booking.amount))}
                    ${tableCell(
                      "Status",
                      renderStatusBadge(
                        booking.status || "pending",
                        badgeToneForStatus(normalizeBookingStatus(booking.status))
                      )
                    )}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : `<div class="empty-state compact">This car has no bookings yet.</div>`;

  showModal(
    `${car.brand || "Unknown"} ${car.model || ""} bookings`,
    content
  );
}

function showModal(title, bodyHtml) {
  dom.modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <p class="panel-label">Fleet Detail</p>
            <h3>${escapeHtml(title)}</h3>
          </div>
          <button class="button button-secondary" type="button" id="closeModalBtn">
            <i class="fas fa-xmark"></i>
            <span>Close</span>
          </button>
        </div>
        ${bodyHtml}
      </div>
    </div>
  `;

  dom.modalRoot.querySelector("#closeModalBtn")?.addEventListener("click", closeModal);
}

function closeModal() {
  dom.modalRoot.innerHTML = "";
}

function tableCell(label, content) {
  return `<td data-label="${escapeAttribute(label)}">${content}</td>`;
}

function setActiveNav(targetId, options = {}) {
  const { persist = true } = options;
  const availableTargets = new Set((dom.moduleViews || []).map((view) => view.id));
  const resolvedTarget = availableTargets.has(targetId) ? targetId : "overviewSection";

  if (resolvedTarget !== "paymentsSection") {
    const wasScannerActive = scannerState.active;
    stopScanner(wasScannerActive);
    if (!wasScannerActive && dom.scannerStatus) {
      dom.scannerStatus.textContent = "Scanner idle.";
    }
  }

  state.activeModule = resolvedTarget;
  if (persist) {
    sessionStorage.setItem("adminActiveModule", resolvedTarget);
  }

  dom.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === resolvedTarget);
  });

  dom.moduleViews.forEach((view) => {
    view.classList.toggle("hidden", view.id !== resolvedTarget);
  });

  updateTopbarForModule(resolvedTarget);
}

function updateTopbarForModule(targetId) {
  const moduleMeta = {
    overviewSection: {
      title: "Rental performance, fleet readiness, and refund control",
      copy: "A single place to review fleet health, payment activity, scheduling gaps, and urgent customer actions.",
    },
    transactionsSection: {
      title: "Recent transaction monitoring",
      copy: "Review payment flow, customer details, trip timing, and transaction status in one focused view.",
    },
    fleetSection: {
      title: "Fleet management workspace",
      copy: "Add cars, search the fleet, inspect bookings per vehicle, and export booking history without other modules competing for space.",
    },
    scheduleSection: {
      title: "Schedule and availability control",
      copy: "Load one car at a time to inspect booked windows, vacancies, and cancellation actions in a dedicated schedule view.",
    },
    paymentsSection: {
      title: "Payment verification desk",
      copy: "Use the scanner or manual reference form to verify bookings without distraction from the rest of the dashboard.",
    },
    refundsSection: {
      title: "Refunds and cancellations queue",
      copy: "Stay focused on recovery actions, recent cancellations, and pending refund processing from a single admin module.",
    },
  };

  const meta = moduleMeta[targetId] || moduleMeta.overviewSection;
  if (dom.topbarTitle) {
    dom.topbarTitle.textContent = meta.title;
  }
  if (dom.topbarCopy) {
    dom.topbarCopy.textContent = meta.copy;
  }
}

function setSyncStatus(message, tone) {
  dom.syncText.textContent = message;
  dom.syncChip.classList.remove("sync-idle", "sync-ok", "sync-error", "sync-loading");
  dom.syncChip.classList.add(
    tone === "ok"
      ? "sync-ok"
      : tone === "error"
      ? "sync-error"
      : tone === "loading"
      ? "sync-loading"
      : "sync-idle"
  );
}

function showToast(message, tone = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  dom.toastRoot.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}

function renderStatusBadge(label, tone = "default") {
  return `<span class="status-badge status-${tone}">${escapeHtml(startCase(label))}</span>`;
}

function badgeToneForStatus(status) {
  const value = normalizeSimpleStatus(status);
  if (value === "completed" || value === "processed" || value === "returned") {
    return "success";
  }
  if (value === "pending" || value === "collected") {
    return "warning";
  }
  if (value === "cancelled" || value === "failed") {
    return "danger";
  }
  if (value === "confirmed" || value === "booked") {
    return "info";
  }
  return "default";
}

function normalizeBookingStatus(status) {
  const value = normalizeSimpleStatus(status);
  if (value.includes("cancelled")) {
    return "cancelled";
  }
  if (value.includes("returned")) {
    return "returned";
  }
  if (value.includes("collected")) {
    return "collected";
  }
  if (value.includes("confirmed") || value.includes("booked")) {
    return "confirmed";
  }
  if (value.includes("pending")) {
    return "pending";
  }
  return "other";
}

function normalizeTransactionStatus(status) {
  const value = normalizeSimpleStatus(status);
  if (value === "paid") {
    return "completed";
  }
  return value;
}

function normalizeSimpleStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isCompletedTransaction(transaction) {
  const status = normalizeTransactionStatus(transaction.payment_status || transaction.status);
  return status === "completed";
}

function resolveImageUrl(imagePath) {
  if (!imagePath) {
    return "https://via.placeholder.com/320x220?text=A6+Cars";
  }
  if (String(imagePath).startsWith("http")) {
    return imagePath;
  }
  return api(imagePath.startsWith("/") ? imagePath : `/${imagePath}`);
}

function buildMonthlyBookingSeries(bookings) {
  const now = new Date();
  const points = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const label = monthDate.toLocaleDateString("en-US", { month: "short" });
    const value = bookings.filter((booking) => {
      const date = toDate(booking.created_at || booking.start_date);
      return (
        date &&
        date.getFullYear() === monthDate.getFullYear() &&
        date.getMonth() === monthDate.getMonth()
      );
    }).length;
    points.push({ label, value });
  }

  return points;
}

function exportRowsAsCsv(filename, rows) {
  if (!rows.length) {
    showToast("There is no data to export yet.", "error");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showToast(`Exported ${filename}.`, "success");
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) {
    return "-";
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes) {
  const size = toNumber(bytes);
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function slugify(value) {
  return String(value || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export";
}

function startCase(value) {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!text) {
    return "Unknown";
  }
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
