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

先在移动端注册主人、运营、遛狗师三个独立账号。注册请求必须带条款同意，公开注册永远只生成 owner 角色。由项目拥有者在 Supabase SQL Editor 手动设置首个管理员（替换已注册的真实运营邮箱）：

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
```

此后使用后台“用户与遛狗师”审核并启用遛狗师账号。后台发布未来服务时段、创建 Pack、发布单次活动。仓库不包含生产账号或密码。

## 两条验收流程

1. 主人注册 → 添加狗与紧急联系人 → 预约 Solo → 管理员确认指派 → 遛狗师接受 → 主人确认接狗 → 遛狗师确认接狗、开始 → 主人确认归还 → 遛狗师归还、报告 → 主人查看报告与通知。
2. 主人申请 Pack → 管理员进入安全审核 → 视需要安排并记录首次见面 → 人工勾选安全核实、填写批准理由 → 主人单独报名活动 → 按上述双方交接流程执行并提交报告。

## Dogo Ti 原文依赖

现有 PRD **没有** B1–B6、D1–D45、S1–S6 题干和“豆豆”45题示例答案。未编造或默认发布问卷；在正式原文到位前，测评入口显示未发布。计分算法已严格按 PRD 第6节实现，并测试反向、缺失、中点、四类与临界倾向。

后台“运营设置”支持发布完整版本 JSON：

```json
{
  "version": "团队确认的问卷版本",
  "questions": [
    { "code": "B1", "text": "从正式原文填入", "options": ["正式选项"] }
  ]
}
```

示例仅说明格式；实际必须包含全部57个唯一题号及真实题干，否则服务端拒绝发布。D题固定为1–5与X，其他题可配置选项或文本。重测生成新记录；已提交答案及报告不可覆盖。情境回答独立记录，必须由人工理解。

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
- `packages/dogo-ti`：PRD 分面映射与纯 TypeScript 评分，供预览与回归验证。
- `packages/domain`：Supabase 客户端、状态文案、读取模型与业务命令。
- `supabase/migrations`：关系数据、RLS、服务端计分和事务。所有关键写入经 `command()`，没有客户端提交的最终分数。
- `tests`：纯函数与 PostgreSQL 集成验证。
- `assets/brand`：用户提供的原始 Logo；没有改动品牌图形。

普通读取受 RLS 约束。主人只能读取自己的资源；遛狗师只能读取分配任务，通过 `task_brief()` 获取必要联系与照顾信息，不能读取原始问卷。角色由数据库决定，不信任注册元数据。关键写入记录操作人和时间，预约库存通过行锁保护，同一遛狗师跨重叠时段通过人员锁与日历检查防冲突。

## 待完成外部验收

- 提供完整原问卷和“豆豆”算例后，发布题库并核对标准答案。
- 配置真实 Supabase 开发项目，联调邮箱确认、重置邮件、存储和部署迁移。
- 真机与真实并发连接测试，以及运营参数、资质审核、应急流程的团队验收。

无支付、实时 GPS、聊天或自动匹配；资料删除/导出是人工办理申请，有操作留痕，不会在点击后直接破坏历史服务记录。

## 浏览器验收环境

`tests/browser-harness.mjs` 是仅供自动测试的临时 Supabase HTTP 替身，底层执行同一 PostgreSQL 业务迁移。它只监听 127.0.0.1，数据保存在内存，不能部署或替代正式认证服务。

在一个终端设置 `DOGO_TEST_HARNESS=1` 并运行 `node tests/browser-harness.mjs`。另两个终端分别给后台和移动端设置上述公开环境变量，URL 指向 `http://127.0.0.1:54329`，key 为 `browser-test-key`，启动两端后执行 `npm run test:browser`。每次验收前重启测试服务以重置样本数据。浏览器测试需要本机安装 Chrome。

仅此临时环境的账号是 `owner@dogo.test`、`walker@dogo.test`、`admin@dogo.test`，密码均为 `DogoTest123!`。测试会发布明确标记的合成题目验证57题与草稿流程；正式数据库不包含这些题目。

## 已知依赖告警

已将测试工具升级至 Vitest 5，消除了旧版本的严重告警。目前 npm audit 仍报告 Expo 构建工具链中 glob / minimatch 等12项中等级传递依赖告警。没有强制降级 Expo 或引入未经兼容性验证的跨主版本覆盖。发布前需随上游版本更新复核；当前构建与业务测试通过不代表依赖审计为零告警。
