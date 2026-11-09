/* ============================================================
 * app.js — 星仓主应用：视图渲染、增量同步、设置、数据管理
 * ============================================================ */
(function (global) {
  'use strict';

  var S = window.Store.state;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (!t || isNaN(t)) return '';
    var d = (Date.now() - t) / 1000;
    if (d < 0) return '刚刚';
    if (d < 3600) return Math.max(1, Math.floor(d / 60)) + ' 分钟前';
    if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
    if (d < 2592000) return Math.floor(d / 86400) + ' 天前';
    if (d < 31536000) return Math.floor(d / 2592000) + ' 个月前';
    return Math.floor(d / 31536000) + ' 年前';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  var UI = {
    category: 'all', search: '', lang: '', sort: 'stars', view: 'stars', layout: 'grid'
  };
  var syncing = false;
  var toolsMounted = false;

  /* ---------------- 反馈组件 ---------------- */
  function toast(type, title, msg, duration) {
    var host = $('toastHost');
    var d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.innerHTML = '<div><b>' + esc(title) + '</b>' + (msg ? '<span>' + esc(msg) + '</span>' : '') + '</div>';
    host.appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity .25s, transform .25s';
      d.style.opacity = '0'; d.style.transform = 'translateX(16px)';
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 260);
    }, duration || 4600);
  }

  function showProgress(title, detail) {
    $('progressTitle').textContent = title;
    $('progressDetail').textContent = detail || '请稍候';
    $('progressLog').textContent = '';
    $('progressBar').style.width = '6%';
    $('progressModal').classList.remove('hidden');
  }
  function updateProgress(pct, log) {
    $('progressBar').style.width = Math.max(3, Math.min(100, pct)) + '%';
    if (log) $('progressLog').textContent = log;
  }
  function hideProgress() { $('progressModal').classList.add('hidden'); }

  function confirmDialog(title, text) {
    return new Promise(function (resolve) {
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmModal').classList.remove('hidden');
      function done(v) {
        $('confirmModal').classList.add('hidden');
        $('confirmOk').onclick = null; $('confirmCancel').onclick = null;
        resolve(v);
      }
      $('confirmOk').onclick = function () { done(true); };
      $('confirmCancel').onclick = function () { done(false); };
    });
  }
  function setStatus(text) { $('statusText').textContent = text; }

  /* ---------------- 主题 ---------------- */
  function applyTheme() {
    var t = S.settings.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    // Android shell: keep the native status bar in sync with the in-app theme.
    if (window.StarVaultAndroid && window.StarVaultAndroid.setStatusBar) {
      window.StarVaultAndroid.setStatusBar(t === 'dark' ? '#0d1117' : '#f5f7fa', t !== 'dark');
    }
    $('themeBtn').innerHTML = t === 'dark'
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  }

  /* ---------------- 视图切换 ---------------- */
  function hasSession() { return !!S.username; }

  function switchView(v) {
    UI.view = v;
    window.Store.setUI('view', v);
    document.querySelectorAll('.main-tabs .tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
    var showStars = v === 'stars' && hasSession();
    $('welcomeView').classList.toggle('hidden', !(v === 'stars' && !hasSession()));
    $('starsView').classList.toggle('hidden', !showStars);
    $('toolsView').classList.toggle('hidden', v !== 'tools');
    if (v === 'tools' && !toolsMounted) { window.Toolbox.mount({ toast: toast }); toolsMounted = true; }
    if (v === 'tools') window.Toolbox.refresh();
  }

  function showApp() {
    $('welcomeView').classList.add('hidden');
    switchView(UI.view === 'tools' ? 'tools' : 'stars');
  }

  /* ---------------- 渲染 ---------------- */
  function renderHeader() {
    var chip = $('userChip');
    chip.classList.toggle('hidden', !S.username);
    if (S.username) {
      $('userName').textContent = S.username;
      var img = $('userAvatar');
      if (S.avatar) { img.src = S.avatar; img.style.display = ''; }
      else { img.style.display = 'none'; }
    }
    $('syncLine').textContent = S.lastSyncAt ? '上次同步：' + fmtDate(S.lastSyncAt) : '尚未同步';
    $('rateInfo').textContent = S.lastRate && S.lastRate.limit
      ? 'API 剩余 ' + S.lastRate.remaining + '/' + S.lastRate.limit
      : '';
    $('aiBadge').classList.toggle('hidden', !(S.settings.aiEnabled && S.settings.aiKey));
    $('syncBtn').disabled = syncing;
  }

  function categoryCount(id) {
    var n = 0;
    S.repos.forEach(function (r) { if ((r.category || 'other') === id) n++; });
    return n;
  }

  function renderStats() {
    $('statTotal').textContent = S.repos.length;
    var cats = {}, langs = {};
    S.repos.forEach(function (r) {
      cats[r.category || 'other'] = 1;
      if (r.language) langs[r.language] = 1;
    });
    $('statCats').textContent = Object.keys(cats).length;
    $('statLangs').textContent = Object.keys(langs).length;
  }

  function renderCategories() {
    var total = S.repos.length;
    var html = '<button class="cat-item' + (UI.category === 'all' ? ' active' : '') + '" data-cat="all">' +
      '<span class="cat-emoji">⭐</span><span class="cat-name">全部收藏</span><span class="cat-count">' + total + '</span></button>';
    window.Categories.list.forEach(function (c) {
      var n = categoryCount(c.id);
      var active = UI.category === c.id;
      html += '<button class="cat-item' + (active ? ' active' : '') + '" data-cat="' + c.id + '">' +
        '<span class="cat-emoji">' + c.emoji + '</span><span class="cat-name">' + esc(c.name) +
        '</span><span class="cat-count">' + n + '</span></button>';
      if (n && total) {
        html += '<div class="cat-bar"><i style="width:' + Math.max(4, n / total * 100) + '%;background:' + c.color + '"></i></div>';
      }
    });
    var un = S.repos.filter(function (r) { return r.unstarred; }).length;
    if (un) {
      html += '<button class="cat-item' + (UI.category === 'unstarred' ? ' active' : '') + '" data-cat="unstarred">' +
        '<span class="cat-emoji">↩️</span><span class="cat-name">已取消收藏</span><span class="cat-count">' + un + '</span></button>';
    }
    $('catList').innerHTML = html;
    $('clearFilter').classList.toggle('hidden', UI.category === 'all' && !UI.search && !UI.lang);
  }

  function renderLangOptions() {
    var langs = {};
    S.repos.forEach(function (r) { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
    var keys = Object.keys(langs).sort(function (a, b) { return langs[b] - langs[a]; });
    var sel = $('langFilter');
    sel.innerHTML = '<option value="">全部语言</option>' + keys.map(function (l) {
      return '<option value="' + esc(l) + '"' + (UI.lang === l ? ' selected' : '') + '>' + esc(l) + ' (' + langs[l] + ')</option>';
    }).join('');
  }

  function getFiltered() {
    var arr = S.repos.slice();
    if (UI.category === 'unstarred') arr = arr.filter(function (r) { return r.unstarred; });
    else if (UI.category !== 'all') arr = arr.filter(function (r) { return (r.category || 'other') === UI.category; });
    if (UI.lang) arr = arr.filter(function (r) { return r.language === UI.lang; });
    var q = UI.search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(function (r) {
        return (String(r.full_name) + ' ' + String(r.description) + ' ' + (r.topics || []).join(' ') + ' ' + String(r.language)).toLowerCase().indexOf(q) >= 0;
      });
    }
    var sort = UI.sort;
    arr.sort(function (a, b) {
      if (sort === 'stars') return (b.stargazers_count || 0) - (a.stargazers_count || 0);
      if (sort === 'name') return String(a.full_name).localeCompare(String(b.full_name));
      if (sort === 'recent') return String(b.pushed_at || '').localeCompare(String(a.pushed_at || ''));
      return String(b.starred_at || b.addedAt || '').localeCompare(String(a.starred_at || a.addedAt || ''));
    });
    return arr;
  }

  function cardHTML(r) {
    var cat = window.Categories.byId(r.category || 'other');
    var tags = [];
    if (r.isNew) tags.push('<span class="new-tag">NEW</span>');
    if (r.unstarred) tags.push('<span class="unstar-tag">已取消收藏</span>');
    if (r.source === 'ai') tags.push('<span class="ai-tag">✦ AI</span>');
    if (r.source === 'manual') tags.push('<span class="ai-tag" style="color:var(--green);background:var(--green-soft)">手动</span>');
    if (r.guessed && r.source === 'rule') tags.push('<span class="unstar-tag" title="关键词信号不足，依据编程语言推断；可在卡片上手动调整，或启用 AI 分类">推断</span>');
    var topics = (r.topics || []).slice(0, 4).map(function (t) {
      return '<span class="topic">' + esc(t) + '</span>';
    }).join('');
    var avatar = r.owner_avatar
      ? '<img class="rc-avatar" src="' + esc(r.owner_avatar) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="rc-avatar"></span>';
    return '<article class="repo-card' + (r.isNew ? ' new-item' : '') + '" data-id="' + esc(r.id) + '">' +
      '<div class="rc-top">' + avatar +
        '<div class="rc-title"><div class="rc-name"><a href="' + esc(r.html_url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(r.full_name) + '">' +
          '<span class="rc-owner">' + esc(r.owner || '') + '/</span><b>' + esc(r.name || r.full_name) + '</b>' +
        '</a></div></div>' +
        '<a class="rc-ext" href="' + esc(r.html_url) + '" target="_blank" rel="noopener noreferrer" title="在 GitHub 打开">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>' +
        '</a>' +
      '</div>' +
      '<p class="rc-desc">' + (r.description ? esc(r.description) : '<span style="color:var(--muted)">暂无描述</span>') + '</p>' +
      ((topics || tags.length) ? '<div class="rc-topics">' + topics + tags.join('') + '</div>' : '') +
      '<div class="rc-bottom">' +
        (r.language ? '<span class="rc-stat"><i class="lang-dot" style="background:' + window.Categories.langColor(r.language) + '"></i>' + esc(r.language) + '</span>' : '') +
        '<span class="rc-stat" title="Star 数"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3 6.3 7 .9-5 4.9 1.2 7L12 18l-6.2 3.1L7 14.1 2 9.2l7-.9z"/></svg>' + fmtNum(r.stargazers_count) + '</span>' +
        (r.pushed_at ? '<span class="rc-stat" title="最近更新 ' + esc(r.pushed_at.slice(0, 10)) + '">◷ ' + timeAgo(r.pushed_at) + '</span>' : '') +
        '<span class="rc-cat"><select class="cat-select" data-id="' + esc(r.id) + '" title="手动调整分类">' +
          window.Categories.optionsHTML(r.category || 'other') + '</select></span>' +
      '</div>' +
    '</article>';
  }

  function renderRepos() {
    var arr = getFiltered();
    var grid = $('repoGrid');
    grid.className = 'repo-grid' + (UI.layout === 'list' ? ' list-view' : '');
    grid.innerHTML = arr.map(cardHTML).join('');
    var title = UI.category === 'all' ? '全部收藏'
      : UI.category === 'unstarred' ? '已取消收藏'
      : window.Categories.byId(UI.category).emoji + ' ' + window.Categories.byId(UI.category).name;
    $('contentTitle').textContent = title;
    var suffix = UI.search || UI.lang ? '（已筛选）' : '';
    $('contentSubtitle').textContent = '共 ' + arr.length + ' 个仓库' + suffix + (S.repos.length ? ' · 总计 ' + S.repos.length : '');

    var empty = $('emptyState');
    if (arr.length) empty.classList.add('hidden');
    else {
      empty.classList.remove('hidden');
      if (!S.repos.length) {
        empty.querySelector('h3').textContent = '还没有收藏记录';
        empty.querySelector('p').textContent = '点击右上角的「更新收藏」开始同步你的 GitHub Star 列表。';
      } else {
        empty.querySelector('h3').textContent = '没有匹配的仓库';
        empty.querySelector('p').textContent = '试试更换关键词或清除筛选条件。';
      }
    }
    setStatus(S.username
      ? '星仓 StarVault · ' + S.username + ' · ' + S.repos.length + ' 个仓库'
      : '星仓 StarVault · 本地运行');
  }

  function renderAll() {
    renderHeader(); renderStats(); renderCategories(); renderLangOptions(); renderRepos(); applyTheme();
  }

  /* ---------------- 同步 / 分类 ---------------- */
  async function doSync(opts) {
    if (syncing) return { ok: false, error: '正在同步中' };
    var username = (opts && opts.username) || S.username;
    var token = (opts && opts.token) || S.settings.githubToken;
    if (!username) { switchView('stars'); return { ok: false, error: '请先填写 GitHub 用户名' }; }
    syncing = true;
    renderHeader();
    showProgress('正在同步 GitHub 收藏…', '正在分页读取 starred 列表');
    try {
      var out = await window.GitHub.fetchStarred(username, token, function (p) {
        updateProgress(Math.min(46, 8 + p.page * 7), '已读取 ' + p.count + ' 个仓库（第 ' + p.page + ' 页）');
      });
      S.lastRate = out.rate;
      var local = {};
      S.repos.forEach(function (r) { local[String(r.id)] = r; r.isNew = false; });
      var remoteIds = {};
      var fresh = [];
      var metaKeys = ['stargazers_count', 'forks_count', 'pushed_at', 'updated_at', 'description',
        'topics', 'language', 'html_url', 'homepage', 'archived', 'starred_at', 'owner_avatar', 'full_name', 'name', 'owner'];
      out.repos.forEach(function (r) {
        remoteIds[String(r.id)] = true;
        var old = local[String(r.id)];
        if (old) {
          metaKeys.forEach(function (k) { old[k] = r[k]; });
          old.unstarred = false; // 重新 star 了
        } else {
          fresh.push(r);
        }
      });
      var removed = 0;
      S.repos.forEach(function (r) { if (!remoteIds[String(r.id)] && !r.unstarred) { r.unstarred = true; removed++; } });
      if (!S.settings.keepUnstarred) {
        S.repos = S.repos.filter(function (r) { return !r.unstarred; });
      }

      var warning = '';
      updateProgress(52, '发现 ' + fresh.length + ' 个新收藏，正在自动分类…');
      if (fresh.length) {
        var res = await window.Classifier.classifyRepos(fresh, S.settings, function (p) {
          updateProgress(52 + 40 * (p.done / Math.max(1, p.total)), 'AI 分类 ' + p.processed + '/' + p.count + ' …');
        });
        warning = res.warning;
        var now = new Date().toISOString();
        fresh.forEach(function (r) {
          var byAI = !!res.aiIds[String(r.id)];
          r.category = res.map[String(r.id)] || 'other';
          r.source = byAI ? 'ai' : 'rule';
          r.guessed = !byAI && !!res.guesses[String(r.id)];
          r.addedAt = now;
          r.isNew = true;
          r.unstarred = false;
          S.repos.push(r);
        });
      }

      // 首次使用：只有拉取并分类成功，才把用户名固化到本地，避免留下「有用户名但零数据」的半状态
      if (opts && opts.first) {
        window.Store.patch({ username: username, avatar: opts.avatar || '' });
        if (token) window.Store.setSetting('githubToken', token);
      }
      if (!S.avatar) {
        var u = await window.GitHub.fetchUser(username, token);
        if (u && u.avatar_url) S.avatar = u.avatar_url;
      }
      S.lastSyncAt = new Date().toISOString();
      window.Store.save();
      updateProgress(100, '同步完成');
      hideProgress();
      syncing = false;
      renderAll();

      var msg = '新增 ' + fresh.length + ' 个仓库' + (removed ? '，' + removed + ' 个已取消收藏被标记' : '') + '，现有 ' + S.repos.length + ' 条记录';
      toast('success', '同步完成', msg, 6000);
      if (warning) toast('warn', 'AI 分类未生效', warning, 9000);
      if (!fresh.length) toast('', '没有新收藏', '分类记录保持不变，手动调整过的分类不会被覆盖。', 5000);
      return { ok: true };
    } catch (e) {
      hideProgress();
      syncing = false;
      renderHeader();
      var msg = e && e.message ? e.message : String(e);
      toast('error', '同步失败', msg, 9000);
      return { ok: false, error: msg };
    }
  }

  async function startWithUser() {
    var username = $('welcomeUser').value.trim().replace(/^@/, '');
    var token = $('welcomeToken').value.trim();
    var errBox = $('welcomeError');
    errBox.classList.add('hidden');
    if (!username) { errBox.textContent = '请输入 GitHub 用户名'; errBox.classList.remove('hidden'); return; }
    $('welcomeStart').disabled = true;
    showProgress('正在校验 GitHub 用户…', username);
    try {
      var user = await window.GitHub.validateUser(username, token);
      var result = await doSync({
        username: username, token: token,
        avatar: (user && user.avatar_url) || '', first: true
      });
      if (!result.ok) {
        errBox.textContent = result.error;
        errBox.classList.remove('hidden');
        if (/Token|60 次|上限|限额|速率/.test(result.error)) {
          var adv = document.querySelector('.advanced-toggle');
          if (adv) adv.open = true;
          $('welcomeToken').focus();
        }
        return;
      }
      showApp();
      renderAll();
    } catch (e) {
      errBox.textContent = e && e.message ? e.message : String(e);
      errBox.classList.remove('hidden');
    } finally {
      hideProgress();
      $('welcomeStart').disabled = false;
    }
  }

  /* ---------------- 设置 ---------------- */
  var PRESETS = {
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    moonshot: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    zhipu: { base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' }
  };

  function fillSettings() {
    $('setUsername').value = S.username || '';
    $('setToken').value = S.settings.githubToken || '';
    $('setAiEnabled').checked = !!S.settings.aiEnabled;
    $('setAiKey').value = S.settings.aiKey || '';
    $('setAiBase').value = S.settings.aiBase || '';
    $('setAiModel').value = S.settings.aiModel || '';
    $('setKeepUnstarred').checked = S.settings.keepUnstarred !== false;
    $('aiTestResult').textContent = '';
    $('aiTestResult').className = 'test-result';
    syncAiFields();
  }
  function syncAiFields() {
    $('aiFields').classList.toggle('disabled', !$('setAiEnabled').checked);
  }
  function openSettings() { fillSettings(); $('settingsModal').classList.remove('hidden'); }
  function closeSettings() { $('settingsModal').classList.add('hidden'); }

  function readSettingsFromForm() {
    var newName = $('setUsername').value.trim().replace(/^@/, '') || S.username;
    window.Store.patch({ username: newName, avatar: newName === S.username ? S.avatar : '' });
    var st = S.settings;
    st.githubToken = $('setToken').value.trim();
    st.aiEnabled = $('setAiEnabled').checked;
    st.aiKey = $('setAiKey').value.trim();
    st.aiBase = $('setAiBase').value.trim() || 'https://api.openai.com/v1';
    st.aiModel = $('setAiModel').value.trim() || 'gpt-4o-mini';
    st.keepUnstarred = $('setKeepUnstarred').checked;
    window.Store.save();
  }

  function download(filename, content, mime) {
    // Android WebView cannot download blob: URLs; hand the text to the native
    // bridge, which writes it into the public Downloads/StarVault folder.
    if (window.StarVaultAndroid && window.StarVaultAndroid.saveFile) {
      window.StarVaultAndroid.saveFile(filename, content);
      return;
    }
    var blob = new Blob([content], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportMarkdown() {
    var groups = {};
    S.repos.forEach(function (r) {
      var id = r.category || 'other';
      (groups[id] = groups[id] || []).push(r);
    });
    var lines = ['# ' + S.username + ' 的 GitHub Star 收藏', '',
      '> 由 星仓 StarVault 生成 · ' + fmtDate(new Date().toISOString()) + ' · 共 ' + S.repos.length + ' 个仓库', ''];
    window.Categories.list.forEach(function (c) {
      var arr = (groups[c.id] || []).sort(function (a, b) { return b.stargazers_count - a.stargazers_count; });
      if (!arr.length) return;
      lines.push('## ' + c.emoji + ' ' + c.name + ' (' + arr.length + ')', '');
      arr.forEach(function (r) {
        lines.push('- [' + r.full_name + '](' + r.html_url + ') ★ ' + fmtNum(r.stargazers_count) +
          (r.language ? ' · `' + r.language + '`' : '') +
          (r.description ? ' — ' + String(r.description).replace(/\n/g, ' ').slice(0, 140) : ''));
      });
      lines.push('');
    });
    download('starvault-' + S.username + '.md', lines.join('\n'), 'text/markdown;charset=utf-8');
    toast('success', '导出成功', '已生成 Markdown 清单');
  }

  async function reclassifyAll() {
    if (!S.settings.aiEnabled || !S.settings.aiKey) {
      toast('warn', '尚未启用 AI 分类', '请先在设置中填写 API 密钥并启用 AI 分类'); return;
    }
    if (!S.repos.length) { toast('warn', '没有可分类的仓库', ''); return; }
    var manual = S.repos.filter(function (r) { return r.source === 'manual'; }).length;
    var ok = await confirmDialog('用 AI 重新分类全部？',
      '将对 ' + (S.repos.length - manual) + ' 个仓库重新归类' + (manual ? '，' + manual + ' 个手动调整过的分类会保留' : '') + '。这会消耗 API 额度。');
    if (!ok) return;
    var targets = S.repos.filter(function (r) { return r.source !== 'manual'; });
    showProgress('AI 正在重新分类…', '共 ' + targets.length + ' 个仓库');
    try {
      var res = await window.Classifier.classifyRepos(targets, S.settings, function (p) {
        updateProgress(10 + 88 * (p.processed / Math.max(1, p.count)), p.processed + '/' + p.count);
      });
      if (res.source !== 'ai') throw new Error(res.warning || 'AI 未返回结果');
      targets.forEach(function (r) {
        r.category = res.map[String(r.id)] || r.category;
        r.source = res.aiIds[String(r.id)] ? 'ai' : 'rule';
        r.guessed = false;
      });
      window.Store.save();
      hideProgress(); renderAll(); closeSettings();
      toast('success', '重新分类完成', '已更新 ' + targets.length + ' 个仓库的分类');
    } catch (e) {
      hideProgress();
      toast('error', 'AI 重新分类失败', e && e.message ? e.message : String(e), 9000);
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    document.querySelectorAll('.main-tabs .tab').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
    });
    $('brandHome').addEventListener('click', function () { switchView('stars'); });
    $('brandHome').addEventListener('keydown', function (e) { if (e.key === 'Enter') switchView('stars'); });
    $('syncBtn').addEventListener('click', function () { doSync(); });
    $('themeBtn').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      window.Store.setSetting('theme', next); applyTheme();
    });
    $('userChip').addEventListener('click', function () { openSettings(); setTimeout(function () { $('setUsername').focus(); $('setUsername').select(); }, 60); });
    $('settingsBtn').addEventListener('click', openSettings);

    $('welcomeStart').addEventListener('click', startWithUser);
    $('welcomeUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') startWithUser(); });
    $('welcomeToken').addEventListener('keydown', function (e) { if (e.key === 'Enter') startWithUser(); });

    $('searchInput').addEventListener('input', function (e) { UI.search = e.target.value; renderRepos(); });
    $('langFilter').addEventListener('change', function (e) { UI.lang = e.target.value; renderCategories(); renderRepos(); });
    $('sortSelect').addEventListener('change', function (e) { UI.sort = e.target.value; window.Store.setUI('sort', UI.sort); renderRepos(); });
    document.querySelectorAll('.view-switch button').forEach(function (b) {
      b.addEventListener('click', function () {
        UI.layout = b.getAttribute('data-layout');
        window.Store.setUI('layout', UI.layout);
        document.querySelectorAll('.view-switch button').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderRepos();
      });
    });
    $('catList').addEventListener('click', function (e) {
      var btn = e.target.closest('.cat-item');
      if (!btn) return;
      UI.category = btn.getAttribute('data-cat');
      window.Store.setUI('category', UI.category);
      renderCategories(); renderRepos();
    });
    $('clearFilter').addEventListener('click', function () {
      UI.category = 'all'; UI.search = ''; UI.lang = '';
      $('searchInput').value = ''; $('langFilter').value = '';
      renderCategories(); renderRepos();
    });
    $('repoGrid').addEventListener('change', function (e) {
      if (!e.target.classList.contains('cat-select')) return;
      var id = e.target.getAttribute('data-id');
      var repo = window.Store.findRepo(id);
      if (!repo) return;
      repo.category = e.target.value;
      repo.source = 'manual';
      repo.guessed = false;
      window.Store.save();
      renderCategories(); renderRepos();
      toast('success', '分类已更新', repo.full_name + ' → ' + window.Categories.byId(repo.category).name + '（后续更新会保留此修改）', 3800);
    });

    /* 设置 */
    $('closeSettings').addEventListener('click', closeSettings);
    $('cancelSettings').addEventListener('click', closeSettings);
    $('settingsModal').addEventListener('click', function (e) { if (e.target === $('settingsModal')) closeSettings(); });
    $('saveSettings').addEventListener('click', function () {
      var oldName = S.username;
      readSettingsFromForm();
      closeSettings(); renderAll();
      toast('success', '设置已保存', S.username !== oldName ? '用户名已更改为 ' + S.username + '，点击「更新收藏」拉取该账号数据' : '配置已写入本地存储');
    });
    $('setAiEnabled').addEventListener('change', syncAiFields);
    $('toggleKey').addEventListener('click', function () {
      var i = $('setAiKey'); i.type = i.type === 'password' ? 'text' : 'password';
    });
    document.querySelectorAll('.preset-row .chip-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[b.getAttribute('data-preset')];
        if (p) { $('setAiBase').value = p.base; $('setAiModel').value = p.model; toast('', '已填充 ' + b.textContent, '仍需要填入对应的 API 密钥'); }
      });
    });
    $('testAiBtn').addEventListener('click', async function () {
      var box = $('aiTestResult');
      box.className = 'test-result'; box.textContent = '正在测试…';
      $('testAiBtn').disabled = true;
      try {
        var answer = await window.Classifier.testConnection({
          aiKey: $('setAiKey').value.trim(), aiBase: $('setAiBase').value.trim(), aiModel: $('setAiModel').value.trim()
        });
        box.className = 'test-result ok'; box.textContent = '✓ 连接成功：' + String(answer).slice(0, 40);
      } catch (e) {
        box.className = 'test-result err'; box.textContent = '✗ ' + (e.message || e);
      } finally { $('testAiBtn').disabled = false; }
    });
    $('reclassifyBtn').addEventListener('click', async function () { readSettingsFromForm(); await reclassifyAll(); });
    $('exportBtn').addEventListener('click', function () {
      download('starvault-' + (S.username || 'backup') + '.json', JSON.stringify(window.Store.exportData(), null, 2));
      toast('success', '导出成功', '备份文件已下载');
    });
    $('exportMdBtn').addEventListener('click', exportMarkdown);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          window.Store.importData(JSON.parse(reader.result));
          S = window.Store.state;
          UI.search = ''; UI.category = 'all'; UI.lang = '';
          $('searchInput').value = '';
          closeSettings(); applyTheme(); renderAll();
          toast('success', '导入成功', '已恢复 ' + S.repos.length + ' 条收藏记录');
        } catch (err) { toast('error', '导入失败', err.message || '文件不是有效的备份 JSON'); }
      };
      reader.readAsText(f);
      e.target.value = '';
    });
    $('cleanUnstarredBtn').addEventListener('click', async function () {
      var n = S.repos.filter(function (r) { return r.unstarred; }).length;
      if (!n) { toast('', '无需清理', '没有被标记为「已取消收藏」的仓库'); return; }
      var ok = await confirmDialog('清理已取消收藏？', '将永久移除 ' + n + ' 条历史记录（不影响 GitHub 上的实际数据）。');
      if (!ok) return;
      S.repos = S.repos.filter(function (r) { return !r.unstarred; });
      window.Store.save(); closeSettings(); renderAll();
      toast('success', '已清理', '移除 ' + n + ' 条记录');
    });
    $('resetBtn').addEventListener('click', async function () {
      var ok = await confirmDialog('清空全部本地数据？', '用户名、Token、API 密钥、全部分类记录都将被删除，且无法恢复。建议先导出备份。');
      if (!ok) return;
      window.Store.reset();
      S = window.Store.state;
      UI.category = 'all'; UI.search = ''; UI.lang = ''; UI.view = 'stars';
      $('searchInput').value = '';
      closeSettings(); applyTheme(); switchView('stars'); renderAll();
      toast('success', '已清空', '可以重新填写 GitHub 用户名');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('confirmModal').classList.contains('hidden')) { $('confirmCancel').click(); return; }
      if (!$('settingsModal').classList.contains('hidden')) closeSettings();
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    UI.sort = S.ui.sort || 'stars';
    UI.layout = S.ui.layout || 'grid';
    UI.category = S.ui.category || 'all';
    UI.view = S.ui.view === 'tools' ? 'tools' : 'stars';
    $('sortSelect').value = UI.sort;
    document.querySelectorAll('.view-switch button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-layout') === UI.layout);
    });
    applyTheme();
    bindEvents();
    if (hasSession()) { showApp(); renderAll(); }
    else { switchView(UI.view); renderAll(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
