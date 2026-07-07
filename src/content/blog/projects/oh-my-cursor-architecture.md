---
title: oh-my-cursor 架构文档：如何让 Cursor Agent 拥有工作流、角色和记忆
description: OMC v0.1.0 技术架构全解析——规则层、技能层、角色层、MCP 服务器、CLI、状态管理和测试架构。
pubDate: 2026-04-04
updatedDate: 2026-04-04
author: 谢韬
project: oh-my-cursor
tags:
  - oh-my-cursor
  - cursor
  - architecture
  - mcp
  - agent
---

> 项目：[oh-my-cursor (OMC)](https://github.com/TaoXieSZ/oh-my-cursor)

---

## 概要

本文是 oh-my-cursor（OMC）v0.1.0 的技术架构文档。如果[设计文档](/blog/oh-my-cursor-design-doc/)回答的是 "为什么做" 和 "做什么"，这篇回答的是 "怎么做" 和 "代码在哪"。

---

## 一、系统架构总览

```
┌─────────────────────────────────────────────┐
│                  Cursor IDE                  │
│                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│   │  Rules    │  │  Skills  │  │  Task    │ │
│   │  (.mdc)   │  │ (SKILL.md)│  │  Tool   │ │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│        │              │              │       │
│   ┌────┴──────────────┴──────────────┴────┐ │
│   │          OMC Orchestration Layer       │ │
│   │                                       │ │
│   │  ┌─────────┐  ┌──────────┐  ┌──────┐ │ │
│   │  │ Workflow │  │  Roles   │  │ State│ │ │
│   │  │ Engine  │  │  Layer   │  │ Mgmt │ │ │
│   │  └─────────┘  └──────────┘  └──┬───┘ │ │
│   └─────────────────────────────────┼─────┘ │
│                                     │       │
│   ┌─────────────────────────────────┴─────┐ │
│   │       MCP Servers (stdio)             │ │
│   │  omc-state │ omc-memory               │ │
│   └───────────────────────────────────────┘ │
│                       │                     │
│   ┌───────────────────┴───────────────────┐ │
│   │           .omc/ (disk)                │ │
│   │  state/ plans/ logs/ notepad.md       │ │
│   │  project-memory.json                  │ │
│   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

OMC 由六个层级构成，每个层级都对应 Cursor 的一种原生机制：

| 层级 | Cursor 原生机制 | OMC 组件 | 文件位置 |
|------|----------------|---------|---------|
| 行为契约 | `.cursor/rules/*.mdc` | 3 条编排规则 | `rules/` |
| 工作流技能 | `~/.cursor/skills/*/SKILL.md` | 12 个技能 | `skills/` |
| 角色提示词 | 手动注入 Task tool prompt | 10 个角色文件 | `prompts/` |
| 状态持久化 | MCP 工具调用 | 2 个 MCP 服务器 | `src/mcp/` |
| CLI 工具 | 命令行 | `omc` CLI | `src/cli/` |
| 状态运行时 | 文件系统 | 状态管理模块 | `src/state/` |

## 二、目录结构

```
oh-my-cursor/
├── src/
│   ├── cli/              # omc 命令行入口
│   │   ├── omc.ts        # bin entry point
│   │   ├── index.ts      # command router
│   │   ├── setup.ts      # omc setup — install all components
│   │   ├── doctor.ts     # omc doctor — verify installation
│   │   ├── status.ts     # omc status — show runtime state
│   │   └── __tests__/    # CLI integration tests
│   ├── mcp/
│   │   ├── state-server.ts   # omc-state MCP server
│   │   ├── memory-server.ts  # omc-memory MCP server
│   │   └── __tests__/        # MCP integration tests
│   ├── state/
│   │   ├── paths.ts      # all .omc/ path helpers
│   │   ├── mode-state.ts # mode lifecycle (start/update/complete/cancel)
│   │   ├── session.ts    # session ID management
│   │   ├── index.ts      # public API barrel
│   │   └── __tests__/    # state unit tests
│   └── utils/
│       ├── fs.ts         # ensureDir, safeWriteFile
│       ├── paths.ts      # package & installation path resolution
│       ├── log.ts        # colored console output
│       └── __tests__/
├── rules/                # Cursor rules (.mdc)
│   ├── omc-orchestration.mdc  # top-level operating contract
│   ├── omc-workflow.mdc       # workflow stages & entry logic
│   └── omc-state.mdc         # state directory & lifecycle spec
├── skills/               # Cursor skills (SKILL.md per skill)
│   ├── omc-deep-interview/
│   ├── omc-blueprint/
│   ├── omc-forge/
│   ├── omc-team/
│   ├── omc-autopilot/
│   ├── omc-web-clone/
│   └── ... (12 total)
├── prompts/              # agent role prompt files
│   ├── executor.md
│   ├── architect.md
│   ├── debugger.md
│   └── ... (10 total)
├── templates/            # starter files for customization
│   ├── skill/SKILL.md
│   ├── prompt/role.md
│   ├── init/omc-config.json
│   └── README.md
├── package.json
└── tsconfig.json
```

## 三、规则层：三条 `.mdc` 文件

Cursor 的 rules 是 agent 在每次对话开始时自动加载的指令。OMC 使用三条规则覆盖所有行为：

### `omc-orchestration.mdc` — 顶层契约（127 行）

这是 OMC 的"宪法"。定义了：

- **操作原则**：直接解决 > 委派 > 升级
- **关键词路由**：用户说 "forge" → 激活 `$forge` 技能；说 "debug this" → 切换 `debugger` 角色
- **角色目录**：10 个角色的元数据（posture、complexity、purpose）
- **委派决策树**：`$deep-interview` → `$blueprint` → `$forge`/`$team` → direct
- **验证契约**：声明完成前必须有证据
- **状态生命周期**：write on start → update on change → mark complete

### `omc-workflow.mdc` — 工作流阶段定义

定义标准四阶段流水线和 entry-point 选择逻辑：

| 信号 | 入口 |
|------|------|
| 需求模糊、用户说"别假设" | `$deep-interview` |
| 需求清楚但需要架构评审 | `$blueprint` |
| 计划已批准，单线程执行 | `$forge` |
| 计划已批准，多线程并行 | `$team` |
| 简单任务 | 直接执行 |

### `omc-state.mdc` — 状态目录和生命周期规范

定义 `.omc/` 的目录结构、文件命名约定（`{mode}-state.json`）、和每种状态的 JSON schema。

## 四、技能层：12 个 SKILL.md

每个技能是一个自包含的工作流定义。当用户触发关键词时，Cursor Agent 读取对应的 `SKILL.md` 并按照指令执行。

### 核心工作流技能

| 技能 | 触发词 | 功能 |
|------|--------|------|
| `$deep-interview` | "interview", "clarify" | 每轮一个问题，Socratic 式澄清需求 |
| `$blueprint` | "blueprint", "plan this" | 结构化共识规划：架构→权衡→测试策略→批准 |
| `$forge` | "forge", "don't stop" | 持久完成循环：实现→验证→修复→迭代 |
| `$team` | "team", "parallel" | Task tool 并行派发，角色感知的子 agent |

### 工具技能

| 技能 | 触发词 | 功能 |
|------|--------|------|
| `$plan` | "plan" | 轻量规划（不需要共识审议时用） |
| `$analyze` | "analyze" | 深度代码分析 |
| `$tdd` | "tdd", "test first" | 测试驱动开发循环 |
| `$code-review` | "code review" | PR 级别的 diff 审查 |
| `$cancel` | "cancel", "stop" | 取消活跃模式 |
| `$ecomode` | "eco", "budget" | token 省流模式 |

### 高级技能

| 技能 | 触发词 | 功能 |
|------|--------|------|
| `$autopilot` | "autopilot", "build me" | 完整生命周期：澄清→规划→执行→QA→审查→清理 |
| `$web-clone` | "web-clone", "clone site" | URL→本地副本：提取→规划→生成→比对→迭代 |

### 技能的内部结构

以 `$forge` 为例：

```markdown
# omc-forge

> Persistent completion loop — don't stop until done.

## When to use
- [触发条件列表]

## Protocol
Phase 1: Load → 读取计划和状态
Phase 2: Implement → 执行代码更改
Phase 3: Verify → 运行测试/lint
Phase 4: Fix → 修复验证失败
Phase 5: Loop or Done → 未完成则回到 Phase 2

## State management
Writes to: .omc/state/forge-state.json
Schema: { mode, phase, iteration, started_at, ... }

## Exit conditions
- 所有计划项完成 + 测试通过
- 用户说 cancel
- 连续 3 次迭代无进展
```

## 五、角色层：10 个 Agent 人格

角色文件是 OMC 和普通 Cursor 使用的核心差异之一。每个角色定义了 Agent 的"性格"。

### 角色 schema

```markdown
---
name: <角色名>
description: <一句话描述>
complexity: <low | standard | high>
posture: <fast-lane | deep-worker | read-only>
---

<identity>
你是 OMC 的 [角色名]。你的职责是……
</identity>

<constraints>
- 你不做 X
- 你必须在 Y 之前 Z
</constraints>

<execution_loop>
1. 评估输入
2. 执行核心动作
3. 验证结果
4. 汇报
</execution_loop>

<output_contract>
你的输出格式是：
- 每次回复以 [ROLE: name] 开头
- 包含 evidence 段落
</output_contract>
```

### 角色在 `$team` 中的使用

`$team` 技能在派发子 agent 时，会：
1. 读取目标角色的 `.md` 文件
2. 将角色内容注入 Task tool 的 prompt 参数
3. 根据角色的 `complexity` 元数据选择模型：low → fast，standard/high → default

```
$team 3:executor,test-engineer,security-reviewer
       ^  ^         ^              ^
    workers  role 1    role 2        role 3
```

## 六、MCP 服务器：结构化的状态接口

OMC 提供两个 MCP 服务器，通过 stdio 传输。技能和规则通过 MCP 工具调用来管理状态，而不是直接读写文件。

### omc-state（8 个工具）

| 工具名 | 参数 | 功能 |
|--------|------|------|
| `state_read` | mode: string | 读模式状态 |
| `state_write` | mode, state: object | 写模式状态 |
| `state_list` | — | 列出所有活跃模式 |
| `plan_read` | filename | 读计划文件 |
| `plan_write` | filename, content | 写计划文件 |
| `plan_list` | — | 列出所有计划 |
| `notepad_read` | — | 读临时笔记 |
| `notepad_append` | text | 追加到笔记 |

实现特点：
- 路径全部通过 `src/state/paths.ts` 集中管理
- 所有写操作自动 `ensureDir`
- 状态文件是 JSON，计划文件是 Markdown

### omc-memory（5 个工具）

| 工具名 | 参数 | 功能 |
|--------|------|------|
| `memory_get` | key | 读键值 |
| `memory_set` | key, value | 写键值 |
| `memory_delete` | key | 删除键 |
| `memory_list` | — | 列出所有键 |
| `memory_clear` | — | 清空（破坏性） |

底层是单文件 JSON store（`project-memory.json`），适合项目级的跨会话记忆（比如"这个项目偏好 pnpm"、"主分支是 develop"）。

### MCP 配置

`omc setup` 会在 `.cursor/mcp.json` 中注册：

```json
{
  "mcpServers": {
    "omc-state": {
      "command": "node",
      "args": ["<path>/dist/mcp/state-server.js"]
    },
    "omc-memory": {
      "command": "node",
      "args": ["<path>/dist/mcp/memory-server.js"]
    }
  }
}
```

## 七、CLI：`omc` 命令

CLI 有三个命令，纯 TypeScript 实现，零运行时依赖。

### `omc setup`

安装全部组件到 Cursor：

```
1. 拷贝 rules/*.mdc    → ~/.cursor/rules/    (user) 或 .cursor/rules/    (project)
2. 拷贝 skills/*/       → ~/.cursor/skills/    (user) 或 .cursor/skills/  (project)
3. 拷贝 prompts/*.md    → ~/.cursor/omc-prompts/ (user) 或 .omc/prompts/  (project)
4. 注册 MCP 服务器       → .cursor/mcp.json
5. 创建 .omc/ 状态目录
```

`--scope user`（默认）：安装到 `~/.cursor/`，所有项目共享。
`--scope project`：安装到当前项目的 `.cursor/` 和 `.omc/`。

### `omc doctor`

验证安装健康度：

```
✓ Rules directory exists (3 rules installed)
✓ Skills directory exists (12 skills installed)
✓ MCP config file exists (2 servers registered)
✓ State directory exists
✓ Role prompts installed (10 prompts)
```

每项检查返回 `✓` / `✗` 和具体计数，方便排查安装问题。

### `omc status`

显示运行时状态：

```
Active modes: forge (iteration 3, phase: verify)
Session: abc123
Plans: prd-auth.md, test-spec-auth.md
```

## 八、状态管理运行时

`src/state/` 是 OMC 的状态核心，为 CLI 和 MCP 服务器提供共享的状态操作 API。

### 路径解析（`paths.ts`）

所有 `.omc/` 路径通过一组纯函数生成：

```typescript
getBaseStateDir()           → process.cwd() + "/.omc"
getModeStatePath("forge")   → .omc/state/forge-state.json
getPlanPath("prd-auth.md")  → .omc/plans/prd-auth.md
getSessionPath()            → .omc/state/session.json
getNotepadPath()            → .omc/notepad.md
getProjectMemoryPath()      → .omc/project-memory.json
```

### 模式生命周期（`mode-state.ts`）

每个活跃模式（forge、team、blueprint 等）有一个 JSON 状态文件：

```typescript
interface ModeState {
  mode: string;
  active: boolean;
  phase: string;
  iteration: number;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  metadata: Record<string, unknown>;
}
```

提供五个生命周期函数：

| 函数 | 作用 |
|------|------|
| `startMode(mode, phase, metadata?)` | 创建新状态，active=true |
| `updateMode(mode, phase, metadata?)` | 更新阶段、递增迭代 |
| `completeMode(mode)` | 标记 active=false，写入 completed_at |
| `cancelMode(mode)` | 同 complete，phase 标记为 "cancelled" |
| `listActiveModes()` | 扫描 state/ 目录，返回所有 active=true 的模式 |

### 会话管理（`session.ts`）

用 `crypto.randomUUID()` 生成会话 ID，写入 `.omc/state/session.json`。会话用于关联同一工作流中的多次对话。

## 九、测试架构

75 个测试，分三层：

| 层级 | 文件 | 测试数 | 覆盖内容 |
|------|------|--------|---------|
| 单元 | `utils/__tests__/*.test.ts` | ~15 | 文件工具、路径解析 |
| 单元 | `state/__tests__/*.test.ts` | ~30 | 模式状态、路径、会话 |
| 集成 | `cli/__tests__/cli.test.ts` | ~20 | setup/doctor/status 全流程 |
| 集成 | `mcp/__tests__/mcp.test.ts` | ~10 | MCP 服务器 stdio 通信 |

全部使用 Node.js 内置 `node --test`，零测试框架依赖。

每次测试使用临时目录（`mkdtemp`），测试结束后清理。MCP 测试通过子进程启动服务器，用 `@modelcontextprotocol/sdk/client` 连接。

## 十、安装与分发

```bash
# 全局安装
npm install -g oh-my-cursor

# 安装到 Cursor
omc setup

# 验证
omc doctor
```

npm 包包含：
- `dist/` — 编译后的 JS
- `rules/` — .mdc 规则文件
- `skills/` — SKILL.md 技能文件
- `prompts/` — 角色提示词
- `templates/` — 自定义模板

依赖：
- 运行时：`@modelcontextprotocol/sdk` ^1.12.1（MCP 服务器通信）
- 构建时：`typescript` ^5.7.0, `@types/node` ^22.0.0

目标：Node.js >= 20。

## 十一、数据流示例

以用户说 `$forge implement the auth module` 为例：

```
User: "$forge implement the auth module"
  │
  ▼
Cursor Agent 加载 omc-orchestration.mdc
  │  keyword "forge" 匹配 → 读取 omc-forge/SKILL.md
  ▼
$forge 技能激活
  │
  ├─ Phase 1: Load
  │    MCP call: state_read("forge")     → 无历史状态
  │    MCP call: plan_list()              → ["prd-auth.md"]
  │    MCP call: plan_read("prd-auth.md") → 读取已有计划
  │
  ├─ Phase 2: Implement
  │    MCP call: state_write("forge", {phase:"implement", iteration:1})
  │    Agent 执行代码更改...
  │
  ├─ Phase 3: Verify
  │    MCP call: state_write("forge", {phase:"verify", iteration:1})
  │    Agent 运行 tests, lint...
  │
  ├─ Phase 4: Fix (如果验证失败)
  │    MCP call: state_write("forge", {phase:"fix", iteration:2})
  │    Agent 修复问题...
  │    → 回到 Phase 3
  │
  └─ Phase 5: Complete
       MCP call: state_write("forge", {active:false, completed_at:"..."})
       Agent 输出完成报告
```

## 十二、扩展点

OMC 设计了三个主要扩展点：

### 自定义技能

复制 `templates/skill/SKILL.md`，放入 `~/.cursor/skills/omc-<name>/SKILL.md`，在 `omc-orchestration.mdc` 的关键词表中添加路由。

### 自定义角色

复制 `templates/prompt/role.md`，修改四个 section，放入安装目录。`$team` 会自动发现新角色。

### MCP 扩展

omc-state 和 omc-memory 的工具列表可以在 TypeScript 层扩展。新工具只需在 `ListToolsRequestSchema` handler 中注册，在 `CallToolRequestSchema` handler 中实现。

---

## 附录：技术决策记录

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|---------|------|
| 语言 | TypeScript | Rust, Python | npm 生态 + Cursor 用户的技术栈匹配 |
| 测试框架 | `node --test` | Jest, Vitest | 零依赖，Node 20+ 内置 |
| 模块系统 | ESM | CJS | 2026 年的默认选择 |
| MCP 传输 | stdio | SSE | Cursor 原生支持 stdio |
| 状态格式 | JSON | SQLite, YAML | 简单、可 grep、MCP 友好 |
| 规则拆分 | 3 个 .mdc | 单文件 | 关注点分离，团队协作友好 |

---

> 代码仓库：[github.com/TaoXieSZ/oh-my-cursor](https://github.com/TaoXieSZ/oh-my-cursor)
>
> 设计文档：[oh-my-cursor 设计文档](/blog/oh-my-cursor-design-doc/)
