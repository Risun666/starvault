/* ============================================================
 * github.js — GitHub 公开 API（无需后端，浏览器直连）
 * starred 接口支持匿名访问（60 次/小时），填写 Token 可提升到 5000 次/小时。
 * ============================================================ */
(function (global) {
  'use strict';

  var API = 'https://api.github.com';

  function authHeaders(token) {
    var h = {
      'Accept': 'application/vnd.github.star+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token && String(token).trim()) h['Authorization'] = 'Bearer ' + String(token).trim();
    return h;
  }

  function rateFrom(res) {
    return {
      limit: Number(res.headers.get('x-ratelimit-limit') || 0),
      remaining: Number(res.headers.get('x-ratelimit-remaining') || 0),
      reset: Number(res.headers.get('x-ratelimit-reset') || 0)
    };
  }

  function friendlyError(res) {
    var rate = rateFrom(res);
    if (res.status === 404) return new Error('找不到该 GitHub 用户，请检查用户名拼写');
    if (res.status === 401) return new Error('GitHub Token 无效或已过期，请在设置中更新');
    if ((res.status === 403 || res.status === 429) && rate.remaining === 0) {
      var when = rate.reset ? new Date(rate.reset * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '稍后';
      return new Error('GitHub API 匿名调用已达 60 次/小时上限（同一出口 IP 共享额度）。请填写 Personal Access Token 后重试，或于 ' + when + ' 后再试');
    }
    if (res.status === 403) return new Error('GitHub API 拒绝访问（403），请检查 Token 权限或稍后重试');
    return new Error('GitHub API 请求失败（HTTP ' + res.status + '）');
  }

  function normalize(repo, starredAt) {
    var owner = repo.owner || {};
    return {
      id: repo.id,
      full_name: repo.full_name || (owner.login + '/' + repo.name),
      name: repo.name || '',
      owner: owner.login || '',
      owner_avatar: owner.avatar_url || '',
      html_url: repo.html_url || ('https://github.com/' + (repo.full_name || '')),
      homepage: repo.homepage || '',
      description: repo.description || '',
      language: repo.language || '',
      topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 12) : [],
      stargazers_count: repo.stargazers_count || 0,
      forks_count: repo.forks_count || 0,
      pushed_at: repo.pushed_at || '',
      updated_at: repo.updated_at || '',
      starred_at: starredAt || '',
      archived: !!repo.archived,
      fork: !!repo.fork
    };
  }

  /**
   * 分页拉取用户全部 starred 仓库
   * @param {string} username
   * @param {string} token
   * @param {(info:{count:number,page:number,rate:object})=>void} onPage
   * @returns {Promise<{repos:Array, rate:object}>}
   */
  async function fetchStarred(username, token, onPage) {
    var all = [], rate = null, page = 1;
    var user = encodeURIComponent(String(username || '').trim());
    if (!user) throw new Error('请先填写 GitHub 用户名');

    while (page <= 40) { // 安全上限 4000 个仓库
      var res;
      try {
        res = await fetch(API + '/users/' + user + '/starred?per_page=100&page=' + page, {
          headers: authHeaders(token)
        });
      } catch (e) {
        throw new Error('无法连接 GitHub API，请检查网络连接或代理设置（' + (e.message || '网络错误') + '）');
      }
      if (!res.ok) throw friendlyError(res);
      rate = rateFrom(res);
      var data = await res.json();
      if (!Array.isArray(data)) throw new Error('GitHub 返回了意外的数据格式');
      data.forEach(function (item) {
        // star+json 返回 { starred_at, repo }；兼容标准 repo 对象
        all.push(item && item.repo ? normalize(item.repo, item.starred_at) : normalize(item));
      });
      if (typeof onPage === 'function') onPage({ count: all.length, page: page, rate: rate });
      var link = res.headers.get('Link') || '';
      if (data.length < 100 || (link && link.indexOf('rel="next"') === -1)) break;
      page++;
    }
    return { repos: all, rate: rate };
  }

  /** 获取用户公开资料（头像等） */
  async function fetchUser(username, token) {
    var u = encodeURIComponent(String(username || '').trim());
    try {
      var h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (token && String(token).trim()) h['Authorization'] = 'Bearer ' + String(token).trim();
      var res = await fetch(API + '/users/' + u, { headers: h });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  /** 仅校验用户是否存在（首次填写用户名时用） */
  async function validateUser(username, token) {
    var u = encodeURIComponent(String(username || '').trim());
    if (!u) throw new Error('请输入 GitHub 用户名');
    var h = { 'Accept': 'application/vnd.github+json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    var res;
    try { res = await fetch(API + '/users/' + u, { headers: h }); }
    catch (e) { throw new Error('网络不可用，请检查连接后重试'); }
    if (!res.ok) throw friendlyError(res);
    return await res.json();
  }

  global.GitHub = {
    fetchStarred: fetchStarred,
    fetchUser: fetchUser,
    validateUser: validateUser,
    normalize: normalize
  };
})(window);
