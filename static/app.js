const API = "";
const PLAN_PREVIEW_LEN = 300;
let issuesState = "open";
let currentStep = 1;
let issues = [];
let sessions = [];

function getPinnedIssues() {
  try { return JSON.parse(localStorage.getItem("pinnedIssues") || "[]"); } catch { return []; }
}
function setPinnedIssues(arr) {
  localStorage.setItem("pinnedIssues", JSON.stringify(arr));
}
function togglePin(issueNumber) {
  const pinned = getPinnedIssues();
  const idx = pinned.indexOf(issueNumber);
  if (idx >= 0) pinned.splice(idx, 1); else pinned.push(issueNumber);
  setPinnedIssues(pinned);
  renderIssues();
}

const $ = (id) => document.getElementById(id);
const qs = (sel, el = document) => el.querySelector(sel);
const qsAll = (sel, el = document) => el.querySelectorAll(sel);

function show(el, v = true) {
  if (!el) return;
  el.classList.toggle("hidden", !v);
}

function goToStep(step) {
  currentStep = step;
  qsAll(".workflow-step").forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle("active", n === step);
    s.classList.toggle("done", n < step);
  });
  qsAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.step === String(step)));
  if (step === 1) loadIssues();
  if (step === 2) loadSessions();
  if (step === 3) loadImplementations();
}

function renderMarkdown(text) {
  if (!text) return "";
  if (typeof marked !== "undefined" && marked.parse) {
    return marked.parse(text);
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderPlanBlock(plan) {
  if (!plan) return "";
  const needsExpand = plan.length > PLAN_PREVIEW_LEN;
  const previewHtml = renderMarkdown(truncate(plan, PLAN_PREVIEW_LEN));
  const fullHtml = renderMarkdown(plan);
  return `
    <div class="session-plan-block" data-expanded="false">
      <div class="plan-header">
        <span class="plan-label">Plan</span>
        ${needsExpand ? '<button type="button" class="btn btn-ghost plan-expand-btn" aria-label="Expand plan">Expand</button>' : ""}
      </div>
      <div class="session-plan-content markdown-body">
        <div class="session-plan-preview">${previewHtml}</div>
        ${needsExpand ? `<div class="session-plan-full hidden">${fullHtml}</div>` : ""}
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
      } else {
        block.setAttribute("data-expanded", "true");
        previewEl.classList.add("hidden");
        fullEl.classList.remove("hidden");
        btn.textContent = "Collapse";
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

function getIssueStatus(issueNumber) {
  const issueSessions = sessions.filter((s) => s.issue_number === issueNumber);
  const impl = issueSessions.find((s) => s.session_type === "implement");
  if (impl) {
    if (impl.pr_url && impl.pr_url.trim()) return { label: "PR Opened", cls: "issue-status--pr" };
    return { label: "Implementing", cls: "issue-status--implementing" };
  }
  const scope = issueSessions.find((s) => s.session_type === "scope");
  if (scope) return { label: "Scoped", cls: "issue-status--scoped" };
  return null;
}

async function loadIssues() {
  const listEl = $("issues-list");
  const loadingEl = $("issues-loading");
  const errorEl = $("issues-error");

  show(listEl, false);
  show(errorEl, false);
  show(loadingEl, true);

  try {
    const [issuesData, sessionsData] = await Promise.all([
      api(`/issues?state=${issuesState}`),
      api("/sessions").catch(() => []),
    ]);
    issues = issuesData;
    sessions = sessionsData;
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
    listEl.innerHTML = '<p class="empty-state-text">No issues found for this state.</p>';
    return;
  }

  const pinned = getPinnedIssues();
  const sorted = [...issues].sort((a, b) => {
    const ap = pinned.includes(a.number) ? 0 : 1;
    const bp = pinned.includes(b.number) ? 0 : 1;
    return ap - bp;
  });

  listEl.innerHTML = sorted
    .map((issue) => {
      const isPinned = pinned.includes(issue.number);
      return `
    <div class="issue-card ${isPinned ? "issue-card--pinned" : ""}" data-number="${issue.number}">
      <div class="issue-main">
        <div class="issue-header-row">
          <button type="button" class="pin-btn ${isPinned ? "pinned" : ""}" data-number="${issue.number}" title="${isPinned ? "Unpin" : "Pin as priority"}">${isPinned ? "&#9733;" : "&#9734;"}</button>
          <span class="issue-number-badge">#${issue.number}</span>
          ${isPinned ? '<span class="pinned-label">Priority</span>' : ""}
        </div>
        <h3 class="issue-title"><span class="issue-title-text">${escapeHtml(issue.title)}</span></h3>
        <div class="issue-meta">
          <a href="${escapeHtml(issue.html_url)}" target="_blank" rel="noopener">View on GitHub</a>
          · ${formatDate(issue.created_at)}
        </div>
        ${issue.labels?.length ? `<div class="issue-labels">${issue.labels.map((l) => `<span class="label">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
        ${(() => { const st = getIssueStatus(issue.number); return st ? `<div class="issue-status ${st.cls}">${st.label}</div>` : ""; })()}
      </div>
      <div class="issue-actions">
        <button type="button" class="btn btn-primary scope-btn" data-number="${issue.number}">Scope with Devin</button>
      </div>
    </div>
  `;
    })
    .join("");

  listEl.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => scopeIssue(Number(btn.dataset.number)));
  });
  listEl.querySelectorAll(".pin-btn").forEach((btn) => {
    btn.addEventListener("click", () => togglePin(Number(btn.dataset.number)));
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
    goToStep(2);
  } catch (e) {
    alert(e.message || "Failed to create scope session");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Scope with Devin";
    }
  }
}

async function loadSessions() {
  const listEl = $("sessions-list");
  const loadingEl = $("sessions-loading");
  const errorEl = $("sessions-error");
  const emptyEl = $("sessions-empty");

  show(listEl, false);
  show(errorEl, false);
  show(emptyEl, false);
  show(loadingEl, true);

  try {
    sessions = await api("/sessions");
    const scopeSessions = sessions.filter((s) => s.session_type === "scope");
    show(loadingEl, false);
    if (!scopeSessions.length) {
      show(emptyEl, true);
    } else {
      renderSessions(scopeSessions);
      show(listEl, true);
    }
  } catch (e) {
    show(loadingEl, false);
    errorEl.textContent = e.message || "Failed to load sessions";
    show(errorEl, true);
  }
}

function renderSessions(scopeSessions) {
  const listEl = $("sessions-list");

  listEl.innerHTML = scopeSessions
    .map((s) => {
      const isRunning = s.status === "running" || s.status === "creating" || s.status === "working";
      const isCompleted = s.status === "finished" || s.status === "completed" || s.status === "done" || s.status === "blocked";
      const hasPlan = !!(s.plan && s.plan.trim());
      const hasConfidence = !!(s.confidence && s.confidence.trim());

      let statusHint = "";
      if (isRunning) statusHint = '<span class="status-hint">Devin is analyzing… click Refresh to check</span>';
      else if (hasPlan) statusHint = '<span class="status-hint status-hint-ready">Plan ready — click Implement to proceed</span>';
      else if (isCompleted && !hasPlan) statusHint = '<span class="status-hint">Devin finished but plan not extracted yet. Click Refresh to try again.</span>';

      const outputContent = hasPlan
        ? renderPlanBlock(s.plan)
        : '<p class="devin-output-empty">No output yet. Click <strong>Refresh</strong> to fetch the plan from Devin.</p>';

      return `
    <div class="session-card ${isCompleted && hasPlan ? "session-card--ready" : ""}" data-session-id="${s.id}">
      <div class="session-row">
        <div class="session-info">
          <h3 class="session-title"><span class="session-title-number">#${s.issue_number}</span> <span class="session-title-text">${escapeHtml(s.issue_title)}</span></h3>
          <div class="session-meta">Session ${s.id} · ${formatDate(s.created_at)}</div>
          <div class="session-badges">
            <span class="badge badge-type">scope</span>
            <span class="badge badge-status ${(s.status || "").toLowerCase()}">${escapeHtml(s.status)}</span>
          </div>
          ${hasConfidence ? `<div class="confidence-display"><span class="confidence-label">Confidence:</span> <span class="confidence-value confidence-${escapeHtml(s.confidence).toLowerCase()}">${escapeHtml(s.confidence)}</span></div>` : ""}
          ${statusHint}
          <div class="devin-output-block">
            <div class="devin-output-header">Devin Analysis</div>
            <div class="devin-output-body">${outputContent}</div>
          </div>
        </div>
        <div class="session-actions">
          ${s.devin_session_url ? `<a href="${escapeHtml(s.devin_session_url)}" target="_blank" rel="noopener" class="btn btn-ghost">Open Devin</a>` : ""}
          <button type="button" class="btn btn-secondary refresh-session-btn" data-id="${s.id}">Refresh</button>
          ${hasPlan ? `<button type="button" class="btn btn-primary implement-btn" data-scope-id="${s.id}">Implement</button>` : ""}
        </div>
      </div>
    </div>
  `;
    })
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
    planEl.innerHTML = renderMarkdown(scopeSession.plan);
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
    goToStep(3);
  } catch (e) {
    alert(e.message || "Failed to create implement session");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Implement";
    }
  }
}

async function loadImplementations() {
  const listEl = $("implementations-list");
  const loadingEl = $("implementations-loading");
  const errorEl = $("implementations-error");
  const emptyEl = $("implementations-empty");

  show(listEl, false);
  show(errorEl, false);
  show(emptyEl, false);
  show(loadingEl, true);

  try {
    sessions = await api("/sessions");
    const implementations = sessions.filter((s) => s.session_type === "implement");
    show(loadingEl, false);
    if (!implementations.length) {
      show(emptyEl, true);
    } else {
      renderImplementations(implementations);
      show(listEl, true);
    }
  } catch (e) {
    show(loadingEl, false);
    errorEl.textContent = e.message || "Failed to load implementations";
    show(errorEl, true);
  }
}

function renderImplementations(implementations) {
  const listEl = $("implementations-list");

  listEl.innerHTML = implementations
    .map((s) => {
      const isRunning = s.status === "running" || s.status === "creating" || s.status === "working";
      const isCompleted = s.status === "finished" || s.status === "completed" || s.status === "done" || s.status === "blocked";
      const hasPR = !!(s.pr_url && s.pr_url.trim());

      let statusHint = "";
      if (isRunning) statusHint = '<span class="status-hint">Devin is implementing… click Refresh to check</span>';
      else if (hasPR) statusHint = '<span class="status-hint status-hint-ready">PR is ready!</span>';
      else if (isCompleted && !hasPR) statusHint = '<span class="status-hint">Devin finished. Click Refresh to check for a PR link.</span>';

      const issueUrl = s.issue_number ? `https://github.com/${encodeURIComponent(document.querySelector('.logo')?.dataset?.repo || '')}/issues/${s.issue_number}` : '';

      return `
    <div class="session-card ${hasPR ? "session-card--has-pr" : ""}" data-session-id="${s.id}">
      <div class="session-row">
        <div class="session-info">
          <h3 class="session-title"><span class="session-title-number">#${s.issue_number}</span> <span class="session-title-text">${escapeHtml(s.issue_title)}</span></h3>
          <div class="session-meta">Session ${s.id} · ${formatDate(s.created_at)}</div>
          <div class="session-badges">
            <span class="badge badge-type">implement</span>
            <span class="badge badge-status ${(s.status || "").toLowerCase()}">${escapeHtml(s.status)}</span>
            ${hasPR ? `<a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="badge badge-pr">View PR</a>` : ""}
          </div>
          ${statusHint}
          ${hasPR ? `<div class="pr-link-block"><a href="${escapeHtml(s.pr_url)}" target="_blank" rel="noopener" class="btn btn-primary">Open Pull Request</a></div>` : ""}
          ${isCompleted && !hasPR ? `<div class="pr-link-block"><span class="status-hint">No PR detected yet. Click Refresh or check Devin session.</span></div>` : ""}
        </div>
        <div class="session-actions">
          ${s.devin_session_url ? `<a href="${escapeHtml(s.devin_session_url)}" target="_blank" rel="noopener" class="btn btn-ghost">Open Devin</a>` : ""}
          <button type="button" class="btn btn-secondary refresh-session-btn" data-id="${s.id}">Refresh</button>
          <button type="button" class="btn btn-ghost" onclick="goToStep(1)">Back to Issues</button>
        </div>
      </div>
    </div>
  `;
    })
    .join("");

  listEl.querySelectorAll(".refresh-session-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      refreshSession(Number(btn.dataset.id)).then(() => loadImplementations());
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

  qsAll(".workflow-step").forEach((s) => {
    s.addEventListener("click", () => goToStep(Number(s.dataset.step)));
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

  qsAll(".go-step1-btn").forEach((b) => b.addEventListener("click", () => goToStep(1)));
  qsAll(".go-step2-btn").forEach((b) => b.addEventListener("click", () => goToStep(2)));

  goToStep(1);
});
