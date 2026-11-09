# 星仓 StarVault

> 把 GitHub Star 收藏自动归类，随手可用的本地优先工具箱。纯前端 + 原生 WebView 壳，无后端、无账号、无数据上传。

<p align="center">
  <img src="android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" width="88" alt="StarVault icon">
</p>

## 它能做什么

- **一次填写，永久记住**：首次输入 GitHub 用户名后，用户名、头像、分类记录、主题、设置全部保存在本地，下次打开直接进入主界面。
- **自动分类**：分页拉取全部 starred 仓库，用内置规则引擎分成 15 类（AI / 前端 / 后端 / 数据库 / DevOps / 安全 / 移动端 / 命令行 / 库与框架 / 文档资源 等）。
- **增量更新**：点「更新收藏」只对新收藏分类，已有仓库仅刷新 Star 数等元数据；**手动改过的分类不会被覆盖**，取消收藏的历史记录可保留。
- **可选 AI 分类**：设置里填 API 密钥即可启用 OpenAI 兼容接口（内置 OpenAI / DeepSeek / Moonshot / 智谱 / 通义千问预设，支持「测试连接」「AI 重新分类全部」）。不填也能完整使用，AI 失败会自动回退到规则引擎。
- **14 个网络工具**：IP 归属地、DNS(DoH)、URL / Base64 编解码、Unix 时间戳、JSON 格式化校验、UUID 与密码生成、SHA 哈希、CIDR 子网计算、正则测试、URL 解析、HTTP 状态码 / 常用端口速查、User-Agent 解析。
- **搜索 / 筛选 / 排序 / 视图切换 / 手动改分类 / 导入导出备份 / 深浅主题 / 响应式布局**。

## 快速开始

### Web 版（零依赖）

直接双击 `index.html`，或起一个静态服务器：

```bash
python -m http.server 8777
# 打开 http://127.0.0.1:8777/
```

### Android 版

- 直接安装仓库里已签名的 [`dist/StarVault-v1.0.0.apk`](dist/StarVault-v1.0.0.apk)（Android 7.0 / API 24 及以上）。
- 首次安装需要在系统设置里允许「安装未知来源应用」，这是自签名 APK 的正常提示。
- 应用内数据存于 WebView 的 localStorage，卸载应用会清除；重要数据请用「设置 → 导出 JSON 备份」。

> GitHub 匿名 API 限额是 60 次/小时且同一出口 IP 共享。公司 / 代理网络下建议在欢迎页展开「可选：GitHub Token」填一个**无权限的只读 PAT**（限额 5000 次/小时）。Token 与 AI 密钥只存在本机，不会发往任何第三方服务器。

## 自己构建 APK

不需要 Android Studio、Gradle、AndroidX，也不需要联网下载依赖。只要本机装了 **JDK 11+** 和 **Android SDK（build-tools + 任一 android-* platform）**。

```powershell
# Windows（原生 PowerShell，零 Python 依赖）
powershell -ExecutionPolicy Bypass -File .\android\build-apk.ps1
```

```bash
# Git Bash / macOS / Linux（需要 python3）
bash android/build-apk.sh
```

产物：`dist/StarVault-v1.0.0.apk`（v1 + v2 + v3 签名，约 80 KB）。
如自动探测失败，可显式指定：

```bash
ANDROID_SDK_ROOT=/path/to/Android/Sdk JAVA_HOME=/path/to/jdk-17 bash android/build-apk.sh
```

构建脚本流程：`aapt2 compile/link`（资源 + assets）→ `javac` → `d8` → 注入 `classes.dex` → `zipalign` → `keytool` 生成签名 → `apksigner` 签名并校验。首次构建会生成 `android/starvault.keystore`（已加入 `.gitignore`，请勿提交）。

## 架构说明

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 页面 | `index.html`, `css/styles.css` | 欢迎页 / 收藏视图 / 工具箱 / 设置与进度弹窗 |
| 存储 | `js/store.js` | localStorage 状态读写、导入导出、设置 |
| 分类 | `js/categories.js`, `js/classifier.js` | 15 类词表与打分规则；OpenAI 兼容 AI 批量分类 + 失败回退 |
| 数据 | `js/github.js` | `GET /users/{u}/starred` 分页、用户信息、限额与错误处理 |
| 主逻辑 | `js/app.js` | 首启校验、增量同步、渲染、搜索排序、手动分类、设置、备份 |
| 工具箱 | `js/toolbox.js` | 14 个纯前端工具 |
| Android 壳 | `android/app/src/main/` | `MainActivity.java` + Manifest + 图标 |
| 构建 | `android/build-apk.*`, `android/tools/` | 命令行构建脚本与图标 / dex 注入工具 |

**为什么 Android 壳用虚拟 HTTPS 源？**
WebView 通过 `shouldInterceptRequest` 把 `assets/www/*` 映射到 `https://starvault.app/`。相比 `file://`，这样做有三个必要好处：`localStorage` 有稳定持久的源、跨域 `fetch` 到 `api.github.com` 等 HTTPS 接口正常、CORS 行为与桌面浏览器一致。原生层还接管了：

- `saveFile()`：把 JSON / Markdown 备份写入公共 `下载/StarVault/`（Android 10+ 走 MediaStore，9 及以下走公共目录）。
- `setStatusBar()`：状态栏颜色跟随应用内浅色 / 深色主题。
- `onShowFileChooser()`：让「导入备份」能调用系统文件选择器。
- 外部链接交给系统浏览器打开；返回键双击退出；`configChanges` 避免旋转重建。

## 目录结构

```
├── index.html                 # Web 应用入口
├── css/styles.css
├── js/                        # store / categories / classifier / github / app / toolbox
├── android/
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/starvault/app/MainActivity.java
│   │   └── res/               # 主题、应用名、5 档启动图标
│   ├── tools/                 # make_icon.py（生成图标）、inject_dex.py
│   ├── build-apk.ps1          # Windows 构建
│   └── build-apk.sh           # Bash 构建
└── dist/StarVault-v1.0.0.apk  # 已签名可安装包
```

## 隐私

- 不收集、不上传任何数据；所有请求由本机直接发往 GitHub / DNS / IP 查询 / 你配置的 AI 接口。
- GitHub Token、AI API Key、分类记录均只保存在浏览器 / 应用本地存储中。
- 工具箱里的编码、哈希、解析、生成类工具完全在本地计算。

## 许可证

[MIT](LICENSE)（可按需要自行替换）。
