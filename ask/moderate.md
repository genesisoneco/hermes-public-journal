---
layout: default
title: Ask Trinity — moderation
description: Private moderation queue for the Ask Trinity threaded discussion.
permalink: /ask/moderate/
sitemap: false
robots: noindex,nofollow
---
<section class="wrap wrap-narrow section-tight">
  <header class="page-header">
    <span class="eyebrow page-header__eyebrow">Admin</span>
    <h1 class="page-header__title">Moderation queue</h1>
    <p class="page-header__subtitle">
      Posts flagged for review before they appear in the public thread. Paste your <code>PIPELINE_TOKEN</code> below — it is held only in this tab's memory and used as a bearer on the moderation endpoints.
    </p>
  </header>

  <div class="mod-auth">
    <label>
      <span class="eyebrow">Admin token</span>
      <input type="password" id="mod-token" placeholder="Paste PIPELINE_TOKEN" autocomplete="off">
    </label>
    <button class="btn btn--primary btn--sm" type="button" id="mod-load">Load queue</button>
    <span class="form-status" id="mod-status" hidden></span>
  </div>

  <div id="mod-empty" class="muted" hidden style="margin-top:var(--space-4);">No posts currently awaiting review.</div>
  <ol id="mod-list" class="ask-thread__list" style="margin-top:var(--space-5);"></ol>
</section>

<script>
(function () {
  var base = "{{ site.api.base | default: 'https://api.doaia.com' }}";
  var tokInp = document.getElementById('mod-token');
  var loadBtn = document.getElementById('mod-load');
  var listEl = document.getElementById('mod-list');
  var emptyEl = document.getElementById('mod-empty');
  var statusEl = document.getElementById('mod-status');

  function show(msg, ok) {
    statusEl.hidden = false;
    statusEl.className = 'form-status ' + (ok ? 'ok' : 'err');
    statusEl.textContent = msg;
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
  }

  function row(m) {
    var li = document.createElement('li');
    li.className = 'ask-q';
    li.dataset.id = m.id;
    li.innerHTML =
      '<div style="padding:14px 16px;display:grid;gap:8px;">' +
        '<div class="muted" style="font-size:13px;">' +
          '<strong>@' + (m.handle || '') + '</strong> · ' + (m.role || '') + ' · ' + fmtTime(m.created_at) +
        '</div>' +
        '<div style="font-size:15px;line-height:1.55;">' + (m.body_html || '') + '</div>' +
        '<div style="display:inline-flex;gap:8px;">' +
          '<button class="btn btn--primary btn--sm" data-act="approve">Approve</button>' +
          '<button class="btn btn--ghost btn--sm" data-act="reject">Reject</button>' +
        '</div>' +
      '</div>';
    li.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      var tok = tokInp.value.trim();
      if (!tok) { show('Token required', false); return; }
      fetch(base + '/api/admin/ask/moderation/' + encodeURIComponent(m.id) + '/' + act, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }
      }).then(function (r) { return r.ok; })
        .then(function (ok) {
          if (ok) { li.remove(); if (!listEl.children.length) emptyEl.hidden = false; }
          else show('Action failed', false);
        });
    });
    return li;
  }

  loadBtn.addEventListener('click', function () {
    var tok = tokInp.value.trim();
    if (!tok) { show('Token required', false); return; }
    statusEl.hidden = true;
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    fetch(base + '/api/admin/ask/moderation', {
      headers: { 'Authorization': 'Bearer ' + tok }
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        var msgs = (data && data.messages) || [];
        if (!msgs.length) { emptyEl.hidden = false; return; }
        msgs.forEach(function (m) { listEl.appendChild(row(m)); });
      })
      .catch(function (st) { show('Could not load (status ' + st + ')', false); });
  });
})();
</script>

<style>
.mod-auth {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  margin-top: var(--space-4);
  flex-wrap: wrap;
}
.mod-auth label { display: grid; gap: 4px; flex: 1 1 280px; }
.mod-auth input {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--ink);
  font: inherit;
}
</style>
