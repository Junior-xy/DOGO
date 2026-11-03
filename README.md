# DOGO

基于产品 PRD 与技术实施方案的 Expo 移动端（主人 / 遛狗师）、Next.js 运营后台和 Supabase PostgreSQL 后端。

## 开始运行

需要 Node.js 22.13+（本次使用 24）、npm，以及一个 Supabase 开发项目。也可安装 Docker 与 Supabase CLI 后运行本地 Supabase。

```powershell
npm ci
# 本地 Supabase（需要 Docker）
npx supabase start
npx supabase db reset
```

云端项目：依次在开发项目 SQL Editor 执行 `supabase/migrations/` 下的 SQL。不要在已有正式业务数据库直接执行未经审查的迁移。生产认证应开启邮箱验证，并设置应用 URL / 重置邮件重定向 URL。

复制 `apps/mobile/.env.example` 为 `.env`，复制 `apps/admin/.env.example` 为 `.env.local`，填入开发项目 URL 和 publishable / anon key。不得填入 service_role key。手机访问本地服务时，URL 中使用开发电脑的局域网 IP，不能使用手机的 localhost。

```powershell
npm run dev:mobile
npm run dev:admin
```

移动端通过 Expo 启动，终端按 `w` 打开 Web；管理员后台位于 http://localhost:3000。真机需使用与 Expo SDK 58 匹配的客户端或开发构建。

## 第一个管理员与演示账号

先在移动端注册主人、运营、遛狗师三个独立账号。注册请求必须带条款同意，可选择狗主人（默认）或遛狗师；遛狗师注册后直接启用，无需人工审核。运营账号先以主人身份注册。由项目拥有者在 Supabase SQL Editor 手动设置首个管理员（替换已注册的真实运营邮箱）：

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
```

后台“用户与遛狗师”仍可管理账号角色和启用状态。后台发布未来服务时段、创建 Pack、发布单次活动。仓库不包含生产账号或密码。

## 两条验收流程

1. 主人注册 → 添加狗与紧急联系人 → 预约 Solo → 管理员确认指派 → 遛狗师接受 → 主人确认接狗 → 遛狗师确认接狗、开始 → 主人确认归还 → 遛狗师归还、报告 → 主人查看报告与通知。
2. 主人申请 Pack → 管理员进入安全审核 → 视需要安排并记录首次见面 → 人工勾选安全核实、填写批准理由 → 主人单独报名活动 → 按上述双方交接流程执行并提交报告。

## DOGO PawStyle 正式问卷

正式题库为 `apps/mobile/src/pawstyle/questionnaire.json`，逐字保留用户提供的 `DOGO-DPQ-CN5-v0.1` JSON：B1–B6、D1–D45、S1–S5，共 56 题。B3、B5、S3 按多选配置（B5、S3 后续可调整）；D 题共用原始 1–5 与 X 选项。B5 选“其他”、B6 选“有，请说明”时显示文字输入；S2、S4、S5 支持原提示文字输入。S1 保留原注释。

首页和“我的 → 我的狗狗 → 填写 DOGO ti 问卷”可进入。逐题填写、分区跳转、上一题、下一题、已答题数和百分比均可用。答案以唯一 question ID 存储，例如 `{"D1":{"value":"X"},"B5":{"value":["召回","其他"],"text":"转圈"}}`。文字题可先输入说明，此时 value 为 null，尚不计入已答题数。补充文字选填，最多 2000 字。

每次选择、文字输入和导航都会自动保存到本机。点击“暂存，稍后继续”同步到账号，退出重进恢复位置和答案；使用另一设备时能恢复已暂存到账号的版本。草稿按账号、狗狗、问卷版本隔离，网络失败会提示重试，跨设备更新冲突会要求用户选择保留哪份草稿。清理浏览器数据会删除尚未同步的本机草稿。

问卷与草稿功能保持不变。第二阶段新增“保存并查看结果”和 `/results` 页面，详情见下文。原有旧版计分库及历史数据库保留但不接入 PawStyle；旧后台的题库发布入口也不控制 PawStyle 正式题库。

**已有公网环境需先在 Supabase SQL Editor 执行 `supabase/migrations/202611020007_pawstyle.sql`，再部署最新 Web。** 新环境按编号执行所有迁移。新表 `pawstyle_questionnaires` 保存题库，`pawstyle_responses` 保存答案；`save_pawstyle` 验证版本、题号、选项和访问权限。未部署迁移时只能本机填写，账号读取或暂存会显示失败提示。

## 验证

```powershell
npm test
npm run typecheck
npm run build:admin
npm run build:mobile
```

数据库测试使用 PGlite（实际 PostgreSQL WASM 引擎）加载相同业务迁移，模拟 Supabase 的 `auth.uid()` 与角色，不需要云端凭据。测试覆盖 RLS、直接写入拒绝、服务端权限、库存、重试、时间冲突、审批、双边交接、不可覆盖报告及两条完整流程。它不替代 Supabase Auth / Storage 云端联调、真实并发连接压力测试、iOS/Android 真机验收。

## 架构

- `apps/mobile`：Expo Router，主人和遛狗师界面，共享品牌 token。
- `apps/admin`：Next.js 管理台，登录后由数据库再次校验每项管理操作。
- `packages/dogo-ti`：历史 PRD 评分与回归验证，当前 PawStyle 不调用。
- `packages/domain`：Supabase 客户端、状态文案、读取模型与业务命令。
- `supabase/migrations`：关系数据、RLS、服务端计分和事务。关键写入经 `command()` 、`save_pawstyle()` 或 `submit_pawstyle()`，没有客户端提交的最终分数。
- `tests`：纯函数与 PostgreSQL 集成验证。
- `assets/brand`：用户提供的原始 Logo；没有改动品牌图形。

普通读取受 RLS 约束。主人只能读取自己的资源；遛狗师可读取本人发布的时段和分配任务，通过 `task_brief()` 获取必要联系与照顾信息，不能读取原始问卷。角色由数据库决定，注册身份仅允许 owner 和 walker，不能通过注册或修改元数据获得管理员权限。关键写入记录操作人和时间，预约库存通过行锁保护，同一遛狗师跨重叠时段通过人员锁与日历检查防冲突。

## 待完成外部验收

- 核对中文试用量表与正式商用许可；本次实现不等于量表验证或安全认证。
- 配置真实 Supabase 开发项目，联调邮箱确认、重置邮件、存储和部署迁移。
- 真机与真实并发连接测试，以及运营参数、资质审核、应急流程的团队验收。

无支付、实时 GPS、聊天或自动匹配；资料删除/导出是人工办理申请，有操作留痕，不会在点击后直接破坏历史服务记录。

## 浏览器验收环境

`tests/browser-harness.mjs` 是仅供自动测试的临时 Supabase HTTP 替身，底层执行同一 PostgreSQL 业务迁移。它只监听 127.0.0.1，数据保存在内存，不能部署或替代正式认证服务。

在一个终端设置 `DOGO_TEST_HARNESS=1` 并运行 `node tests/browser-harness.mjs`。另两个终端分别给后台和移动端设置上述公开环境变量，URL 指向 `http://127.0.0.1:54329`，key 为 `browser-test-key`，启动两端后执行 `npm run test:browser`。每次验收前重启测试服务以重置样本数据。浏览器测试需要本机安装 Chrome。

仅此临时环境的账号是 `owner@dogo.test`、`walker@dogo.test`、`admin@dogo.test`，密码均为 `DogoTest123!`。正式 PawStyle 问卷使用独立浏览器测试；旧版计分测试独立保留；PawStyle 使用提供的第二阶段计分实现和独立回归测试。

## 已知依赖告警

已将测试工具升级至 Vitest 5，消除了旧版本的严重告警。目前 npm audit 仍报告 Expo 构建工具链中 glob / minimatch 等12项中等级传递依赖告警。没有强制降级 Expo 或引入未经兼容性验证的跨主版本覆盖。发布前需随上游版本更新复核；当前构建与业务测试通过不代表依赖审计为零告警。

## 统一预约与遛狗师发布

主人底部导航为：首页、预约、遛狗活动、订单、我的。“预约”页内选择单独散步（Solo）或结伴散步（Pack），旧 `/solo`、`/packs` 链接仍可访问对应内容。

遛狗师在“发布时段”填写活动名称、当地起止时间、集合地点和说明。单独时段只有一个名额；Pack 活动只能选择本人负责且开放的小队，沿用小队集合地点，名额不能超过小队上限。发布的时间会占用遛狗师日历，和已有任务、其他已发布时段互斥。

主人在“遛狗活动”查看未来已发布的时段：单独时段预约成功后直接确认并分配给发布者；Pack 继续要求对应狗狗通过小队人工安全审核。取消单独预约后名额恢复，时段仍保留；没有有效预约时，发布者可以撤回时段，释放日历。有有效预约时需联系运营处理。运营关闭发布时段也遵循相同限制。

已有 Supabase 环境需先部署 `supabase/migrations/202611010004_walker_publications.sql`，再部署客户端。本地临时演示服务启动时会自动加载新迁移，包含一个单独时段和一个结伴活动样例。

浏览器回归在新启动的临时服务上依次运行：

```powershell
npm run test:browser
npm run test:publications
npm run test:preview
```

新增发布测试覆盖遛狗师发布两种时段、主人统一预约与活动列表、直接确认、满员提示、任务生成、已预约时段禁止撤回、未预约活动撤回。重复整套验收前需重启临时服务恢复样本。

## 主人发布需求与遛狗师接单

主人在“预约 → 发布遛狗需求”选择自己的狗狗，填写希望开始时间、时长、公开服务区域、详细交接地点和公开备注。系统计算结束时间，需求会出现在“订单”中，状态为“等待遛狗师接单”。尚未接单可随时撤回；已接单继续遵守运营配置的取消时限。

遛狗师在底部“需求广场”查看未来待接单需求并确认接单；“消息”仍可从顶部进入。接单前仅展示需求标题、时间、区域、公开备注和狗狗昵称、品种、体重。详细交接地址、照顾和紧急联系资料仅在接单后的任务中开放。接单即确认订单并生成已接单任务，继续走双方交接与服务报告流程；同一需求不能重复分配，接单时间不能与已有任务或已发布时段冲突。

默认时长为 15、30、45、60、90、120 分钟。预订已有时段时仅显示不超过该时段长度的选项，切换到较短时段会清除不再适用的时长。管理员仍可调整运营配置；新迁移只扩充原始 `[30,60]` 默认值，不覆盖自定义时长。

已有环境需先部署 `supabase/migrations/202611020005_owner_requests.sql`，再部署两端客户端。新的浏览器回归命令为 `npm run test:requests`，建议在全新启动的临时服务上运行，然后依次运行原有 `test:browser`、`test:publications`、`test:preview`。临时服务重启后需重新登录演示账号。

演示版移动端登录页现改为“以主人身份体验”和“以遛狗师身份体验”两个按钮，使用上面的临时账号登录，不渲染邮箱或密码输入框，避免浏览器自动填入真实账号。该入口仅在测试服务专用 key 下启用；正式环境继续使用邮箱注册与登录。


## 注册身份与公网更新

注册页支持“狗主人”和“遛狗师（无需审核）”。新遛狗师直接进入工作台，可查看需求和发布时段。此变更不会修改已有账号的身份，也不会取消 Pack 的狗狗安全审核。若 Supabase 开启邮箱验证，用户仍需先完成邮箱验证。

已有公网环境须先在 Supabase 的 SQL Editor 执行 `supabase/migrations/202611020006_signup_roles.sql`，再部署最新移动端 Web（Vercel）。只更新网页而未执行此迁移，数据库仍会按旧规则创建主人账号。新环境按顺序执行全部迁移。

独立注册浏览器测试：在测试服务终端设置 `DOGO_TEST_HARNESS=1`、`DOGO_TEST_SIGNUP=1`、`DOGO_TEST_PORT=54330`，运行 `node tests/browser-harness.mjs`；移动端预览设置 `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54330`、`EXPO_PUBLIC_SUPABASE_ANON_KEY=registration-test-key`，在 `apps/mobile` 运行 `npx expo start --port 8082`；最后在根目录运行 `npm run test:signup`。该服务只接受合成的 `@dogo.test` 账号，数据仅保存在内存，不连接生产环境。邮箱验证分支使用模拟无 session 响应，不发送真实邮件。


## PawStyle 浏览器验收

使用独立端口避免影响其他演示：测试服务终端设置 `DOGO_TEST_HARNESS=1`、`DOGO_TEST_PORT=54331` 后运行 `node tests/browser-harness.mjs`；Expo 终端设置 `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331`、`EXPO_PUBLIC_SUPABASE_ANON_KEY=browser-test-key`，在 `apps/mobile` 运行 `npx expo start --port 8083`；根目录运行 `npm run test:pawstyle`。每次完整验收前重启测试服务以重置内存数据。


## PawStyle 第二阶段：结果与复测

沿用 Expo 58 / React Native / Expo Router，不重构问卷或数据库草稿。提供的 `pawstyle-scoring.ts` 原样保存在 `apps/mobile/src/pawstyle/`；`profile.ts` 将现有 `{questionId: {value, text}}` 答案适配为核心题原值并生成观察基础提醒。四张原始 PNG 放在 Expo 应用的 `apps/mobile/public/images/pawstyle/`，导出后网址为清单中的 `/images/pawstyle/*.png`；原生端通过同一文件的静态 require 引用。

点击“保存并查看结果”会先保存当前答案，再由服务器以 `mean-strict-v1` 计算并建立结果记录。分面三题全有效、因子所有分面全有效才计算；X 和未答不插值；只用 E/P 两轴分类。完整结果包括正式类型与图片、E/P 两轴标签、五因子、15 分面、有效核心题数、缺失题号、观察背景提示、独立 S1–S5 事件及版本。混合和待补充使用 DOGO 通用图片；4:3 展示窗缩放裁切隐藏原图白边及下部非正式英文标题，最大显示宽度 360px。

结果表 `pawstyle_results` 保存整份原始 B/D/S 答案、反向处理值、15 分面、五因子、E/P、类型、完整度、版本和时间，用户仅可读取自己的记录，不可直接更新或删除。服务端从已保存草稿计算，不接受客户端提交的最终分数；同一草稿修订的重复提交返回同一记录。修改答案并复测会创建新草稿修订和新结果，旧记录不受影响。单独暂存仍不会生成结果。已有草稿无需转换，保存并查看结果即可计分。

### 公网部署

在 Supabase SQL Editor 执行 `supabase/migrations/202611020008_pawstyle_results.sql`（需先完成 007 迁移），再部署最新 Expo Web。无需更改环境变量。检查四个 `/images/pawstyle/*.png` 地址返回 PNG，而非 SPA 首页。此迁移不修改现有 Pack 安全审核或预约权限。

### 在 App 中验收

1. 主人登录 → 首页“填写 DOGO ti 问卷”或“我的 → 我的狗狗 → 填写 DOGO ti 问卷”，选择狗狗。
2. 继续已有草稿，或填写 B、D、S；可以暂存、退出并重新进入。
3. 点击“保存并查看结果”。D 题全部选 3 应为混合倾向；D17 选 X 时 P 和相关因子待补充，不分配四类画像。
4. 查看两轴、五维、完整度、观察背景、独立情境和版本；点击“查看 15 个分面”。
5. 点击“修改答案并复测”，修改答案后再次保存并查看结果。结果页底部能切换历次记录；“我的 → 我的狗狗 → 查看 DOGO ti 结果与历史”可重新访问。

### 自动验证

`npm test` 验证四类、缺失、中间值、反向计分、轻微分界、图片内容与清单一致、前后端数值一致及历史权限。`tests/pawstyle-samples.json` 中的 example 是为了核对实施说明所列数值而构造的 45 题测试数据，不冒充未提供的团队原始示例答案。

独立测试环境：`DOGO_TEST_HARNESS=1`、`DOGO_TEST_PORT=54332` 启动 `node tests/browser-harness.mjs`；Expo 设置 URL 为 `http://127.0.0.1:54332`、key 为 `browser-test-key`，运行 `npx expo start --port 8084`。执行 `npm run test:pawstyle-results` 检查所有类型、混合、待补充、画像加载和裁切、历史及结果保存失败重试。每次完整测试先重启内存测试服务。原问卷回归用 `DOGO_PAWSTYLE_PREVIEW_URL=http://localhost:8084 npm run test:pawstyle`（PowerShell 用 `$env:DOGO_PAWSTYLE_PREVIEW_URL='http://localhost:8084'` 设置），两套测试之间也需重置服务。

## 品牌与主人档案更新

界面名称统一为 **DOGO ti**；官方问卷原文、JSON 名称、版本号、计分函数和已有答案键保持不变。新版 Logo 原图保存在 `assets/brand/dogo-logo.png`，`BrandLogo.tsx` 只裁切显示外围黑边。主色使用奶油白、草绿和橙色。首页 Solo / Pack 分别使用单爪印和三爪印，主人活动导航使用单个狗爪印图标。

“我的”页优先展示狗狗档案、“我的狗狗”形象及结果入口，密码和隐私设置默认折叠；通过密码恢复链接进入时自动展开密码设置。

**上线前**：在 Supabase SQL Editor 执行 `supabase/migrations/202611020009_dog_removal.sql`（依赖现有 001–008），再部署新版应用。删除按钮位于“我的 → 管理狗狗档案”，支持取消与确认。删除为归档操作：狗狗不再出现在预约、问卷和常用档案列表；历史服务、问卷和结果记录仍保存在数据库。存在未完成 Solo、Pack 订单或服务任务时禁止删除。仅狗主人能删除自己的档案，重复请求不会重复执行。

验证：`npm test`、`npm run typecheck`、`npm run build:mobile`。另用独立测试服务端口 54333 和 Expo 8085（同上述方法设置测试环境变量）运行 `npm run test:owner-polish`，检查图标、形象与结果入口、折叠设置、删除取消/刷新/订单保护。用非演示 key `registration-test-key` 启动 Expo 可额外验证密码设置折叠。测试仅用本地合成账号；不要将测试地址和 key 用于正式部署。

画像使用界面裁切，不改动四张原始 PNG。四类性格、混合与待补充的简明描述由展示层统一提供，个人页和结果页一致；原始计分参考、保存的历史结果和题库不变。活动导航采用单色狗爪印，并统一底栏图标容器高度与文字基线。
