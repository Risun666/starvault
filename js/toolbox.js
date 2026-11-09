/* ============================================================
 * toolbox.js — 网络工具箱（14 个常用工具，全部纯前端）
 * 在线查询类工具使用支持 CORS 的公开服务，均带失败降级提示。
 * ============================================================ */
(function (global) {
  'use strict';

  var toastFn = function () {};
  var currentId = null;
  var cleanup = null;
  var navEl, bodyHost, searchEl, workspaceEl;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function copyText(text) {
    if (!text) { toastFn('warn', '没有可复制的内容', ''); return; }
    function legacy() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toastFn('success', '已复制到剪贴板', ''); }
      catch (e) { toastFn('error', '复制失败', '请手动选中内容复制'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toastFn('success', '已复制到剪贴板', '');
      }).catch(legacy);
    } else legacy();
  }

  /** 输出区统一操作 */
  function setOut(body, text, cls) {
    var o = $('.js-out', body);
    if (!o) return;
    o.className = 'tool-out js-out' + (cls ? ' ' + cls : '');
    o.textContent = text == null ? '' : String(text);
    o.dataset.raw = text == null ? '' : String(text);
  }
  function bindCopy(body) {
    $$('.js-copy', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = $('.js-out', body);
        copyText(o ? (o.dataset.raw || o.textContent) : '');
      });
    });
  }
  function errMsg(e) { return e && e.message ? e.message : String(e); }

  function card(title, inner, num) {
    return '<div class="tool-card"><h4>' + (num ? '<span class="num">' + num + '</span>' : '') + esc(title) + '</h4>' + inner + '</div>';
  }
  function outBlock() { return '<div class="tool-out js-out"></div>'; }
  function copyBtn() { return '<button class="btn btn-ghost js-copy">复制结果</button>'; }

  /* ============================================================
   * 工具定义
   * ============================================================ */
  var TOOLS = [
    /* ---------- 1. IP 信息 ---------- */
    {
      id: 'ip', group: '网络查询', icon: '🌍', name: 'IP 地址 / 归属地',
      desc: '查询本机公网 IP 与地理、运营商信息，也可查询指定 IPv4 / IPv6 地址。',
      render: function (body) {
        body.innerHTML = card('查询',
          '<div class="tool-row"><input class="js-ip" type="text" placeholder="留空查询本机公网 IP，或输入指定 IP，如 8.8.8.8">' +
          '<button class="btn btn-primary js-go">查询</button></div>' +
          '<div class="tool-actions">' + copyBtn() + '<span class="tool-note">数据来源：ipwho.is / ipapi.co（公开接口，支持跨域）</span></div>' +
          outBlock() + '<div class="kv-grid js-kv"></div>', 1);
        var api = 'https://ipwho.is/';
        async function query() {
          var ip = $('.js-ip', body).value.trim();
          var o = $('.js-out', body), kv = $('.js-kv', body);
          o.className = 'tool-out js-out'; o.textContent = '查询中…'; kv.innerHTML = '';
          var sources = ip
            ? ['https://ipwho.is/' + encodeURIComponent(ip), 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/']
            : ['https://ipwho.is/', 'https://ipapi.co/json/', 'https://api.ipify.org?format=json'];
          var data = null, lastErr = null;
          for (var i = 0; i < sources.length; i++) {
            try {
              var res = await fetch(sources[i]);
              if (!res.ok) throw new Error('HTTP ' + res.status);
              var d = await res.json();
              if (d && (d.ip || d.success === false)) { data = d; break; }
            } catch (e) { lastErr = e; }
          }
          if (!data) { setOut(body, '查询失败：' + errMsg(lastErr || '所有数据源均不可用') + '\n请检查网络或稍后重试。', 'error'); return; }
          if (data.success === false) { setOut(body, '查询失败：' + (data.message || '无效的 IP 地址'), 'error'); return; }
          var conn = data.connection || {};
          var tz = data.timezone || {};
          var rows = [
            ['IP 地址', data.ip], ['类型', data.type || (String(data.ip || '').indexOf(':') >= 0 ? 'IPv6' : 'IPv4')],
            ['国家 / 地区', (data.country || data.country_name || '—') + (data.country_code ? ' (' + data.country_code + ')' : '')],
            ['省份 / 州', data.region || data.region_code || '—'], ['城市', data.city || '—'],
            ['运营商 / 组织', conn.isp || conn.org || data.org || '—'],
            ['ASN', conn.asn ? 'AS' + conn.asn : '—'],
            ['经纬度', (data.latitude != null && data.longitude != null) ? data.latitude + ', ' + data.longitude : '—'],
            ['时区', tz.id || data.timezone || '—'], ['邮政编码', data.postal || data.postal_code || '—']
          ];
          kv.innerHTML = rows.map(function (r) {
            return '<div class="kv"><small>' + esc(r[0]) + '</small><b>' + esc(r[1] || '—') + '</b></div>';
          }).join('');
          setOut(body, '✓ 查询成功 · ' + (data.ip || '') + '\n数据源：' + (data.ip ? '公开 IP 地理库' : '—'), 'ok');
        }
        $('.js-go', body).addEventListener('click', query);
        $('.js-ip', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') query(); });
        bindCopy(body);
      }
    },

    /* ---------- 2. DNS 解析 ---------- */
    {
      id: 'dns', group: '网络查询', icon: '🔎', name: 'DNS 解析查询',
      desc: '通过 DNS-over-HTTPS 查询 A / AAAA / MX / TXT / CNAME / NS 等记录，无需本地命令行。',
      render: function (body) {
        body.innerHTML = card('查询条件',
          '<div class="tool-row">' +
            '<input class="js-domain" type="text" placeholder="输入域名，例如 github.com" value="github.com">' +
            '<select class="js-type" style="max-width:130px;flex:none"><option>A</option><option>AAAA</option><option>MX</option><option>TXT</option><option>CNAME</option><option>NS</option><option>SOA</option><option>CAA</option><option>PTR</option></select>' +
            '<button class="btn btn-primary js-go">解析</button>' +
          '</div>' +
          '<div class="tool-actions">' + copyBtn() + '<span class="tool-note">数据源：Google DNS / Cloudflare DNS（DoH JSON API）</span></div>' +
          outBlock() + '<div class="js-table"></div>', 1);
        async function query() {
          var domain = $('.js-domain', body).value.trim().replace(/^https?:\/\//, '').split('/')[0];
          var type = $('.js-type', body).value;
          if (!domain) { setOut(body, '请输入域名', 'error'); return; }
          setOut(body, '正在解析 ' + domain + ' 的 ' + type + ' 记录…');
          $('.js-table', body).innerHTML = '';
          var urls = [
            'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=' + type,
            'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=' + type
          ];
          var data = null, lastErr = null;
          for (var i = 0; i < urls.length; i++) {
            try {
              var res = await fetch(urls[i], { headers: i === 1 ? { 'Accept': 'application/dns-json' } : {} });
              if (!res.ok) throw new Error('HTTP ' + res.status);
              var d = await res.json();
              if (d && (d.Answer || d.Authority || d.Status === 0)) { data = d; break; }
            } catch (e) { lastErr = e; }
          }
          if (!data) { setOut(body, '解析失败：' + errMsg(lastErr || 'DNS 服务不可用') + '\n若网络受限，请检查代理设置。', 'error'); return; }
          var ans = data.Answer || [];
          var auth = data.Authority || [];
          var rows = ans.concat(auth).map(function (a) {
            return '<tr><td>' + esc(a.name) + '</td><td><code>' + esc(a.type ? (typeof a.type === 'number' ? typeName(a.type) : a.type) : type) + '</code></td><td>' + esc(a.TTL || a.ttl || '—') + '</td><td>' + esc(a.data || a.Data || '') + '</td></tr>';
          }).join('');
          var plain = ans.length
            ? ans.map(function (a) { return a.name + '\t' + a.TTL + '\tIN\t' + (typeof a.type === 'number' ? typeName(a.type) : a.type) + '\t' + (a.data || ''); }).join('\n')
            : '（没有查到该类型的记录）';
          setOut(body, 'Status: ' + (data.Status === 0 ? 'NOERROR' : data.Status) + ' · 共 ' + ans.length + ' 条应答\n\n' + plain, ans.length ? 'ok' : '');
          $('.js-table', body).innerHTML = rows
            ? '<table class="data-table"><thead><tr><th>名称</th><th>类型</th><th>TTL</th><th>记录值</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<p class="tool-note">无应答记录（可能被 DNS 服务商拦截或域名不存在）。</p>';
        }
        function typeName(n) {
          return ({ 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 15: 'MX', 16: 'TXT', 28: 'AAAA', 257: 'CAA', 12: 'PTR' })[n] || n;
        }
        $('.js-go', body).addEventListener('click', query);
        $('.js-domain', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') query(); });
        bindCopy(body);
      }
    },

    /* ---------- 3. URL 编解码 ---------- */
    {
      id: 'urlenc', group: '编码转换', icon: '🔗', name: 'URL 编码 / 解码',
      desc: '对 URL 或参数做 percent-encoding，支持中文，编码与解码可来回切换。',
      render: function (body) {
        body.innerHTML = card('输入内容',
          '<textarea class="js-input" rows="5" placeholder="粘贴需要编码 / 解码的文本，例如：https://example.com/?q=星仓 收藏"></textarea>' +
          '<div class="tool-actions">' +
            '<button class="btn btn-primary js-enc">编码</button>' +
            '<button class="btn js-dec">解码</button>' +
            '<button class="btn btn-ghost js-clear">清空</button>' + copyBtn() +
          '</div>' + outBlock(), 1);
        var input = $('.js-input', body);
        $('.js-enc', body).addEventListener('click', function () {
          try { setOut(body, encodeURIComponent(input.value)); } catch (e) { setOut(body, errMsg(e), 'error'); }
        });
        $('.js-dec', body).addEventListener('click', function () {
          try { setOut(body, decodeURIComponent(input.value.replace(/\+/g, ' '))); }
          catch (e) { setOut(body, '解码失败：内容不是合法的 URL 编码（' + errMsg(e) + '）', 'error'); }
        });
        $('.js-clear', body).addEventListener('click', function () { input.value = ''; setOut(body, ''); input.focus(); });
        bindCopy(body);
      }
    },

    /* ---------- 4. Base64 ---------- */
    {
      id: 'base64', group: '编码转换', icon: '🔤', name: 'Base64 编码 / 解码',
      desc: 'UTF-8 安全的 Base64 转换，中文不会乱码；支持文本与图片 Data URL 预览。',
      render: function (body) {
        body.innerHTML = card('输入内容',
          '<textarea class="js-input" rows="5" placeholder="输入要编码的文本，或粘贴 Base64 字符串进行解码"></textarea>' +
          '<div class="tool-actions">' +
            '<button class="btn btn-primary js-enc">编码</button>' +
            '<button class="btn js-dec">解码</button>' +
            '<button class="btn btn-ghost js-clear">清空</button>' + copyBtn() +
          '</div>' + outBlock() + '<div class="js-preview" style="margin-top:12px"></div>', 1);
        var input = $('.js-input', body);
        function encode(str) {
          var bytes = new TextEncoder().encode(str), bin = '';
          for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin);
        }
        function decode(str) {
          var bin = atob(str.replace(/\s/g, ''));
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new TextDecoder().decode(arr);
        }
        $('.js-enc', body).addEventListener('click', function () {
          try { setOut(body, encode(input.value)); $('.js-preview', body).innerHTML = ''; }
          catch (e) { setOut(body, errMsg(e), 'error'); }
        });
        $('.js-dec', body).addEventListener('click', function () {
          try {
            var raw = input.value.trim();
            var text = decode(raw);
            var p = $('.js-preview', body);
            var src = null;
            if (/^data:image\//i.test(raw)) src = raw;
            else if (/^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(raw)) src = 'data:image/png;base64,' + raw;
            else if (/^data:image\//i.test(text)) src = text;
            if (src) {
              p.innerHTML = '<img src="' + esc(src) + '" style="max-width:260px;border:1px solid var(--border);border-radius:8px" alt="图片预览">';
              setOut(body, '✓ 检测到图片数据，已在下方生成预览\nBase64 长度：' + raw.length + ' 字符', 'ok');
            } else {
              p.innerHTML = '';
              setOut(body, text);
            }
          } catch (e) { setOut(body, '解码失败：不是合法的 Base64 字符串（' + errMsg(e) + '）', 'error'); }
        });
        $('.js-clear', body).addEventListener('click', function () { input.value = ''; setOut(body, ''); $('.js-preview', body).innerHTML = ''; input.focus(); });
        bindCopy(body);
      }
    },

    /* ---------- 5. 时间戳 ---------- */
    {
      id: 'timestamp', group: '编码转换', icon: '🕐', name: 'Unix 时间戳转换',
      desc: '时间戳与日期互转，自动识别秒 / 毫秒，实时显示当前时间戳。',
      render: function (body) {
        body.innerHTML = card('当前时间',
          '<div class="kv-grid js-now"></div>', 1) +
          card('时间戳 → 日期',
            '<div class="tool-row"><input class="js-ts" type="text" placeholder="输入 Unix 时间戳，如 1735689600 或 1735689600000"><button class="btn btn-primary js-to-date">转换</button></div>' + outBlock(), 2) +
          card('日期 → 时间戳',
            '<div class="tool-row"><input class="js-date" type="text" placeholder="如 2026-01-01 00:00:00 或 2026-01-01T00:00:00Z"><button class="btn btn-primary js-to-ts">转换</button></div><div class="tool-out js-out2"></div>', 3);
        function nowHTML() {
          var n = Date.now();
          return [
            ['Unix 秒', Math.floor(n / 1000)], ['Unix 毫秒', n],
            ['本地时间', new Date(n).toLocaleString('zh-CN', { hour12: false })],
            ['UTC 时间', new Date(n).toUTCString()], ['ISO 8601', new Date(n).toISOString()]
          ].map(function (r) { return '<div class="kv"><small>' + r[0] + '</small><b>' + esc(r[1]) + '</b></div>'; }).join('');
        }
        var nowBox = $('.js-now', body);
        nowBox.innerHTML = nowHTML();
        var timer = setInterval(function () { if (document.body.contains(nowBox)) nowBox.innerHTML = nowHTML(); }, 1000);
        $('.js-to-date', body).addEventListener('click', function () {
          var raw = $('.js-ts', body).value.trim();
          if (!/^\d+$/.test(raw)) { setOut(body, '请输入纯数字时间戳', 'error'); return; }
          var n = Number(raw);
          if (raw.length <= 10) n *= 1000;
          var d = new Date(n);
          if (isNaN(d.getTime())) { setOut(body, '时间戳超出有效范围', 'error'); return; }
          var diffDays = Math.round(Math.abs(Date.now() - d.getTime()) / 86400000);
          setOut(body, '识别单位：' + (raw.length <= 10 ? '秒（s）' : '毫秒（ms）') + '\n' +
            '本地时间：' + d.toLocaleString('zh-CN', { hour12: false }) + '\n' +
            'UTC 时间：' + d.toUTCString() + '\n' +
            'ISO 8601：' + d.toISOString() + '\n' +
            '相对现在：' + (d.getTime() > Date.now() ? '未来 ' : '过去 ') + diffDays + ' 天', 'ok');
        });
        $('.js-to-ts', body).addEventListener('click', function () {
          var raw = $('.js-date', body).value.trim();
          var d = new Date(raw.replace(/-/g, '/').replace('T', ' ').replace('Z', ''));
          var o2 = $('.js-out2', body);
          if (!raw || isNaN(d.getTime())) { o2.className = 'tool-out js-out2 error'; o2.textContent = '无法解析日期，可使用：2026-01-01 00:00:00'; return; }
          o2.className = 'tool-out js-out2 ok';
          o2.textContent = 'Unix 秒：' + Math.floor(d.getTime() / 1000) + '\nUnix 毫秒：' + d.getTime() + '\nISO 8601：' + d.toISOString();
        });
        return function () { clearInterval(timer); };
      }
    },

    /* ---------- 6. JSON ---------- */
    {
      id: 'json', group: '编码转换', icon: '🧹', name: 'JSON 格式化 / 校验',
      desc: '美化、压缩、校验 JSON，显示字符数、行数与顶层键数量，错误信息带出错位置提示。',
      render: function (body) {
        body.innerHTML = card('输入 JSON',
          '<textarea class="js-input" rows="9" placeholder=\'粘贴 JSON，例如 {"name":"StarVault","items":[1,2,3]}\'></textarea>' +
          '<div class="tool-actions">' +
            '<button class="btn btn-primary js-pretty">格式化</button>' +
            '<button class="btn js-minify">压缩</button>' +
            '<button class="btn js-check">仅校验</button>' +
            '<button class="btn btn-ghost js-clear">清空</button>' + copyBtn() +
          '</div>' + outBlock(), 1);
        var input = $('.js-input', body);
        function parse() { return JSON.parse(input.value); }
        function stats(obj, text) {
          var keys = (obj && typeof obj === 'object') ? Object.keys(obj).length : 0;
          return '\n\n— 字符数 ' + text.length + ' · 行数 ' + text.split('\n').length + ' · 顶层键 ' + keys;
        }
        $('.js-pretty', body).addEventListener('click', function () {
          try { var o = parse(); var s = JSON.stringify(o, null, 2); setOut(body, s + stats(o, s), 'ok'); }
          catch (e) { setOut(body, '✗ JSON 无效：' + errMsg(e), 'error'); }
        });
        $('.js-minify', body).addEventListener('click', function () {
          try { var o = parse(); var s = JSON.stringify(o); setOut(body, s + stats(o, s), 'ok'); }
          catch (e) { setOut(body, '✗ JSON 无效：' + errMsg(e), 'error'); }
        });
        $('.js-check', body).addEventListener('click', function () {
          try { var o = parse(); setOut(body, '✓ JSON 合法 · 顶层类型：' + (Array.isArray(o) ? 'Array' : typeof o), 'ok'); }
          catch (e) { setOut(body, '✗ JSON 无效：' + errMsg(e), 'error'); }
        });
        $('.js-clear', body).addEventListener('click', function () { input.value = ''; setOut(body, ''); input.focus(); });
        bindCopy(body);
      }
    },

    /* ---------- 7. UUID / 密码 ---------- */
    {
      id: 'uuid', group: '生成与计算', icon: '🆔', name: 'UUID / 随机密码',
      desc: '基于浏览器加密级随机数生成 UUID v4 与高强度密码，不会上传到任何服务器。',
      render: function (body) {
        body.innerHTML = card('UUID v4',
          '<div class="tool-row"><select class="js-count" style="max-width:110px;flex:none"><option value="1">1 个</option><option value="5">5 个</option><option value="10">10 个</option><option value="20">20 个</option></select>' +
          '<button class="btn btn-primary js-gen">生成 UUID</button>' +
          '<button class="btn btn-ghost js-copy" data-target="1">复制结果</button></div>' + outBlock(), 1) +
          card('随机密码',
            '<div class="tool-row">' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:12px">长度 <input class="js-len" type="number" value="20" min="4" max="128" style="width:82px;height:32px"></label>' +
              '<label style="font-size:12px"><input type="checkbox" class="js-upper" checked> A-Z</label>' +
              '<label style="font-size:12px"><input type="checkbox" class="js-lower" checked> a-z</label>' +
              '<label style="font-size:12px"><input type="checkbox" class="js-digit" checked> 0-9</label>' +
              '<label style="font-size:12px"><input type="checkbox" class="js-symbol" checked> !@#…</label>' +
            '</div><div class="tool-actions"><button class="btn btn-primary js-pwd">生成密码</button>' +
            '<button class="btn btn-ghost js-copy" data-target="2">复制密码</button></div>' +
            '<div class="tool-out js-out2"></div>', 2);
        function uuid() {
          if (crypto.randomUUID) return crypto.randomUUID();
          var b = new Uint8Array(16); crypto.getRandomValues(b);
          b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
          var h = Array.from(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
          return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
        }
        function randChar(pool) {
          var max = 256 - (256 % pool.length), v;
          var a = new Uint8Array(1);
          do { crypto.getRandomValues(a); v = a[0]; } while (v >= max);
          return pool[v % pool.length];
        }
        $('.js-gen', body).addEventListener('click', function () {
          var n = Number($('.js-count', body).value), list = [];
          for (var i = 0; i < n; i++) list.push(uuid());
          setOut(body, list.join('\n'), 'ok');
        });
        $('.js-pwd', body).addEventListener('click', function () {
          var len = Math.max(4, Math.min(128, Number($('.js-len', body).value) || 20));
          var pool = '';
          if ($('.js-upper', body).checked) pool += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
          if ($('.js-lower', body).checked) pool += 'abcdefghijkmnopqrstuvwxyz';
          if ($('.js-digit', body).checked) pool += '23456789';
          if ($('.js-symbol', body).checked) pool += '!@#$%^&*()-_=+[]{};:,.?';
          var o2 = $('.js-out2', body);
          if (!pool) { o2.className = 'tool-out js-out2 error'; o2.textContent = '请至少选择一种字符类型'; return; }
          var s = '';
          for (var i = 0; i < len; i++) s += randChar(pool);
          var bits = len * Math.log2(pool.length);
          var level = bits >= 100 ? '极强' : bits >= 70 ? '强' : bits >= 45 ? '中等' : '偏弱';
          o2.className = 'tool-out js-out2 ok';
          o2.textContent = s + '\n\n长度 ' + len + ' · 熵约 ' + Math.round(bits) + ' bit · 强度：' + level;
          o2.dataset.raw = s;
        });
        $$('.js-copy', body).forEach(function (b) {
          b.addEventListener('click', function () {
            var t = b.getAttribute('data-target') === '2' ? $('.js-out2', body) : $('.js-out', body);
            copyText(t.dataset.raw || t.textContent);
          });
        });
      }
    },

    /* ---------- 8. 哈希 ---------- */
    {
      id: 'hash', group: '生成与计算', icon: '🔐', name: '文本 / 文件哈希',
      desc: '使用 Web Crypto 计算 SHA-1 / SHA-256 / SHA-384 / SHA-512，支持文本文件，数据不会离开本机。',
      render: function (body) {
        body.innerHTML = card('输入',
          '<textarea class="js-input" rows="5" placeholder="输入要计算哈希的文本"></textarea>' +
          '<div class="tool-row" style="margin-top:10px"><input class="js-file" type="file"><span class="tool-note">也可选择一个文件（文本或任意二进制）</span></div>' +
          '<div class="tool-actions"><button class="btn btn-primary js-go">计算哈希</button>' + copyBtn() + '</div>' + outBlock(), 1);
        function hex(buf) {
          return Array.from(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        }
        async function digestAll(data) {
          var names = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
          var lines = [];
          for (var i = 0; i < names.length; i++) {
            var buf = await crypto.subtle.digest(names[i], data);
            lines.push(names[i].padEnd(8, ' ') + '  ' + hex(buf));
          }
          return lines.join('\n');
        }
        $('.js-go', body).addEventListener('click', async function () {
          var f = $('.js-file', body).files && $('.js-file', body).files[0];
          var text = $('.js-input', body).value;
          if (!f && !text) { setOut(body, '请输入文本或选择文件', 'error'); return; }
          setOut(body, '计算中…');
          try {
            var data = f ? await f.arrayBuffer() : new TextEncoder().encode(text);
            var result = await digestAll(data);
            setOut(body, (f ? '文件：' + f.name + '（' + f.size + ' 字节）' : '文本长度：' + text.length + ' 字符') + '\n\n' + result, 'ok');
          } catch (e) { setOut(body, '计算失败：' + errMsg(e), 'error'); }
        });
        bindCopy(body);
      }
    },

    /* ---------- 9. CIDR ---------- */
    {
      id: 'cidr', group: '生成与计算', icon: '🧮', name: 'IPv4 子网计算器',
      desc: '输入 CIDR 或 IP/掩码，计算网络地址、广播地址、可用主机范围、通配符掩码等。',
      render: function (body) {
        body.innerHTML = card('输入 CIDR',
          '<div class="tool-row"><input class="js-cidr" type="text" placeholder="例如 192.168.1.10/24" value="192.168.1.10/24">' +
          '<button class="btn btn-primary js-go">计算</button></div>' + outBlock() + '<div class="kv-grid js-kv"></div>', 1);
        function ip2int(ip) {
          var p = ip.trim().split('.');
          if (p.length !== 4) throw new Error('IPv4 地址格式不正确');
          var n = 0;
          p.forEach(function (x) {
            if (!/^\d{1,3}$/.test(x) || Number(x) > 255) throw new Error('IPv4 每段必须是 0-255 的数字');
            n = (n * 256 + Number(x)) >>> 0;
          });
          return n >>> 0;
        }
        function int2ip(n) {
          return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
        }
        function go() {
          try {
            var raw = $('.js-cidr', body).value.trim();
            var parts = raw.split('/');
            if (parts.length !== 2) throw new Error('请使用 地址/前缀长度 的格式，如 10.0.0.1/24');
            var ip = ip2int(parts[0]);
            var prefix = Number(parts[1]);
            if (!/^\d+$/.test(parts[1]) || prefix < 0 || prefix > 32) throw new Error('前缀长度必须是 0-32 的整数');
            var mask = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0);
            var network = (ip & mask) >>> 0;
            var broadcast = (network | (~mask >>> 0)) >>> 0;
            var wildcard = (~mask >>> 0);
            var total = Math.pow(2, 32 - prefix);
            var usable = prefix >= 31 ? total : Math.max(0, total - 2);
            var first = prefix >= 31 ? network : (network + 1) >>> 0;
            var last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
            var cls = '';
            if ((network & 0xFF000000) >>> 0 === 0x0A000000) cls = '私有地址（10.0.0.0/8）';
            else if ((network & 0xFFF00000) >>> 0 === 0xAC100000) cls = '私有地址（172.16.0.0/12）';
            else if ((network & 0xFFFF0000) >>> 0 === 0xC0A80000) cls = '私有地址（192.168.0.0/16）';
            else if ((network & 0xFF000000) >>> 0 === 0x7F000000) cls = '回环地址（127.0.0.0/8）';
            else if ((network & 0xFFFF0000) >>> 0 === 0xA9FE0000) cls = '链路本地（169.254.0.0/16）';
            else cls = '公网 / 其他地址';
            var rows = [
              ['网络地址', int2ip(network) + '/' + prefix], ['子网掩码', int2ip(mask)],
              ['通配符掩码', int2ip(wildcard)], ['广播地址', prefix >= 31 ? '无（/' + prefix + ' 网络）' : int2ip(broadcast)],
              ['可用主机范围', int2ip(first) + ' ~ ' + int2ip(last)],
              ['地址总数', total.toLocaleString()], ['可用主机数', usable.toLocaleString()],
              ['地址类型', cls], ['二进制掩码', (mask >>> 0).toString(2).padStart(32, '0').replace(/(.{8})/g, '$1 ').trim()]
            ];
            $('.js-kv', body).innerHTML = rows.map(function (r) {
              return '<div class="kv"><small>' + esc(r[0]) + '</small><b style="font-family:var(--mono);font-size:12px">' + esc(r[1]) + '</b></div>';
            }).join('');
            setOut(body, '✓ ' + int2ip(network) + '/' + prefix + ' 计算完成\n网络：' + int2ip(network) +
              '\n掩码：' + int2ip(mask) + '\n主机：' + int2ip(first) + ' - ' + int2ip(last) +
              '\n可用主机数：' + usable.toLocaleString(), 'ok');
          } catch (e) { setOut(body, '✗ ' + errMsg(e), 'error'); $('.js-kv', body).innerHTML = ''; }
        }
        $('.js-go', body).addEventListener('click', go);
        $('.js-cidr', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        bindCopy(body);
        go();
      }
    },

    /* ---------- 10. 正则 ---------- */
    {
      id: 'regex', group: '文本处理', icon: '🧪', name: '正则表达式测试',
      desc: '实时匹配与高亮，列出全部匹配项及捕获分组，支持 g / i / m / s / u 标志。',
      render: function (body) {
        body.innerHTML = card('表达式',
          '<div class="tool-row"><input class="js-pattern" type="text" placeholder="正则表达式，如 (star|repo)\\w+" value="(star|repo)\\w+">' +
          '<label style="font-size:12px"><input type="checkbox" class="js-i" checked> i 忽略大小写</label>' +
          '<label style="font-size:12px"><input type="checkbox" class="js-m"> m 多行</label>' +
          '<label style="font-size:12px"><input type="checkbox" class="js-s"> s 点匹配换行</label></div>', 1) +
          card('测试文本',
            '<textarea class="js-text" rows="6" placeholder="输入测试文本">StarVault is a repository classifier.\nstarred repos, starredAt, repoTopic — regex works!</textarea>', 2) +
          card('匹配结果', outBlock() + '<div class="js-hl" style="margin-top:12px;font-family:var(--mono);font-size:12.5px;line-height:1.9;white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px"></div>', 3);
        function run() {
          var p = $('.js-pattern', body).value;
          var text = $('.js-text', body).value;
          var flags = 'g' + ($('.js-i', body).checked ? 'i' : '') + ($('.js-m', body).checked ? 'm' : '') + ($('.js-s', body).checked ? 's' : '');
          if (!p) { setOut(body, '请输入正则表达式'); $('.js-hl', body).textContent = text; return; }
          var re;
          try { re = new RegExp(p, flags); }
          catch (e) { setOut(body, '✗ 正则语法错误：' + errMsg(e), 'error'); $('.js-hl', body).textContent = text; return; }
          var m, list = [], parts = [], last = 0, count = 0;
          while ((m = re.exec(text)) !== null && count < 500) {
            parts.push(esc(text.slice(last, m.index)));
            parts.push('<mark class="match-hl">' + esc(m[0] || '(零宽)') + '</mark>');
            last = m.index + m[0].length;
            var groups = m.length > 1 ? '  分组: ' + m.slice(1).map(function (g, i) { return '$' + (i + 1) + '=' + (g === undefined ? 'undefined' : g); }).join('  ') : '';
            list.push('[' + (count + 1) + '] @' + m.index + '  ' + JSON.stringify(m[0]) + groups);
            if (m[0] === '') re.lastIndex++;
            count++;
          }
          parts.push(esc(text.slice(last)));
          $('.js-hl', body).innerHTML = parts.join('');
          setOut(body, count + ' 处匹配' + (count >= 500 ? '（已截断至 500 条）' : '') + (list.length ? '\n\n' + list.join('\n') : ''), count ? 'ok' : '');
        }
        $$('.js-pattern, .js-text, .js-i, .js-m, .js-s', body).forEach(function (el) {
          el.addEventListener('input', run);
          el.addEventListener('change', run);
        });
        bindCopy(body);
        run();
      }
    },

    /* ---------- 11. URL 解析 ---------- */
    {
      id: 'urlparse', group: '文本处理', icon: '🧭', name: 'URL 解析',
      desc: '拆解 URL 的协议、主机、端口、路径与查询参数，方便调试接口地址。',
      render: function (body) {
        body.innerHTML = card('输入 URL',
          '<div class="tool-row"><input class="js-url" type="text" placeholder="https://example.com:8080/path?q=star#top" value="https://api.github.com:443/users/octocat/starred?per_page=100&page=1#list">' +
          '<button class="btn btn-primary js-go">解析</button></div>' + outBlock() + '<div class="js-table"></div>', 1);
        function go() {
          var raw = $('.js-url', body).value.trim();
          try {
            var u = new URL(raw);
            var rows = [
              ['完整 URL', u.href], ['协议', u.protocol], ['源 (origin)', u.origin],
              ['主机名', u.hostname], ['端口', u.port || '（默认端口）'], ['主机', u.host],
              ['路径', u.pathname], ['查询字符串', u.search || '（无）'], ['片段 / 锚点', u.hash || '（无）'],
              ['用户名', u.username || '（无）'], ['密码', u.password ? '••••••' : '（无）']
            ];
            $('.js-table', body).innerHTML = '<table class="data-table"><thead><tr><th>组成部分</th><th>值</th></tr></thead><tbody>' +
              rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td><code>' + esc(r[1]) + '</code></td></tr>'; }).join('') +
              '</tbody></table>';
            var params = Array.from(u.searchParams.entries());
            var text = '✓ 解析成功\n\n' + rows.map(function (r) { return r[0] + '：' + r[1]; }).join('\n');
            if (params.length) {
              text += '\n\n查询参数（' + params.length + '）：\n' + params.map(function (p) { return '  ' + p[0] + ' = ' + p[1]; }).join('\n');
              $('.js-table', body).innerHTML += '<table class="data-table"><thead><tr><th>参数名</th><th>参数值</th></tr></thead><tbody>' +
                params.map(function (p) { return '<tr><td><code>' + esc(p[0]) + '</code></td><td>' + esc(p[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
            }
            setOut(body, text, 'ok');
          } catch (e) { setOut(body, '✗ 无法解析 URL：请包含协议，如 https://example.com', 'error'); $('.js-table', body).innerHTML = ''; }
        }
        $('.js-go', body).addEventListener('click', go);
        $('.js-url', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        bindCopy(body);
        go();
      }
    },

    /* ---------- 12. HTTP 状态码 ---------- */
    {
      id: 'httpstatus', group: '网络查询', icon: '📡', name: 'HTTP 状态码速查',
      desc: '常见 HTTP 状态码含义速查表，支持按数字、名称或说明搜索。',
      render: function (body) {
        var DATA = [
          [100, 'Continue', '继续，客户端应继续发送请求'], [101, 'Switching Protocols', '切换协议，如升级到 WebSocket'],
          [102, 'Processing', '服务器已收到并正在处理'],
          [200, 'OK', '请求成功'], [201, 'Created', '已创建新资源'], [202, 'Accepted', '已接受但未处理完成'],
          [204, 'No Content', '成功但无响应体'], [206, 'Partial Content', '断点续传 / 分片内容'],
          [301, 'Moved Permanently', '永久重定向'], [302, 'Found', '临时重定向'], [303, 'See Other', '重定向到另一个 URI'],
          [304, 'Not Modified', '资源未修改，可使用缓存'], [307, 'Temporary Redirect', '临时重定向，保持方法不变'],
          [308, 'Permanent Redirect', '永久重定向，保持方法不变'],
          [400, 'Bad Request', '请求参数或语法错误'], [401, 'Unauthorized', '未认证 / Token 无效'],
          [403, 'Forbidden', '已认证但无权限，或触发限流'], [404, 'Not Found', '资源不存在'],
          [405, 'Method Not Allowed', '请求方法不被允许'], [408, 'Request Timeout', '请求超时'],
          [409, 'Conflict', '资源状态冲突'], [410, 'Gone', '资源已永久删除'], [413, 'Payload Too Large', '请求体过大'],
          [415, 'Unsupported Media Type', '不支持的内容类型'], [418, "I'm a teapot", '彩蛋状态码'],
          [422, 'Unprocessable Entity', '语义错误，无法处理'], [429, 'Too Many Requests', '请求过于频繁，触发限流'],
          [500, 'Internal Server Error', '服务器内部错误'], [501, 'Not Implemented', '功能未实现'],
          [502, 'Bad Gateway', '网关收到无效响应'], [503, 'Service Unavailable', '服务暂时不可用'],
          [504, 'Gateway Timeout', '网关超时'], [505, 'HTTP Version Not Supported', '不支持的 HTTP 版本'],
          [507, 'Insufficient Storage', '服务器存储空间不足'], [508, 'Loop Detected', '检测到无限循环']
        ];
        body.innerHTML = card('速查表',
          '<div class="tool-row"><input class="js-q" type="search" placeholder="搜索状态码、名称或含义，如 429 / 限流 / redirect"></div>' +
          '<div class="js-table"></div>', 1);
        function color(code) {
          if (code < 200) return 'var(--accent)';
          if (code < 300) return 'var(--green)';
          if (code < 400) return 'var(--orange)';
          if (code < 500) return 'var(--red)';
          return 'var(--purple)';
        }
        function draw() {
          var q = $('.js-q', body).value.trim().toLowerCase();
          var rows = DATA.filter(function (r) {
            return !q || (String(r[0]) + ' ' + r[1] + ' ' + r[2]).toLowerCase().indexOf(q) >= 0;
          }).map(function (r) {
            return '<tr><td><span class="status-code-pill" style="color:' + color(r[0]) + '">' + r[0] + '</span></td>' +
              '<td><code>' + esc(r[1]) + '</code></td><td>' + esc(r[2]) + '</td></tr>';
          }).join('');
          $('.js-table', body).innerHTML = '<table class="data-table"><thead><tr><th style="width:70px">状态码</th><th style="width:210px">名称</th><th>含义</th></tr></thead><tbody>' +
            (rows || '<tr><td colspan="3">没有匹配的状态码</td></tr>') + '</tbody></table>';
        }
        $('.js-q', body).addEventListener('input', draw);
        draw();
      }
    },

    /* ---------- 13. 端口速查 ---------- */
    {
      id: 'ports', group: '网络查询', icon: '🔌', name: '常用端口速查',
      desc: '常见服务默认端口与协议速查，支持按端口、服务名或用途搜索。',
      render: function (body) {
        var DATA = [
          [20, 'TCP', 'FTP Data', 'FTP 数据传输'], [21, 'TCP', 'FTP', '文件传输控制'],
          [22, 'TCP', 'SSH / SFTP', '安全远程登录'], [23, 'TCP', 'Telnet', '明文远程登录（不安全）'],
          [25, 'TCP', 'SMTP', '邮件发送'], [53, 'TCP/UDP', 'DNS', '域名解析'],
          [67, 'UDP', 'DHCP Server', '动态主机配置'], [68, 'UDP', 'DHCP Client', '动态主机配置'],
          [69, 'UDP', 'TFTP', '简单文件传输'], [80, 'TCP', 'HTTP', '明文 Web'],
          [110, 'TCP', 'POP3', '邮件接收'], [123, 'UDP', 'NTP', '网络时间同步'],
          [143, 'TCP', 'IMAP', '邮件访问'], [161, 'UDP', 'SNMP', '网络管理'],
          [443, 'TCP', 'HTTPS', '加密 Web / DoH'], [445, 'TCP', 'SMB', '文件共享'],
          [465, 'TCP', 'SMTPS', '加密邮件发送'], [514, 'UDP', 'Syslog', '系统日志'],
          [587, 'TCP', 'SMTP Submission', '邮件提交'], [631, 'TCP', 'IPP', '网络打印'],
          [993, 'TCP', 'IMAPS', '加密 IMAP'], [995, 'TCP', 'POP3S', '加密 POP3'],
          [1080, 'TCP', 'SOCKS5', '代理服务'], [1194, 'UDP', 'OpenVPN', 'VPN'],
          [1433, 'TCP', 'SQL Server', '微软数据库'], [1521, 'TCP', 'Oracle DB', 'Oracle 数据库'],
          [2049, 'TCP', 'NFS', '网络文件系统'], [2181, 'TCP', 'ZooKeeper', '分布式协调'],
          [2375, 'TCP', 'Docker API', 'Docker 未加密远程 API'], [2376, 'TCP', 'Docker TLS', 'Docker 加密远程 API'],
          [3000, 'TCP', 'Dev Server', 'Node / Grafana 等开发服务'], [3306, 'TCP', 'MySQL', 'MySQL 数据库'],
          [3389, 'TCP', 'RDP', 'Windows 远程桌面'], [4369, 'TCP', 'EPMD', 'Erlang 节点发现'],
          [5000, 'TCP', 'Flask / Docker Registry', '常见开发服务'], [5432, 'TCP', 'PostgreSQL', 'PostgreSQL 数据库'],
          [5672, 'TCP', 'AMQP', 'RabbitMQ 消息队列'], [6379, 'TCP', 'Redis', 'Redis 缓存'],
          [6443, 'TCP', 'Kubernetes API', 'K8s 控制面'], [8080, 'TCP', 'HTTP Alt', '常用 Web 备用端口'],
          [8443, 'TCP', 'HTTPS Alt', '常用 HTTPS 备用端口'], [8888, 'TCP', 'Jupyter', 'Notebook 服务'],
          [9000, 'TCP', 'MinIO / PHP-FPM', '对象存储 / 开发服务'], [9090, 'TCP', 'Prometheus', '监控服务'],
          [9200, 'TCP', 'Elasticsearch', '搜索引擎'], [11211, 'TCP/UDP', 'Memcached', '缓存服务'],
          [27017, 'TCP', 'MongoDB', '文档数据库']
        ];
        body.innerHTML = card('速查表',
          '<div class="tool-row"><input class="js-q" type="search" placeholder="搜索端口、协议或服务，如 443 / Redis / 数据库"></div>' +
          '<div class="js-table"></div>', 1);
        function draw() {
          var q = $('.js-q', body).value.trim().toLowerCase();
          var rows = DATA.filter(function (r) {
            return !q || (String(r[0]) + ' ' + r[1] + ' ' + r[2] + ' ' + r[3]).toLowerCase().indexOf(q) >= 0;
          }).map(function (r) {
            return '<tr><td><code>' + r[0] + '</code></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
          }).join('');
          $('.js-table', body).innerHTML = '<table class="data-table"><thead><tr><th style="width:80px">端口</th><th style="width:90px">协议</th><th style="width:190px">服务</th><th>说明</th></tr></thead><tbody>' +
            (rows || '<tr><td colspan="4">没有匹配的端口</td></tr>') + '</tbody></table>';
        }
        $('.js-q', body).addEventListener('input', draw);
        draw();
      }
    },

    /* ---------- 14. User-Agent ---------- */
    {
      id: 'ua', group: '网络查询', icon: '🖥️', name: 'User-Agent 解析',
      desc: '查看并解析当前浏览器的 User-Agent，也可粘贴任意 UA 字符串进行识别。',
      render: function (body) {
        body.innerHTML = card('UA 字符串',
          '<textarea class="js-ua" rows="3" style="font-family:var(--mono)"></textarea>' +
          '<div class="tool-actions"><button class="btn btn-primary js-go">解析</button>' +
          '<button class="btn btn-ghost js-current">使用当前浏览器 UA</button>' + copyBtn() + '</div>' +
          outBlock() + '<div class="kv-grid js-kv"></div>', 1);
        function parseUA(ua) {
          var browsers = [
            [/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Firefox\/([\d.]+)/, 'Firefox'],
            [/Chrome\/([\d.]+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari']
          ];
          var systems = [
            [/Windows NT 10\.0/, 'Windows 10 / 11'], [/Windows NT 6\.3/, 'Windows 8.1'],
            [/Android ([\d.]+)/, 'Android'], [/iPhone OS ([\d_]+)/, 'iOS'],
            [/Mac OS X ([\d_]+)/, 'macOS'], [/Linux/, 'Linux'], [/CrOS/, 'ChromeOS']
          ];
          var browser = '未知浏览器', version = '', system = '未知系统', engine = '未知';
          browsers.some(function (b) { var m = ua.match(b[0]); if (m) { browser = b[1]; version = m[1]; return true; } return false; });
          systems.some(function (s) { var m = ua.match(s[0]); if (m) { system = s[1] + (m[1] ? ' ' + m[1].replace(/_/g, '.') : ''); return true; } return false; });
          if (/AppleWebKit/.test(ua)) engine = 'WebKit / Blink';
          else if (/Gecko\//.test(ua)) engine = 'Gecko';
          var device = /Mobile|Android|iPhone|iPad/.test(ua) ? '移动设备' : '桌面设备';
          return [
            ['浏览器', browser + (version ? ' ' + version : '')], ['渲染引擎', engine],
            ['操作系统', system], ['设备类型', device],
            ['是否移动端', /Mobile|Android|iPhone/.test(ua) ? '是' : '否'],
            ['语言', (navigator.language || '—')],
            ['屏幕分辨率', screen.width + ' × ' + screen.height],
            ['逻辑像素比', String(window.devicePixelRatio || 1)],
            ['Cookies 启用', navigator.cookieEnabled ? '是' : '否'],
            ['平台', navigator.platform || '—']
          ];
        }
        function go() {
          var ua = $('.js-ua', body).value.trim();
          if (!ua) { setOut(body, '请输入 UA 字符串', 'error'); return; }
          var rows = parseUA(ua);
          $('.js-kv', body).innerHTML = rows.map(function (r) {
            return '<div class="kv"><small>' + esc(r[0]) + '</small><b>' + esc(r[1]) + '</b></div>';
          }).join('');
          setOut(body, '✓ 解析完成\n' + rows.map(function (r) { return r[0] + '：' + r[1]; }).join('\n'), 'ok');
        }
        $('.js-ua', body).value = navigator.userAgent;
        $('.js-go', body).addEventListener('click', go);
        $('.js-current', body).addEventListener('click', function () { $('.js-ua', body).value = navigator.userAgent; go(); });
        bindCopy(body);
        go();
      }
    }
  ];

  /* ============================================================
   * 导航与渲染
   * ============================================================ */
  function byId(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return TOOLS[0];
  }

  var GROUP_ORDER = ['网络查询', '编码转换', '生成与计算', '文本处理'];

  function renderNav(filter) {
    var q = String(filter || '').trim().toLowerCase();
    var html = '';
    GROUP_ORDER.forEach(function (g) {
      var items = TOOLS.filter(function (t) {
        return t.group === g && (!q || (t.name + ' ' + t.desc + ' ' + t.id + ' ' + t.group).toLowerCase().indexOf(q) >= 0);
      });
      if (!items.length) return;
      html += '<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:var(--muted);padding:12px 10px 5px;text-transform:uppercase">' + esc(g) + '</div>';
      items.forEach(function (t) {
        html += '<button class="tool-nav-item' + (t.id === currentId ? ' active' : '') + '" data-tool="' + t.id + '">' +
          '<span class="t-ico">' + t.icon + '</span><span>' + esc(t.name) + '</span></button>';
      });
    });
    navEl.innerHTML = html || '<p class="tool-note" style="padding:10px">没有匹配的工具</p>';
  }

  function select(id) {
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} cleanup = null; }
    currentId = id;
    var t = byId(id);
    renderNav(searchEl ? searchEl.value : '');
    workspaceEl.innerHTML = '<div class="tool-panel"><div class="tool-head"><h2>' + t.icon + ' ' + esc(t.name) +
      '</h2><p>' + esc(t.desc) + '</p></div><div id="toolBody"></div></div>';
    var host = document.getElementById('toolBody');
    try { cleanup = t.render(host, toastFn) || null; }
    catch (e) {
      host.innerHTML = '<div class="tool-card"><p style="color:var(--red)">工具初始化失败：' + esc(errMsg(e)) + '</p></div>';
    }
  }

  function mount(opts) {
    toastFn = (opts && opts.toast) || toastFn;
    navEl = document.getElementById('toolNav');
    workspaceEl = document.getElementById('toolWorkspace');
    searchEl = document.getElementById('toolSearch');
    navEl.addEventListener('click', function (e) {
      var b = e.target.closest('.tool-nav-item');
      if (b) select(b.getAttribute('data-tool'));
    });
    searchEl.addEventListener('input', function () { renderNav(searchEl.value); });
    select(TOOLS[0].id);
  }

  function refresh() { /* 视图切换时保留工具内的输入状态，无需重绘 */ }

  global.Toolbox = { mount: mount, refresh: refresh, select: select, count: TOOLS.length };
})(window);
