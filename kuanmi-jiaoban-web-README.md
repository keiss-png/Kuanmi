# 宽米 · 交班本

给妈妈用的"自适应追问式每日交班"网页 + 给你用的"规律分析 / SOP 草稿"看板，配合飞书自定义机器人做每日提醒。

## 这套东西是什么

- `/`（妈妈端）：打开就是一句问话，她随便打几个字。AI 视情况追问 1-2 句细节，最多 3 轮就收尾，不啰嗦。
- `/manage`（你自己看）：所有记录的列表，点一下"分析规律"，AI 会把重复出现的问题聚合起来，标"出现 N 次"，并起草一份 SOP 步骤给你参考。
- 飞书自定义机器人：每天定时在"宽米群"发一条消息，带一个链接，点开就是妈妈端页面。

两个页面都靠 URL 里的 `?key=xxx` 参数做访问控制，不是公开可查的页面。

## 你需要准备的账号（都有免费额度，够这个场景用很久）

1. **GitHub** — 放代码（也可以用 Vercel CLI 直接部署，不一定需要 GitHub，见下文"不用 GitHub 的部署方式"）
2. **Vercel**（vercel.com）— 部署网站 + 跑每天的定时任务
3. **Upstash**（upstash.com）— 免费的 Redis 数据库，存交班记录
4. **Anthropic Console**（console.anthropic.com）— 获取 API Key，需要绑卡，这个用量级别每月大概几块钱人民币
5. **飞书群里的自定义机器人 webhook 地址** — 你已经确认过可以加

## 部署步骤

### 第一步：申请 Anthropic API Key
1. 登录 console.anthropic.com
2. 左侧 API Keys，创建一个新的 Key，复制保存好（只显示一次）
3. 需要先绑定一张卡并充值一点余额（几十块人民币就能用很久）

### 第二步：创建 Upstash Redis
1. 登录 upstash.com（可以用 GitHub 账号直接登录）
2. Create Database，随便起个名字，region 选离你近的（比如新加坡）
3. 创建后进入数据库详情页，找到 **REST API** 这一栏，复制 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`

### 第三步：在飞书群里加自定义机器人
1. 进入"宽米群" → 设置 → 群机器人 → 添加机器人 → 自定义机器人
2. 起个名字（比如"交班提醒"），安全设置选"自定义关键词"（填一个关键词比如"交班"）或者"签名校验"
3. 复制生成的 webhook 地址，形如 `https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx`
4. 如果选的是"签名校验"，把对应密钥也记下来（对应 `.env` 里的 `FEISHU_SECRET`）；如果选的是"自定义关键词"，`FEISHU_SECRET` 留空

### 第四步：生成访问密钥
在电脑终端（Mac 自带终端，或者随便找一台能跑命令的电脑）运行：
```
openssl rand -hex 16
```
生成的一串字符就是 `ACCESS_KEY`，保存好，这是妈妈端和你自己看板页面的"密码"。

### 第五步：部署到 Vercel

**方式 A：通过 GitHub（推荐，方便以后改代码）**
1. 把这个项目文件夹传到一个新的 GitHub 仓库（可以直接在 GitHub 网页上传，或者用 `git init` + `git push`）
2. 登录 vercel.com，New Project，选择这个仓库，Import
3. 部署前会让你填环境变量（Environment Variables），把下面这些一次性填进去：
   - `ANTHROPIC_API_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ACCESS_KEY`
   - `FEISHU_WEBHOOK_URL`
   - `FEISHU_SECRET`（可留空）
   - `CRON_SECRET`（自己再生成一串随机字符串，比如再跑一次 `openssl rand -hex 16`）
   - `APP_URL` 先随便填一个占位值（比如 `https://placeholder.vercel.app`），等部署完拿到真实域名后回来改成真实值，改完要 **Redeploy** 一次
4. 点 Deploy，等它跑完，会给你一个形如 `https://kuanmi-jiaoban-xxx.vercel.app` 的域名
5. 回到 Vercel 项目设置 → Environment Variables，把 `APP_URL` 改成这个真实域名，然后重新部署一次（Deployments 页面右上角 Redeploy）

**方式 B：不用 GitHub，直接用命令行部署**
```
npm install -g vercel
cd kuanmi-jiaoban-web
vercel
```
跟着提示操作，第一次会让你登录 Vercel 账号并把项目关联到一个新项目。之后同样需要在 Vercel 网页后台把环境变量填好（跟方式 A 的第 3-5 步一样）。

### 第六步：测试

1. 访问 `https://你的域名.vercel.app/?key=你的ACCESS_KEY`，应该能看到妈妈端的对话界面，试着聊几句
2. 访问 `https://你的域名.vercel.app/manage?key=你的ACCESS_KEY`，应该能看到刚才记的那条记录
3. 测试飞书推送：直接在浏览器访问 `https://你的域名.vercel.app/api/cron/push`（记得带上正确的 `CRON_SECRET`，可以用 Postman 或者命令行 `curl -H "Authorization: Bearer 你的CRON_SECRET" https://你的域名.vercel.app/api/cron/push`），看飞书群里有没有收到消息

### 第七步：把链接给妈妈

把 `https://你的域名.vercel.app/?key=你的ACCESS_KEY` 这个完整链接发给她，让她"添加到主屏幕"（iPhone：分享按钮 → 添加到主屏幕），以后点桌面图标就能直接用，不用每次找链接。

飞书机器人每天推送的消息里也会自动带上这个链接，她直接点消息里的链接也一样能用。

## 关于定时推送的时间

`vercel.json` 里配置的是每天 UTC 12:00，也就是北京时间晚上 8 点。如果想改时间，把 `vercel.json` 里的 `"0 12 * * *"` 改一下（cron 表达式是"分 时 日 月 周"，时间是 UTC，北京时间 = UTC + 8 小时）。改完要重新部署一次。

## 隐私和安全说明

- `ACCESS_KEY` 相当于密码，请不要把带 key 的链接发到公开的地方（比如朋友圈、公开群），只发给需要用的人
- 所有记录存在你自己的 Upstash 账号下，别人拿不到
- 如果链接不小心泄露了，直接改 `ACCESS_KEY`（重新生成一串、更新 Vercel 环境变量、重新部署），旧链接就失效了
