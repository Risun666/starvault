/* ============================================================
 * classifier.js — 规则分类引擎 + OpenAI 兼容 AI 分类（可选）
 * 设计原则：规则引擎永远可用；AI 只是增强，失败自动回退，绝不阻塞使用。
 * ============================================================ */
(function (global) {
  'use strict';

  var CATS = global.Categories;
  var compiled = null;

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* 关键词使用「词边界」匹配，避免 rag 命中 storage、ai 命中 chain 之类的误判 */
  function buildRegex(terms) {
    if (!terms || !terms.length) return null;
    var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
    return new RegExp('(?:^|[^a-z0-9])(?:' + sorted.map(escapeRe).join('|') + ')(?=$|[^a-z0-9])', 'gi');
  }

  function compile() {
    if (compiled) return compiled;
    compiled = CATS.list.filter(function (c) { return c.id !== 'other'; }).map(function (c) {
      return {
        id: c.id, priority: c.priority, langs: c.langs,
        strong: buildRegex(c.strong),
        weak: buildRegex(c.weak),
        exact: c.strong.length
          ? new RegExp('^(?:' + c.strong.map(escapeRe).join('|') + ')$', 'i')
          : null
      };
    });
    return compiled;
  }

  function countHits(re, text) {
    if (!re || !text) return 0;
    re.lastIndex = 0;
    var m = text.match(re);
    return m ? m.length : 0;
  }

  /* 关键词没有明显信号时，用主语言做保守兜底（标记为「推断」，便于用户复核或交给 AI） */
  var LANG_FALLBACK = {
    'javascript': 'lib', 'typescript': 'lib', 'python': 'lib', 'go': 'lib', 'rust': 'lib',
    'c': 'lib', 'c++': 'lib', 'lua': 'lib', 'zig': 'lib', 'scala': 'lib', 'haskell': 'lib',
    'java': 'backend', 'php': 'backend', 'ruby': 'backend', 'c#': 'backend', 'elixir': 'backend',
    'swift': 'mobile', 'kotlin': 'mobile', 'dart': 'mobile', 'objective-c': 'mobile',
    'shell': 'cli', 'bash': 'cli', 'powershell': 'cli', 'batchfile': 'cli',
    'html': 'frontend', 'css': 'frontend', 'vue': 'frontend', 'scss': 'frontend', 'astro': 'frontend',
    'dockerfile': 'devops', 'hcl': 'devops', 'nix': 'devops',
    'solidity': 'blockchain', 'jupyter notebook': 'ai', 'r': 'data', 'sql': 'data'
  };

  /** 单个仓库的规则分类：返回 { cat, score, confidence, guessed } */
  function ruleClassify(repo) {
    var rules = compile();
    var name = String(repo.name || '').toLowerCase();
    var desc = String(repo.description || '').toLowerCase();
    var topics = (repo.topics || []).map(function (t) { return String(t).toLowerCase(); });
    var topicStr = topics.join(' ');
    var lang = String(repo.language || '').toLowerCase();
    var best = 'other', bestScore = 0, bestPriority = -1;

    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var s = 0;
      s += 9 * countHits(r.strong, name);
      s += 7 * countHits(r.strong, topicStr);
      s += 3 * countHits(r.strong, desc);
      s += 3 * countHits(r.weak, name);
      s += 2 * countHits(r.weak, topicStr);
      s += 1 * countHits(r.weak, desc);
      // topic 精确相等是极强的信号
      if (r.exact) {
        topics.forEach(function (t) { if (r.exact.test(t)) s += 2; });
      }
      if (r.langs.indexOf(lang) >= 0) s += 1.5;
      if (r.id === 'docs' && /^awesome[-_.]/.test(name)) s += 15;
      if (s > bestScore || (s === bestScore && s > 0 && r.priority > bestPriority)) {
        best = r.id; bestScore = s; bestPriority = r.priority;
      }
    }
    var guessed = false;
    if (bestScore < 5) {
      var fb = LANG_FALLBACK[lang];
      if (fb) { best = fb; guessed = true; }
      else { best = 'other'; bestScore = 0; }
    }
    return { cat: best, score: bestScore, confidence: Math.min(1, bestScore / 16), guessed: guessed };
  }

  /* ---------------- AI 分类 ---------------- */

  function endpoint(base) {
    var b = String(base || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
    return b + '/chat/completions';
  }

  function headers(key) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(key || '').trim() };
  }

  function extractJSON(text) {
    if (!text) return null;
    var t = String(text).trim();
    // 去掉 markdown 代码块
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var a = t.indexOf('['), b = t.lastIndexOf(']');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  /**
   * 调用 OpenAI 兼容 /chat/completions，批量返回分类。
   * @returns {Promise<Object>} { [repoId]: categoryId }
   */
  async function aiClassify(repos, settings, onProgress) {
    var valid = {};
    CATS.list.forEach(function (c) { valid[c.id] = true; });
    var result = {};
    var BATCH = 16;
    var total = Math.ceil(repos.length / BATCH);
    var promptCats = CATS.aiPromptList();

    for (var i = 0, batchNo = 0; i < repos.length; i += BATCH, batchNo++) {
      var batch = repos.slice(i, i + BATCH);
      var brief = batch.map(function (r) {
        return {
          id: r.id,
          name: r.full_name || r.name,
          desc: String(r.description || '').slice(0, 180),
          lang: r.language || '',
          topics: (r.topics || []).slice(0, 8)
        };
      });
      var systemPrompt =
        'You classify GitHub repositories into exactly one category. ' +
        'Available categories (id = meaning): ' + promptCats + '; other = 无法归入以上任何一类。\n' +
        'Rules: use the id only; judge by repo name, description, topics and language; ' +
        'prefer the most specific category; use "other" only when truly unclear. ' +
        'Return ONLY a JSON array, no explanation, no markdown, in the form ' +
        '[{"id":<the given numeric id>,"cat":"<category id>"}], one object per input repo, keep the same ids.';
      var body = {
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(brief) }
        ],
        temperature: 0,
        max_tokens: 2000
      };
      var res = await fetch(endpoint(settings.aiBase), {
        method: 'POST', headers: headers(settings.aiKey), body: JSON.stringify(body)
      });
      if (!res.ok) {
        var errText = '';
        try { errText = (await res.text()).slice(0, 220); } catch (e) {}
        throw new Error('HTTP ' + res.status + (errText ? ' · ' + errText : ''));
      }
      var data = await res.json();
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      var arr = extractJSON(content);
      if (!Array.isArray(arr)) throw new Error('模型返回内容无法解析为 JSON 数组');
      arr.forEach(function (o) {
        if (o && o.id != null && valid[o.cat]) result[String(o.id)] = o.cat;
      });
      if (typeof onProgress === 'function') {
        onProgress({ done: batchNo + 1, total: total, processed: Math.min(i + BATCH, repos.length), count: repos.length });
      }
    }
    return result;
  }

  /** 测试 API 连通性与密钥有效性 */
  async function testConnection(settings) {
    var res = await fetch(endpoint(settings.aiBase), {
      method: 'POST', headers: headers(settings.aiKey),
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        temperature: 0, max_tokens: 16
      })
    });
    if (!res.ok) {
      var t = '';
      try { t = (await res.text()).slice(0, 200); } catch (e) {}
      throw new Error('HTTP ' + res.status + (t ? ' · ' + t : ''));
    }
    var d = await res.json();
    if (!d || !d.choices || !d.choices.length) throw new Error('响应格式不是 OpenAI 兼容格式');
    return (d.choices[0].message && d.choices[0].message.content || '').trim() || 'OK';
  }

  /**
   * 统一入口：先跑规则引擎，再尝试 AI 覆盖。
   * @returns {Promise<{map:Object, source:'ai'|'rule', warning:string, guesses:Object, aiIds:Object}>}
   */
  async function classifyRepos(repos, settings, onProgress) {
    var map = {}, guesses = {}, aiIds = {}, source = 'rule', warning = '';
    repos.forEach(function (r) {
      var c = ruleClassify(r);
      map[String(r.id)] = c.cat;
      if (c.guessed) guesses[String(r.id)] = true;
    });
    if (settings.aiEnabled && settings.aiKey && repos.length) {
      try {
        var aiMap = await aiClassify(repos, settings, onProgress);
        Object.keys(aiMap).forEach(function (id) {
          if (map[id] !== undefined) { map[id] = aiMap[id]; aiIds[id] = true; }
        });
        source = 'ai';
      } catch (e) {
        warning = 'AI 分类失败，已自动回退到规则引擎（' + (e.message || e) + '）';
        console.warn('[StarVault] AI 分类失败：', e);
      }
    }
    return { map: map, source: source, warning: warning, guesses: guesses, aiIds: aiIds };
  }

  global.Classifier = {
    ruleClassify: ruleClassify,
    aiClassify: aiClassify,
    classifyRepos: classifyRepos,
    testConnection: testConnection
  };
})(window);
