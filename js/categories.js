/* ============================================================
 * categories.js — 分类体系、关键词规则、语言配色
 * ============================================================ */
(function (global) {
  'use strict';

  /* priority：分数相同时的优先级（越大越优先） */
  var CATEGORIES = [
    {
      id: 'frontend', name: '前端开发', emoji: '🌐', color: '#2f81f7', priority: 8,
      langs: ['javascript', 'typescript', 'html', 'css', 'vue', 'scss', 'less', 'astro'],
      strong: ['react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'tailwind', 'frontend', 'front-end', 'css', 'html5', 'ui-component', 'component-library', 'vite', 'webpack', 'browser-extension', 'chrome-extension', 'bootstrap', 'chakra', 'ant-design', 'element-ui', 'spa', 'jquery', 'styled-components', 'web-frontend', 'nuxt', 'remix', 'solidjs', 'deno-fresh'],
      weak: ['web-ui', 'javascript', 'typescript', 'dom', 'responsive', 'landing-page', 'reactjs', 'vuejs', 'browser']
    },
    {
      id: 'backend', name: '后端服务', emoji: '⚙️', color: '#8b5cf6', priority: 8,
      langs: ['java', 'php', 'c#', 'ruby', 'elixir'],
      strong: ['backend', 'back-end', 'api-server', 'rest-api', 'graphql', 'express', 'koa', 'fastify', 'nestjs', 'django', 'flask', 'fastapi', 'spring-boot', 'rails', 'laravel', 'asp.net', 'grpc', 'microservice', 'microservices', 'web-framework', 'http-server', 'middleware', 'rpc-framework', 'server-side'],
      weak: ['server', 'api', 'nodejs', 'orm', 'http', 'framework', 'restful']
    },
    {
      id: 'ai', name: 'AI / 机器学习', emoji: '🤖', color: '#ec4899', priority: 9,
      langs: ['jupyter notebook', 'python'],
      strong: ['machine-learning', 'deep-learning', 'neural-network', 'llm', 'large-language-model', 'gpt', 'chatgpt', 'openai', 'transformers', 'pytorch', 'tensorflow', 'langchain', 'retrieval-augmented', 'rag', 'stable-diffusion', 'diffusion-model', 'computer-vision', 'nlp', 'natural-language-processing', 'reinforcement-learning', 'ai-agent', 'artificial-intelligence', 'fine-tuning', 'embedding-model', 'huggingface', 'yolo', 'opencv', 'image-generation', 'speech-recognition', 'whisper', 'generative-ai', 'text-to-image', 'onnx', 'model-training', 'llmops', 'ai'],
      weak: ['model', 'dataset', 'inference', 'chatbot', 'agent', 'neural', 'ml', 'vision']
    },
    {
      id: 'mobile', name: '移动开发', emoji: '📱', color: '#0ea5e9', priority: 8,
      langs: ['swift', 'kotlin', 'dart', 'objective-c'],
      strong: ['android', 'ios', 'flutter', 'react-native', 'mobile-app', 'mobile', 'jetpack-compose', 'swiftui', 'xamarin', 'cordova', 'ionic', 'app-store', 'ios-app', 'android-app'],
      weak: ['cross-platform', 'macos', 'desktop-app', 'electron']
    },
    {
      id: 'data', name: '数据库 / 数据', emoji: '🗄️', color: '#14b8a6', priority: 8,
      langs: ['sql', 'plpgsql'],
      strong: ['database', 'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'elasticsearch', 'clickhouse', 'cassandra', 'kafka', 'apache-spark', 'hadoop', 'etl', 'data-warehouse', 'olap', 'duckdb', 'bigquery', 'data-analysis', 'pandas', 'data-visualization', 'nosql', 'vector-database', 'milvus', 'snowflake', 'airflow', 'dbt', 'sql-parser', 'orm-framework'],
      weak: ['data', 'query', 'streaming', 'dataframe', 'analytics', 'sql']
    },
    {
      id: 'devops', name: 'DevOps / 云原生', emoji: '☁️', color: '#f59e0b', priority: 8,
      langs: ['dockerfile', 'hcl', 'nix'],
      strong: ['docker', 'kubernetes', 'k8s', 'devops', 'ci-cd', 'terraform', 'ansible', 'helm', 'prometheus', 'grafana', 'nginx', 'cloud-native', 'deployment', 'aws', 'azure', 'gcp', 'serverless', 'monitoring', 'observability', 'istio', 'service-mesh', 'container', 'github-actions', 'jenkins', 'puppet', 'vagrant', 'proxmox', 'homelab', 'self-hosted', 'reverse-proxy', 'infrastructure-as-code', 'linux-kernel'],
      weak: ['cloud', 'ops', 'infrastructure', 'cluster', 'orchestration', 'deploy', 'selfhosted']
    },
    {
      id: 'security', name: '安全 / 网络', emoji: '🔐', color: '#ef4444', priority: 9,
      langs: [],
      strong: ['security', 'penetration-testing', 'pentest', 'vulnerability', 'exploit', 'cybersecurity', 'infosec', 'malware', 'reverse-engineering', 'cryptography', 'encryption', 'firewall', 'ctf', 'hacking', 'forensics', 'sql-injection', 'zero-trust', 'hashcat', 'burp-suite', 'oauth', 'tls', 'ssl', 'web-security', 'privacy-tool', 'password-manager', 'antivirus'],
      weak: ['auth', 'secure', 'cipher', 'audit', 'xss', 'permission']
    },
    {
      id: 'blockchain', name: '区块链 / Web3', emoji: '⛓️', color: '#a855f7', priority: 9,
      langs: ['solidity'],
      strong: ['blockchain', 'ethereum', 'web3', 'smart-contract', 'bitcoin', 'cryptocurrency', 'defi', 'nft', 'dapp', 'solana', 'evm', 'consensus-algorithm', 'crypto-wallet'],
      weak: ['wallet', 'token', 'chain', 'ledger']
    },
    {
      id: 'game', name: '游戏 / 图形', emoji: '🎮', color: '#f97316', priority: 8,
      langs: ['c++', 'c', 'glsl', 'hlsl'],
      strong: ['game-engine', 'game', 'unity', 'unreal-engine', 'godot', 'opengl', 'graphics', 'shader', 'webgl', 'emulator', 'gamedev', 'raytracing', 'minecraft', 'voxel', 'physics-engine', '3d-renderer', 'sprite', 'retro-game'],
      weak: ['rendering', 'canvas', '3d', 'pixel', 'animation']
    },
    {
      id: 'design', name: '设计 / 创意', emoji: '🎨', color: '#e879a6', priority: 7,
      langs: [],
      strong: ['icon-pack', 'icon-font', 'typography', 'illustration', 'wallpaper', 'ui-design', 'figma', 'logo', 'portfolio', 'ascii-art', 'generative-art', 'design-system', 'color-palette', 'design-resources', 'themes', 'font'],
      weak: ['design', 'icons', 'visual', 'art', 'style', 'theme', 'ui']
    },
    {
      id: 'cli', name: '命令行工具', emoji: '⌨️', color: '#64748b', priority: 7,
      langs: ['shell', 'bash', 'powershell', 'batchfile'],
      strong: ['command-line', 'cli-tool', 'terminal', 'tui', 'shell-script', 'dotfiles', 'powershell', 'fish-shell', 'ncurses', 'terminal-emulator', 'neovim', 'vim-plugin', 'tmux', 'zsh', 'bash-script', 'cli', 'spinner', 'console-app', 'command'],
      weak: ['command', 'shell', 'script', 'utility', 'prompt']
    },
    {
      id: 'testing', name: '测试 / 工程质量', emoji: '🧪', color: '#22c55e', priority: 8,
      langs: [],
      strong: ['unit-test', 'test-framework', 'jest', 'pytest', 'e2e-testing', 'cypress', 'playwright', 'selenium', 'benchmark', 'eslint', 'code-quality', 'static-analysis', 'fuzzing', 'test-coverage', 'mocking', 'lint'],
      weak: ['testing', 'test', 'ci', 'assertion']
    },
    {
      id: 'lib', name: '库 / 框架 / SDK', emoji: '📦', color: '#6366f1', priority: 5,
      langs: ['go', 'rust', 'c', 'scala', 'lua'],
      strong: ['library', 'sdk', 'npm-package', 'python-library', 'utility-library', 'toolkit', 'boilerplate', 'starter-template', 'scaffolding', 'framework', 'plugin-system', 'client-library', 'helpers', 'utilities', 'utility', 'extras', 'parser', 'module', 'npm', 'node-module', 'javascript', 'typescript', 'nodejs', 'package', 'stream', 'buffer', 'regex', 'helper'],
      weak: ['lib', 'module', 'wrapper', 'client', 'plugin', 'extension', 'utils', 'package', 'template', 'tool', 'micro']
    },
    {
      id: 'docs', name: '学习资源 / 清单', emoji: '📚', color: '#eab308', priority: 6,
      langs: [],
      strong: ['awesome', 'awesome-list', 'tutorial', 'roadmap', 'cheatsheet', 'cheat-sheet', 'interview-questions', 'coding-interview', 'free-programming-books', 'curated-list', 'learning-resources', 'study-notes', 'handbook', 'course', 'ebook', '教程', '面试', '学习笔记', 'from-scratch', '30-days-of', 'examples-collection', 'guide'],
      weak: ['documentation', 'docs', 'examples', 'book', 'resources', 'collection', 'interview', 'learning', '中文']
    },
    {
      id: 'other', name: '其他 / 待归类', emoji: '🧩', color: '#94a3b8', priority: 0,
      langs: [], strong: [], weak: []
    }
  ];

  var BY_ID = {};
  CATEGORIES.forEach(function (c) { BY_ID[c.id] = c; });

  /* GitHub 主流语言配色 */
  var LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
    Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
    Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
    Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', SCSS: '#c6538c',
    'Jupyter Notebook': '#DA5B0B', Lua: '#000080', Scala: '#c22d40', Haskell: '#5e5086',
    Elixir: '#6e4a7e', Perl: '#0298c3', R: '#198CE7', Solidity: '#AA6746',
    Dockerfile: '#384d54', Markdown: '#083fa1', 'Objective-C': '#438eff', Assembly: '#a1a1a1',
    Zig: '#ec915c', Clojure: '#db5855', TeX: '#3D6117', Nix: '#7eBAe4', HCL: '#844FBA'
  };

  global.Categories = {
    list: CATEGORIES,
    byId: function (id) { return BY_ID[id] || BY_ID.other; },
    langColor: function (lang) { return LANG_COLORS[lang] || '#9aa5b4'; },
    /** 选项 HTML：用于分类下拉 */
    optionsHTML: function (selected) {
      return CATEGORIES.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.emoji + ' ' + c.name + '</option>';
      }).join('');
    },
    /** 供 AI 使用的分类说明 */
    aiPromptList: function () {
      return CATEGORIES.filter(function (c) { return c.id !== 'other'; })
        .map(function (c) { return c.id + ' = ' + c.name; }).join('; ');
    }
  };
})(window);
