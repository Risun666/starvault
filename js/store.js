/* ============================================================
 * store.js — 本地状态管理（localStorage 持久化）
 * 用户名、分类记录、设置全部保存在浏览器本地，不上传服务器。
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'starvault.state.v1';

  function defaults() {
    return {
      version: 1,
      username: '',
      avatar: '',
      repos: [],
      settings: {
        githubToken: '',
        aiEnabled: false,
        aiKey: '',
        aiBase: 'https://api.openai.com/v1',
        aiModel: 'gpt-4o-mini',
        theme: 'light',
        keepUnstarred: true
      },
      lastSyncAt: null,
      ui: { view: 'stars', layout: 'grid', category: 'all', sort: 'stars', lang: '' }
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    var out = clone(base);
    Object.keys(saved).forEach(function (k) {
      if (k === 'settings' || k === 'ui') {
        if (saved[k] && typeof saved[k] === 'object') {
          Object.keys(saved[k]).forEach(function (sk) { out[k][sk] = saved[k][sk]; });
        }
      } else {
        out[k] = saved[k];
      }
    });
    if (!Array.isArray(out.repos)) out.repos = [];
    return out;
  }

  var state = defaults();
  var available = true;

  function read() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      return merge(defaults(), JSON.parse(raw));
    } catch (e) {
      console.warn('[StarVault] 读取本地数据失败：', e);
      return defaults();
    }
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (available) console.warn('[StarVault] 保存失败（可能超出存储配额）：', e);
      available = false;
      return false;
    }
  }

  state = read();

  global.Store = {
    get state() { return state; },
    save: save,
    /** 浅层合并顶层字段 */
    patch: function (obj) { Object.keys(obj).forEach(function (k) { state[k] = obj[k]; }); save(); },
    setSetting: function (k, v) { state.settings[k] = v; save(); },
    setUI: function (k, v) { state.ui[k] = v; save(); },
    /** 按 id 查找仓库 */
    findRepo: function (id) {
      for (var i = 0; i < state.repos.length; i++) if (String(state.repos[i].id) === String(id)) return state.repos[i];
      return null;
    },
    reset: function () {
      state = defaults();
      try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return state;
    },
    /** 覆盖式导入（校验格式） */
    importData: function (obj) {
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.repos)) {
        throw new Error('文件格式不正确：缺少 repos 列表');
      }
      state = merge(defaults(), obj);
      save();
      return state;
    },
    exportData: function () { return clone(state); },
    isAvailable: function () { return available; }
  };
})(window);
