# 每日家常菜公众号自动发布 (CloudBase 版)

基于**腾讯云 CloudBase（微信云开发）**，每日自动抓取家常菜食谱并发布到微信公众号。

## 为什么用 CloudBase

- 🇨🇳 云函数跑在腾讯云，天然中国 IP → 不会像 GitHub Actions 那样被中文菜谱网站 403 拦截
- ⏰ 内置 cron 定时触发器
- 🔗 和微信同属腾讯生态，无需配置 IP 白名单
- 🆓 免费额度足够（云函数 10 万次/月）

## 项目结构

```
cloudbase-recipe-publisher/
├── cloudfunctions/
│   └── dailyRecipePublish/
│       ├── index.js              # 云函数入口
│       ├── package.json           # 依赖
│       ├── config.js              # 配置
│       ├── article.js             # HTML 模板
│       ├── scrapers/
│       │   ├── douguo.js          # 豆果美食爬虫
│       │   └── meishichina.js     # 美食天下爬虫
│       ├── wechat/
│       │   └── client.js          # 微信 API 客户端
│       └── utils/
│           └── retry.js           # 重试工具
├── cloudbaserc.json               # CloudBase 配置
└── README.md
```

## 快速开始

### 1. 开通 CloudBase

访问 [https://console.cloud.tencent.com/tcb](https://console.cloud.tencent.com/tcb) 创建环境。

### 2. 安装 CloudBase CLI

```bash
npm i -g @cloudbase/cli
tcb login
```

### 3. 修改配置

编辑 `cloudbaserc.json`，将 `envId` 替换为你的环境 ID。

### 4. 部署云函数

```bash
cd cloudbase-recipe-publisher
tcb fn deploy dailyRecipePublish --envId <你的环境ID>
```

### 5. 配置环境变量

在 CloudBase 控制台 → 云函数 → dailyRecipePublish → 环境变量，添加：
- `WECHAT_APP_ID`：公众号 AppID
- `WECHAT_APP_SECRET`：公众号 AppSecret

### 6. 测试

在控制台点击「测试」按钮手动触发，查看日志。

### 7. 定时触发器

`cloudbaserc.json` 已配置每天 08:45 自动执行。也可在控制台手动管理触发器。

## 工作原理

```
定时触发器 (08:45 CST)
  → 从豆果美食/美食天下抓取随机食谱
  → 下载图片 → 上传微信公众号 CDN
  → 构建精美图文 HTML
  → 创建草稿 → 提交群发
```
