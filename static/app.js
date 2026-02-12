const API = "";
const PLAN_PREVIEW_LEN = 300;
const PRIORITY_STORAGE_KEY = "issues-priority";
let issuesState = "open";
let issues = [];
let sessions = [];

function getIssuePriorityOrder() {
  try {
    const key = `${PRIORITY_STORAGE_KEY}-${issuesState}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter((n) => !isNaN(n)) : [];
  } catch {
    return [];
  }
}

function moveIssueToTop(issueNumber) {
  const order = getIssuePriorityOrder();
  const next = [issueNumber, ...order.filter((n) => n !== issueNumber)];
  localStorage.setItem(`${PRIORITY_STORAGE_KEY}-${issuesState}`, JSON.stringify(next));
  renderIssues();
}

function removeIssueFromTop(issueNumber) {
  const order = getIssuePriorityOrder().filter((n) => n !== issueNumber);
  localStorage.setItem(`${PRIORITY_STORAGE_KEY}-${issuesState}`, JSON.stringify(order));
  renderIssues();
}

function sortIssuesByPriority(issuesList) {
  const priority = getIssuePriorityOrder();
  if (!priority.length) return [...issuesList];
  const byNumber = new Map(issuesList.map((i) => [i.number, i]));
  const ordered = [];
  for (const num of priority) {
    if (byNumber.has(num)) {
      ordered.push(byNumber.get(num));
      byNumber.delete(num);
    }
  }
  const rest = Array.from(byNumber.values()).sort((a, b) => b.number - a.number);
  return ordered.concat(rest);
}

const $ = (id) => document.getElementById(id);
const qs = (sel, el = document) => el.querySelector(sel);
const qsAll = (sel, el = document) => el.querySelectorAll(sel);

function show(el, show = true) {
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function renderPlanBlock(plan) {
  if (!plan) return "";
  const needsExpand = plan.length > PLAN_PREVIEW_LEN;
  const preview = truncate(plan, PLAN_PREVIEW_LEN);
  const previewEscaped = escapeHtml(preview);
  const fullEscaped = escapeHtml(plan);
  return `
    <div class="session-plan-block" data-expanded="false">
      <div class="plan-header">
        <span class="plan-label">Plan</span>
        ${needsExpand ? '<button type="button" class="btn btn-ghost plan-expand-btn" aria-label="Expand plan">Expand</button>' : ""}
      </div>
      <div class="session-plan-content">
        <div class="session-plan-preview">${previewEscaped}</div>
        ${needsExpand ? `<div class="session-plan-full hidden">${fullEscaped}</div>` : ""}
      </div>
    </div>
  `;
}

function bindPlanExpandButtons(container) {
  if (!container) return;
  container.querySelectorAll(".plan-expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.closest(".session-plan-block");
      const previewEl = block?.querySelector(".session-plan-preview");
      const fullEl = block?.querySelector(".session-plan-full");
      const isExpanded = block?.getAttribute("data-expanded") === "true";
      if (!block || !previewEl || !fullEl) return;
      if (isExpanded) {
        block.setAttribute("data-expanded", "false");
        fullEl.classList.add("hidden");
        previewEl.classList.remove("hidden");
        btn.textContent = "Expand";
        btn.setAttribute("aria-label", "Expand plan");
      } else {
        block.setAttribute("data-expanded", "true");
        previewEl.classList.add("hidden");
        fullEl.classList.remove("hidden");
        btn.textContent = "Collapse";
        btn.setAttribute("aria-label", "Collapse plan");
      }
    });
  });
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function switchTab(tab) {
  qsAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  qsAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `${tab}-panel`));
  if (tab === "issues") loadIssues();
  if (tab === "sessions") loadSessions();
  if (tab === "implementations") loadImplementations();
}

async function loadIssues() {
  const listEl = $("issues-list");
  const loadingEl = $("issues-loading");
  const errorEl = $("issues-error");

  show(listEl, false);
  show(errorEl, false);
  show(loadingEl, true);

  try {
    issues = await api(`/issues?state=${issuesState}`);
    renderIssues();
    show(loadingEl, false);
    show(listEl, true);
  } catch (e) {
    show(loadingEl, false);
    errorEl.textContent = e.message || "Failed to load issues";
    show(errorEl, true);
  }
}

function renderIssues() {
  const listEl = $("issues-list");
  if (!issues.length) {
    listEl.innerHTML = '<p class="loading">No issues found.</p>';
    return;
  }

  const priorityOrder = getIssuePriorityOrder();
  const sorted = sortIssuesByPriority(issues);

  listEl.innerHTML = sorted
    .map((issue) => {
      const isPrioritized = priorityOrder.includes(issue.number);
      return `
    <div class="issue-card ${isPrioritized ? "issue-card--prioritized" : ""}" data-number="${issue.number}">
      <div class="issue-main">
        <div class="issue-header-row">
          <span class="issue-number-badge">Issue #${issue.number}</span>
          ${isPrioritized ? '<span class="issue-priority-badge" title="Pinned to top">Top</span>' : ""}
        </div>
        <h3 class="issue-title">${escapeHtml(issue.title)}</h3>
        <div class="issue-meta">
          <a href="${escapeHtml(issue.html_url)}" target="_blank" rel="noopener">View on GitHub</a>
          · ${formatDate(issue.created_at)}
        </div>
        ${issue.labels?.length ? `<div class="issue-labels">${issue.labels.map((l) => `<span class="label">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="issue-actions">
        ${isPrioritized
          ? `<button type="button" class="btn btn-ghost priority-btn" data-number="${issue.number}" data-action="remove" title="Remove from top">Remove from top</button>`
          : `<button type="button" class="btn btn-ghost priority-btn" data-number="${issue.number}" data-action="top" title="Move to top">Move to top</button>`
        }
        <button type="button" class="btn btn-primary scope-btn" data-number="${issue.number}">Scope issue</button>
      </div>
    </div>
  `;
    })
    .join("");

  listEl.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => scopeIssue(Number(btn.dataset.number)));
  });
  listEl.querySelectorAll(".priority-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const num = Number(btn.dataset.number);
      if (btn.dataset.action === "top") moveIssueToTop(num);
      else removeIssueFromTop(num);
    });
  });
}

async function scopeIssue(issueNumber) {
  const btn = qs(`.scope-btn[data-number="${issueNumber}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Creating…";
  }
  try {
    await api("/sessions/scope", {
      method: "POST",
      body: JSON.stringify({ issue_number: issueNumber }),
    });
    if (btn) {
      btn.textContent = "Scoped";
      btn.disabled = true;
    }
    loadSessions();
    switchTab("sessions");
  } catch (e) {
    alert(e.message || "Failed to create scope session");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Scope issue";
    }
  }
}

async function loadSessions() {
  const listEl = $("sessions-list");
  const loadingEl = $("sessions-loading");
  const errorEl = $("sessions-error");

  show(listEl, false);
  show(errorEl, false);
  show(loadingEl, true);

  try {
    sessions = await api("/sessions");
    renderSessions();
    show(loadingEl, false);
    show(listEl, true);
  } catch (e) {
    show(loadingEl, false);
    errorEl.textContent = e.message || "Failed to load sessions";
    show(errorEl, true);
  }
}

function renderSessions() {
  const listEl = $("sessions-list");
  if (!sessions.length) {
    listEl.innerHTML = '<p class="loading">No sessions yet. Scope an issue from the Issues tab.</p>';
    return;
  }

  listEl.innerHTML = sessions
    .map(
      (s) => {
        const hasOutput = !!(s.plan && s.plan.trim()) || !!(s.confidence && s.confidence.trim()) || !!(s.pr_url && s.pr_url.trim());
        const outputLabel = s.session_type === "scope" ? "Devin scope output" : "Devin output";
        const outputContent = hasOutput
          ? `
            ${s.confidence ? `<div class="devin-output-confidence"><span class="devin-output-label">Confidence:</span> ${escapeHtml(s.confidence)}</div>` : ""}
            ${s.plan && s.plan.trim() ? renderPlanBlock(s.plan) : ""}
            ${s.pr_url ? `<a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="devin-output-pr">View PR</a>` : ""}
          `
          : '<p class="devin-output-empty">No output yet. Use <strong>Refresh</strong> to fetch from Devin.</p>';
        return `
    <div class="session-card" data-session-id="${s.id}">
      <div class="session-row">
        <div class="session-info">
          <h3 class="session-title">#${s.issue_number} ${escapeHtml(s.issue_title)}</h3>
          <div class="session-meta">ID ${s.id} · ${formatDate(s.created_at)}</div>
          <div class="session-badges">
            <span class="badge badge-type">${escapeHtml(s.session_type)}</span>
            <span class="badge badge-status ${(s.status || "").toLowerCase()}">${escapeHtml(s.status)}</span>
            ${s.confidence ? `<span class="badge badge-confidence">${escapeHtml(s.confidence)}</span>` : ""}
            ${s.pr_url ? `<a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="badge" style="color: var(--accent);">PR</a>` : ""}
          </div>
          <div class="devin-output-block">
            <div class="devin-output-header">${outputLabel}</div>
            <div class="devin-output-body">${outputContent}</div>
          </div>
        </div>
        <div class="session-actions">
          ${s.devin_session_url ? `<a href="${escapeHtml(s.devin_session_url)}" target="_blank" rel="noopener" class="btn btn-ghost">Open Devin</a>` : ""}
          <button type="button" class="btn btn-secondary refresh-session-btn" data-id="${s.id}">Refresh</button>
          ${s.session_type === "scope" ? `<button type="button" class="btn btn-primary implement-btn" data-scope-id="${s.id}">Implement</button>` : ""}
        </div>
      </div>
    </div>
  `;
      }
    )
    .join("");

  bindPlanExpandButtons(listEl);
  listEl.querySelectorAll(".refresh-session-btn").forEach((btn) => {
    btn.addEventListener("click", () => refreshSession(Number(btn.dataset.id)));
  });
  listEl.querySelectorAll(".implement-btn").forEach((btn) => {
    btn.addEventListener("click", () => openImplementPlanModal(Number(btn.dataset.scopeId)));
  });
}

async function refreshSession(sessionId) {
  const btn = qs(`.refresh-session-btn[data-id="${sessionId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Refreshing…";
  }
  try {
    await api(`/sessions/${sessionId}/refresh`, { method: "POST" });
    await loadSessions();
  } catch (e) {
    alert(e.message || "Failed to refresh session");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Refresh";
  }
}

function openImplementPlanModal(scopeSessionId) {
  const scopeSession = sessions.find((s) => s.id === scopeSessionId);
  if (!scopeSession) return;
  const modal = $("implement-plan-modal");
  const titleEl = $("implement-plan-modal-title");
  const subtitleEl = $("implement-plan-modal-subtitle");
  const planEl = $("implement-plan-modal-plan");
  const noPlan = $("implement-plan-modal-no-plan");
  if (!modal || !titleEl || !subtitleEl || !planEl) return;
  titleEl.textContent = `Implementation plan for Issue #${scopeSession.issue_number}`;
  subtitleEl.textContent = scopeSession.issue_title;
  const confidenceEl = $("implement-plan-modal-confidence");
  if (confidenceEl) {
    if (scopeSession.confidence && scopeSession.confidence.trim()) {
      confidenceEl.textContent = `Confidence: ${scopeSession.confidence}`;
      confidenceEl.classList.remove("hidden");
    } else {
      confidenceEl.classList.add("hidden");
    }
  }
  if (scopeSession.plan && scopeSession.plan.trim()) {
    planEl.textContent = scopeSession.plan;
    planEl.classList.remove("hidden");
    if (noPlan) noPlan.classList.add("hidden");
  } else {
    planEl.classList.add("hidden");
    if (noPlan) noPlan.classList.remove("hidden");
  }
  modal.setAttribute("data-scope-session-id", String(scopeSessionId));
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeImplementPlanModal() {
  const modal = $("implement-plan-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function bindImplementPlanModal() {
  const modal = $("implement-plan-modal");
  const cancelBtn = $("implement-plan-cancel");
  const confirmBtn = $("implement-plan-confirm");
  const closeBtn = modal?.querySelector(".modal-close");
  const backdrop = modal?.querySelector(".modal-backdrop");
  if (!modal) return;
  function close() {
    closeImplementPlanModal();
  }
  cancelBtn?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  confirmBtn?.addEventListener("click", () => {
    const scopeSessionId = Number(modal.getAttribute("data-scope-session-id"));
    if (!scopeSessionId) return;
    closeImplementPlanModal();
    implementSession(scopeSessionId);
  });
}

async function implementSession(scopeSessionId) {
  const btn = qs(`.implement-btn[data-scope-id="${scopeSessionId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Creating…";
  }
  try {
    await api("/sessions/implement", {
      method: "POST",
      body: JSON.stringify({ scope_session_id: scopeSessionId }),
    });
    await loadSessions();
    await loadImplementations();
    switchTab("implementations");
  } catch (e) {
    alert(e.message || "Failed to create implement session");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Implement";
  }
}

function getImplementations() {
  return sessions.filter((s) => s.session_type === "implement");
}

async function loadImplementations() {
  const listEl = $("implementations-list");
  const loadingEl = $("implementations-loading");
  const errorEl = $("implementations-error");

  show(listEl, false);
  show(errorEl, false);
  show(loadingEl, true);

  try {
    sessions = await api("/sessions");
    const implementations = getImplementations();
    renderImplementations(implementations);
    show(loadingEl, false);
    show(listEl, true);
  } catch (e) {
    show(loadingEl, false);
    errorEl.textContent = e.message || "Failed to load implementations";
    show(errorEl, true);
  }
}

function renderImplementations(implementations) {
  const listEl = $("implementations-list");
  if (!implementations || !implementations.length) {
    listEl.innerHTML =
      '<p class="loading">No implementations yet. Use "Implement" on a scope session in the Sessions tab to create one.</p>';
    return;
  }

  listEl.innerHTML = implementations
    .map((s) => {
      const hasOutput = !!(s.plan && s.plan.trim()) || !!(s.pr_url && s.pr_url.trim());
      const outputContent = hasOutput
        ? `
            ${s.plan && s.plan.trim() ? renderPlanBlock(s.plan) : ""}
            ${s.pr_url ? `<a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="devin-output-pr">View PR</a>` : ""}
          `
        : '<p class="devin-output-empty">No output yet. Use <strong>Refresh</strong> to fetch from Devin.</p>';
      return `
    <div class="session-card implementation-card" data-session-id="${s.id}">
      <div class="session-row">
        <div class="session-info">
          <h3 class="session-title">#${s.issue_number} ${escapeHtml(s.issue_title)}</h3>
          <div class="session-meta">ID ${s.id} · ${formatDate(s.created_at)}</div>
          <div class="session-badges">
            <span class="badge badge-status ${(s.status || "").toLowerCase()}">${escapeHtml(s.status)}</span>
            ${s.pr_url ? `<a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="badge badge-pr">View PR</a>` : ""}
          </div>
          <div class="devin-output-block">
            <div class="devin-output-header">Devin output</div>
            <div class="devin-output-body">${outputContent}</div>
          </div>
        </div>
        <div class="session-actions">
          ${s.devin_session_url ? `<a href="${escapeHtml(s.devin_session_url)}" target="_blank" rel="noopener" class="btn btn-ghost">Open Devin</a>` : ""}
          <button type="button" class="btn btn-secondary refresh-session-btn" data-id="${s.id}">Refresh</button>
        </div>
      </div>
    </div>
  `;
    })
    .join("");

  bindPlanExpandButtons(listEl);
  listEl.querySelectorAll(".refresh-session-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      refreshSession(Number(btn.dataset.id)).then(() =>
        renderImplementations(getImplementations())
      );
    });
  });
}

function formatDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { dateStyle: "short" }) + " " + d.toLocaleTimeString(undefined, { timeStyle: "short" });
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || "";
  return str.slice(0, max) + "…";
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  bindImplementPlanModal();
  qsAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("refresh-issues").addEventListener("click", loadIssues);
  $("refresh-sessions").addEventListener("click", loadSessions);
  $("refresh-implementations").addEventListener("click", loadImplementations);

  qsAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      issuesState = btn.dataset.state;
      loadIssues();
    });
  });

  loadIssues();
});
