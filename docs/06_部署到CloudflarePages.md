# 部署到 Cloudflare Pages

目的：让网站地址不带 GitHub 用户名，比如 `https://sycare.pages.dev`。Cloudflare Pages 免费，每次推送到 `main` 会自动重新部署。

GitHub Pages 可以继续保留，两边互不影响。

## 代码里已经准备好的

网站路径在 [web/vite.config.js](../web/vite.config.js) 里可以配置：

| 部署到 | 网站路径 | 怎么设 |
|---|---|---|
| GitHub Pages | `/SyCare/` | 不用设，默认就是这个 |
| Cloudflare Pages | `/` | 构建时加环境变量 `BASE_PATH=/` |

## 第一步：注册并连接 GitHub

1. 打开 https://dash.cloudflare.com/sign-up 注册 Cloudflare 账号（免费）。
2. 登录后，左侧菜单进入 **Workers & Pages**，点 **Create**（创建）。
3. 切换到 **Pages** 标签，选 **Import an existing Git repository**（导入已有的 Git 仓库）。注意不要选 Workers。
4. 点 **Connect GitHub**，按提示授权 Cloudflare 读取仓库。可以只授权 `dylanmiao7/SyCare` 这一个仓库。
5. 回到 Cloudflare，选择 `SyCare` 仓库，点 **Begin setup**。

## 第二步：填写构建设置

| 设置项 | 填写 |
|---|---|
| Project name（项目名） | `sycare`，网址就是 `sycare.pages.dev`。如果被占用，换一个，比如 `sycare-demo` |
| Production branch（生产分支） | `main` |
| Framework preset（框架预设） | `None` |
| Build command（构建命令） | `npm run build` |
| Build output directory（输出目录） | `dist` |
| Root directory（根目录，在 Advanced 里） | `web` |

再在 **Environment variables**（环境变量）里加四条：

| 变量名 | 值 |
|---|---|
| `BASE_PATH` | `/` |
| `NODE_VERSION` | `22` |
| `VITE_SUPABASE_URL` | `https://cmpakpwccncusnmlzysg.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 和 `.github/workflows/deploy-pages.yml` 里的 Publishable key 一样 |

Publishable key 本来就是公开在网页里的，可以放在这里。**DeepSeek 密钥不要填在这里**，它只放在 Supabase 的 Secrets 里。

点 **Save and Deploy**，等一两分钟。

## 第三步：检查

1. 部署完成后打开 `https://项目名.pages.dev`。
2. 应该看到老人模式首页，小安会说一句提醒。
3. 点小安，问"低压是什么意思？"，能收到 DeepSeek 的回答。ask 函数允许任何网站来源调用，所以不用改 Supabase。
4. 如果页面空白：检查 `BASE_PATH` 是不是 `/`，Root directory 是不是 `web`。
5. 如果提示"还没有配置 Supabase 连接信息"：检查两个 `VITE_` 变量有没有填，填完后要在 Cloudflare 里点 **Retry deployment** 重新构建。

## 以后

- **自动部署**：每次推送到 `main`，Cloudflare Pages 和 GitHub Pages 会各自重新部署。
- **只保留一个**：如果以后只用 Cloudflare，可以删掉 `.github/workflows/deploy-pages.yml`，并在 GitHub 仓库 Settings → Pages 里关掉 GitHub Pages。
- **自己的域名**：买了域名后，在 Cloudflare Pages 项目的 **Custom domains** 里绑定。
- **国内访问**：`pages.dev` 在国内访问不一定稳定。如果要请国内老人试用，上线前先用国内网络实际打开试试。长期在国内稳定访问需要买域名、做 ICP 备案，这超出了演示版的范围。
