---
title: Claude Code 源码深度分析：一个工业级 AI Agent 是怎么炼成的
description: 基于 @anthropic-ai/claude-code v2.1.88 反编译源码，从 Agent 循环、工具系统、权限模型、上下文压缩到多代理协作，完整拆解 Claude Code 的技术架构，并与 Copilot、Cursor、Devin 做横向对比。
pubDate: 2026-03-31
author: 谢韬
project: claude-code
tags:
  - claude-code
  - ai-agent
  - source-analysis
  - llm
  - anthropic
  - mcp
---

# Claude Code 技术深度报告

> 基于 `@anthropic-ai/claude-code` v2.1.88 源码分析
> 面向：有软件工程经验但大模型开发经验较少的工程师

---

## 一、项目本质：它到底是什么？

Claude Code 是 Anthropic 官方出品的 **AI 编程助手命令行工具**（CLI）。你可以把它理解为：

**一个运行在终端里的"AI 程序员同事"** —— 它能读你的代码、改你的文件、跑你的命令、搜索网页，甚至能同时派出多个"分身"并行工作。

与 GitHub Copilot（主要在编辑器中做代码补全）不同，Claude Code 是一个 **自主代理（Autonomous Agent）**：你描述一个任务，它自己规划步骤、调用工具、反复迭代，直到完成。

### 类比理解

| 概念 | 传统软件类比 |
|------|------------|
| Claude Code | 一个能自己操作电脑的实习生 |
| 系统提示词（System Prompt） | 给实习生的"入职培训手册" |
| 工具（Tools） | 实习生被授权使用的"办公工具"（文件编辑器、终端、浏览器等） |
| 权限系统 | "哪些操作要请示主管、哪些可以自己做" |
| Agent 循环 | 实习生的"思考-行动-观察"工作循环 |
| 上下文压缩（Compact） | 实习生的"笔记本"太满了，需要整理摘要 |

---

## 二、整体架构概览

```
用户在终端输入
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  CLI 入口 (cli.tsx)                                  │
│  快速路由：--version / --daemon / --worktree / ...   │
│  默认路径 → 加载 main.tsx                             │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  主应用 (main.tsx)                                   │
│  Commander CLI 框架 + 认证 + 配置 + 插件加载          │
│  最终启动 → REPL 交互界面                             │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  REPL 界面 (screens/REPL.tsx)                        │
│  React + Ink 终端 UI 框架                            │
│  用户输入 → 触发 query() 循环                         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Agent 循环 (query.ts) ← 核心中的核心                 │
│                                                      │
│  while (true) {                                      │
│    1. 组装系统提示词 + 上下文                          │
│    2. 调用 Anthropic API（流式输出）                   │
│    3. 模型返回文本 → 展示给用户                        │
│    4. 模型返回 tool_use → 执行工具                     │
│    5. 工具结果 → 放回消息列表                          │
│    6. 如果没有更多工具调用 → 结束                      │
│    7. 否则 → continue（下一轮循环）                    │
│  }                                                   │
└─────────────────────────────────────────────────────┘
```

### 关键概念解释

**Agent 循环**（Agent Loop）是整个系统的心脏。大模型本身只能"读文字、写文字"，它无法直接操作文件系统或运行命令。Claude Code 通过以下方式让大模型具备了"行动力"：

1. 告诉模型"你有这些工具可以用"（通过 API 的 `tools` 参数）
2. 模型在回复中说"我想调用 Bash 工具，参数是 `ls -la`"
3. Claude Code 真正执行这个命令，把结果返回给模型
4. 模型看到结果，决定下一步做什么
5. 重复此过程，直到任务完成

这就是所谓的 **ReAct 模式**（Reasoning + Acting）—— 大模型不断"思考→行动→观察→再思考"。

---

## 三、核心子系统详解

### 3.1 工具系统（Tool System）

这是 Claude Code 最核心的能力层。每个工具都是一个实现了统一接口的对象：

```typescript
interface Tool<Input, Output> {
  name: string                    // 工具名称，如 "Bash", "Read", "Edit"
  inputSchema: ZodSchema          // 输入参数的 Zod 校验 schema
  call(args, context): Promise    // 实际执行逻辑
  checkPermissions(input, ctx)    // 权限检查
  prompt(options): string         // 发送给模型的工具描述（模型靠这个理解工具用途）
  description(input): string      // 给用户看的简短描述
  isConcurrencySafe: boolean      // 是否可以和其他工具并行执行
  isReadOnly: boolean             // 是否只读（影响权限判断）
}
```

#### 完整工具清单

| 工具名 | 功能 | 类别 |
|--------|------|------|
| **Bash** | 执行 Shell 命令 | 系统操作 |
| **PowerShell** | Windows 下的 Shell 命令 | 系统操作 |
| **Read** | 读取文件内容 | 文件操作 |
| **Edit** | 精确编辑文件（查找替换） | 文件操作 |
| **Write** | 创建/覆盖写文件 | 文件操作 |
| **NotebookEdit** | 编辑 Jupyter Notebook | 文件操作 |
| **Glob** | 按模式搜索文件名 | 搜索 |
| **Grep** | 按内容搜索文件 | 搜索 |
| **WebSearch** | 网页搜索 | 外部信息 |
| **WebFetch** | 抓取网页内容 | 外部信息 |
| **Agent** | 启动子代理执行子任务 | 多代理协作 |
| **TodoWrite** | 创建/管理待办事项 | 任务管理 |
| **Task\*** | 创建/查询/更新后台任务 | 任务管理 |
| **AskUserQuestion** | 向用户提问（当需要澄清时） | 交互 |
| **Skill** | 执行用户定义的技能 | 扩展 |
| **EnterPlanMode / ExitPlanMode** | 进入/退出规划模式 | 工作模式 |
| **EnterWorktree / ExitWorktree** | 在 Git Worktree 中隔离工作 | 版本控制 |
| **SendMessage** | 向队友发送消息 | 多代理协作 |
| **ListMcpResources / ReadMcpResource** | 访问 MCP 服务器资源 | 扩展 |
| **Sleep** | 等待指定时间 | 自动化 |
| **ScheduleCron** | 定时任务 | 自动化 |
| **Brief** | 控制输出详细程度 | 输出控制 |

#### 工具执行的安全设计

工具不是随便就能执行的。以最危险的 **Bash 工具**为例，执行前要经过层层检查：

```
用户请求 → 模型决定调用 Bash("rm -rf /tmp/test")
                    │
                    ▼
           ┌── Zod Schema 校验（参数格式对吗？）
           │
           ├── validateInput（输入合法吗？）
           │
           ├── Pre-ToolUse Hooks（用户自定义的前置钩子）
           │
           ├── AST 解析命令（识别 rm、管道、重定向等）
           │
           ├── 路径检查（是否操作了 .git、.claude 等敏感目录）
           │
           ├── 破坏性命令检测（rm -rf、git push --force 等）
           │
           ├── 只读命令白名单（ls、cat、git status 等可自动放行）
           │
           ├── 权限规则匹配（用户预设的 allow/deny/ask 规则）
           │
           ├── 权限模式判断（YOLO模式？默认模式？只读模式？）
           │
           ├── [如果需要] 弹出权限确认对话框
           │
           └── 执行命令 → 返回结果给模型
```

### 3.2 权限系统（Permission System）

这是 Claude Code 与其他 AI 编程工具最大的差异化特性之一。

#### 三种权限结果

| 结果 | 含义 | 何时触发 |
|------|------|---------|
| **Allow** | 自动放行 | 只读操作、用户预设规则匹配 |
| **Ask** | 弹框询问用户 | 写文件、运行未知命令等 |
| **Deny** | 直接拒绝 | 匹配禁止规则、破坏性操作 |

#### 权限模式

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| **Default** | 安全操作自动放行，其他询问用户 | 日常使用 |
| **Plan** | 只允许只读操作 | 分析代码、制定方案 |
| **AcceptEdits** | 允许文件编辑，但 Bash 等仍要确认 | 信任代码改动 |
| **Auto（YOLO）** | 用小模型自动判断是否安全 | 批量操作、高信任场景 |
| **BypassPermissions** | 跳过所有检查（需 root 确认） | 开发调试 |

**Auto 模式的工作原理（所谓的 YOLO 模式）**：并非真正"不管不顾"。它调用一个轻量级模型（Haiku）来分析当前对话上下文和待执行操作，判断是否安全。如果小模型认为有风险，仍然会拒绝。这是一个 **"AI 审批 AI"** 的有趣设计。

#### Hooks 系统（用户自定义钩子）

用户可以配置 Shell 命令在特定事件触发时执行：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "echo 'About to run bash command: $INPUT'"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "command": "prettier --write $FILE_PATH"
      }
    ]
  }
}
```

支持的事件：`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionDenied`、`UserPromptSubmit`、`SessionStart`、`Stop`、`PreCompact` 等。

### 3.3 上下文管理（Context Management）

大模型有一个固有限制：**上下文窗口大小有限**（即使 Claude 有 200K tokens，长对话仍然会超限）。Claude Code 设计了精密的多层上下文管理：

#### 第一层：微压缩（Micro Compact）

对旧的工具调用结果进行就地压缩：

- 文件读取结果过大 → 只保留摘要
- Bash 输出过长 → 截断并标注
- 搜索结果 → 压缩重复内容

**触发条件**：基于时间（多久之前的结果）或内容大小。不需要额外的 API 调用。

#### 第二层：自动压缩（Auto Compact）

当 token 数接近上下文窗口阈值时，自动触发对话摘要：

```
有效上下文窗口 = 模型上下文窗口 - 预留输出 tokens - 缓冲区(13K)
```

压缩过程：
1. 保留最近几轮对话
2. 将较早的对话发送给模型生成摘要
3. 用摘要替换原始对话
4. 同时更新 Session Memory 文件确保关键信息不丢失

#### 第三层：Session Memory

为每个长会话维护一个 Markdown 文件，记录：
- 当前任务状态
- 已修改的文件
- 遇到的错误和解决方案
- 关键发现

这确保即使经过多次压缩，核心工作上下文也不会丢失。

#### 第四层：持久记忆（Memory / MEMORY.md）

跨会话持久化的记忆系统：
- 存储在 `~/.claude/projects/<path>/memory/` 目录
- 会话结束时自动提取有价值的信息
- 下次会话开始时自动加载相关记忆
- 使用 Sonnet 模型判断哪些记忆与当前任务相关

### 3.4 多代理系统（Multi-Agent System）

Claude Code 不止一个"AI 大脑"在工作。它实现了一套完整的多代理协作体系：

#### 子代理（Subagent）

通过 `Agent` 工具，主代理可以启动子代理执行子任务：

```
主代理: "这个重构任务需要先分析代码库结构"
   │
   ├── 启动 Explore 子代理 → 只读分析代码
   │   └── 返回分析报告
   │
   ├── 启动 general-purpose 子代理 → 修改模块 A
   │   └── 返回修改结果
   │
   └── 启动 general-purpose 子代理 → 修改模块 B（并行）
       └── 返回修改结果
```

内置子代理类型：

| 类型 | 用途 | 权限 |
|------|------|------|
| **general-purpose** | 通用工作代理 | 完整工具集 |
| **Explore** | 代码库探索和分析 | 只读 |
| **Plan** | 架构规划 | 只读 |
| **verification** | 对抗性验证（检查工作质量） | 只读 + 临时文件写入 |
| **claude-code-guide** | Claude Code 产品帮助 | 有限 |

#### Fork 子代理（实验性）

一种特殊的子代理模式，它会"克隆"主代理的完整上下文（系统提示词、历史消息），然后在后台执行任务。关键设计：

- **共享 Prompt Cache**：Fork 子代理的系统提示词与主代理完全一致，最大化 API 端的缓存命中率（节省 token 和延迟）
- **后台运行**：不阻塞主代理，适合研究类任务
- **禁止递归**：Fork 子代理不能再 Fork

#### 协调者模式（Coordinator Mode）

高级多代理编排模式（实验性），主代理变成纯"调度员"：
- 只负责拆解任务、分配给 worker 子代理
- 通过 `<task-notification>` XML 标签接收子代理完成通知
- 综合多个子代理结果后回复用户

#### 团队/蜂群模式（Swarm）

更进一步，多个独立的 Claude Code 实例协作：
- 每个 teammate 运行在独立进程（tmux pane 或 in-process）
- 通过 mailbox 机制通信
- 共享团队级权限和记忆

### 3.5 API 客户端（API Client）

与 Anthropic API 的通信层，设计非常精细：

#### 流式输出（Streaming）

- 使用原始 `Stream` 而非封装的 `BetaMessageStream`（避免 O(n²) JSON 解析）
- **空闲看门狗**：如果长时间无数据块，自动中断并重试
- **停滞检测**：记录数据块间隔，发现异常时记录日志
- **优雅回退**：流式失败时可退回到非流式调用

#### 重试策略

```
失败 → 指数退避 + 随机抖动
  │
  ├── 429 (限流) → 等待并重试，最多10次
  ├── 529 (过载) → 重试3次后触发模型降级（切换到 fallback model）
  ├── 401 (认证) → 刷新 token 后重试
  ├── 413 (请求过大) → 截断消息后重试
  └── 网络错误 → 重试并可选禁用 keep-alive
```

#### Prompt Cache 优化

Claude Code 非常在意减少 API 成本：

- **系统提示词分为静态/动态两部分**：静态部分（工具描述、通用指令）可以被 API 端缓存
- **工具 schema 缓存**：`tool.prompt()` 的结果被本地缓存，避免每轮重新计算
- **全局缓存范围**：在 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记之前的内容使用 `scope: 'global'` 缓存
- **Fork 子代理共享缓存**：子代理使用与主代理字节一致的系统提示词

### 3.6 MCP 集成（Model Context Protocol）

MCP 是 Anthropic 提出的开放协议，让 AI 助手能连接外部工具和数据源。Claude Code 是 MCP 最深度的集成者：

- **支持多种传输方式**：stdio、SSE、HTTP、WebSocket、IDE 专用通道
- **外部工具变成一等公民**：MCP 服务器提供的工具与内置工具统一管理，命名为 `mcp__<server>__<tool>`
- **配置来源**：项目 `.mcp.json`、用户全局设置、插件、企业管理策略
- **OAuth 认证**：支持 MCP 服务器的 OAuth 流程
- **资源和提示词**：除了工具，还支持 MCP 的 resources 和 prompts 协议

### 3.7 终端 UI 系统

Claude Code 的 UI 不是简单的文字输出，而是一个完整的 **React 应用**，运行在终端中：

- **自研 Ink 引擎**：基于 React 渲染器（react-reconciler），fork 并深度定制了 Ink 终端 UI 框架
- **Yoga 布局**：使用 Facebook 的 Yoga 引擎做 Flexbox 布局计算
- **虚拟滚动**：消息列表支持虚拟滚动，处理超长对话
- **快捷键系统**：完整的键绑定框架，支持 Vim 模式
- **主题系统**：支持亮色/暗色主题切换

---

## 四、与其他产品的对比分析

### 4.1 vs GitHub Copilot

| 维度 | Claude Code | GitHub Copilot |
|------|------------|----------------|
| **交互方式** | 自然语言对话，自主规划执行 | 代码补全为主，Chat 为辅 |
| **执行能力** | 能直接操作文件、运行命令、搜索网页 | 只能建议代码，不能直接执行 |
| **任务粒度** | 可处理"重构整个模块"级别任务 | 擅长"补全这一行"级别任务 |
| **安全模型** | 完整的权限系统和审批流程 | N/A（不直接执行操作） |
| **上下文范围** | 整个项目 + 终端 + 网络 | 当前文件 + 少量上下文 |
| **多代理** | 支持子代理并行工作 | 不支持 |
| **运行环境** | 终端 CLI + IDE 扩展 | IDE 插件 |

**核心差异**：Copilot 是"副驾驶"（补全你的代码），Claude Code 是"自动驾驶"（你说去哪，它开车）。

### 4.2 vs Cursor（AI IDE）

| 维度 | Claude Code | Cursor |
|------|------------|--------|
| **形态** | CLI 工具 + IDE 扩展 | 独立 IDE（VS Code fork） |
| **模型绑定** | 强绑定 Anthropic Claude | 支持多模型（GPT-4、Claude 等） |
| **Agent 能力** | 原生深度 Agent，多代理协作 | Agent 模式较新，单代理 |
| **上下文压缩** | 三层压缩 + 持久记忆 | Codebase indexing |
| **扩展性** | MCP 协议 + Hooks + Skills + 插件 | Rules + 内置功能 |
| **权限控制** | 5种模式 + AST 级命令分析 | 较简单的确认机制 |
| **终端集成** | 原生终端工具，无缝操作 | 内嵌终端，需切换上下文 |

**核心差异**：Cursor 把 AI 嵌入编辑器，Claude Code 把编辑器嵌入 AI。前者是"增强的 IDE"，后者是"能编程的 AI"。

### 4.3 vs Devin / SWE-Agent

| 维度 | Claude Code | Devin / SWE-Agent |
|------|------------|-------------------|
| **运行位置** | 本地（你的机器上） | 云端沙盒 |
| **交互模式** | 实时对话，随时介入 | 提交任务后等待结果 |
| **安全性** | 多层权限 + 用户审批 | 沙盒隔离 |
| **上下文** | 能看到你的全部本地环境 | 只有克隆的代码 |
| **成本模型** | 按 API 调用付费 | 订阅制 |
| **可定制性** | Hooks + Skills + MCP + 插件 | 较封闭 |

**核心差异**：Devin 是"远程雇员"（给任务，等交付），Claude Code 是"身边同事"（随时讨论，实时协作）。

---

## 五、技术亮点深度解读

### 5.1 "系统提示词即产品"

Claude Code 最独特的设计理念是：**产品体验主要由系统提示词（System Prompt）定义，而非代码逻辑**。

`src/constants/prompts.ts` 中的 `getSystemPrompt()` 函数生成了长达数千 token 的系统提示词，涵盖：
- AI 的身份和行为准则
- 如何使用每个工具
- 代码风格指南（不要加多余注释、不要过度工程化）
- 安全准则
- 输出格式要求

这意味着 Claude Code 的很多"智能行为"不是写死在代码里的，而是通过自然语言"教"给模型的。这是一种**非常现代的产品开发范式** —— 工程师写的不是业务逻辑代码，而是"教材"。

### 5.2 流式工具执行器（Streaming Tool Executor）

传统 Agent 框架是"等模型完整回复 → 提取工具调用 → 逐个执行"。Claude Code 的 `StreamingToolExecutor` 实现了**流式并行执行**：

```
模型开始输出...
├── "我来读取这几个文件" (文字流式显示)
├── [tool_use: Read file_a.ts]  ← 立即开始执行
├── [tool_use: Read file_b.ts]  ← 并行执行（两个 Read 都是并发安全的）
├── "然后修改..."
├── [tool_use: Edit file_a.ts]  ← 等前面的读取完成后执行（非并发安全）
└── 模型输出完成

时间线:
Read A: ████████
Read B: ████████        （与 A 并行）
Edit A:         ████████ （A,B 完成后才执行）
```

关键设计：
- 每个工具声明 `isConcurrencySafe`（如 Read = true, Edit = false）
- 并发安全的工具可以并行执行
- 非并发安全的工具会排队等待
- Bash 执行出错会 abort 兄弟任务（避免在错误基础上继续）

### 5.3 安全的 Bash 执行

Bash 工具的安全设计可能是整个项目中最复杂的部分：

1. **AST 级解析**：不是简单的正则匹配，而是用 Tree-sitter 将 Shell 命令解析为抽象语法树
2. **复合命令拆解**：`ls && rm -rf /` 会被拆成两个命令分别检查权限
3. **环境变量剥离**：deny 规则匹配时，会先去掉 `ENV=val` 前缀再匹配
4. **路径穿越防护**：检测通过 `cd` 切换到 `.git` 目录后执行 hook 的攻击
5. **裸仓库检测**：防止在 bare git repo 中执行可能触发 hook 的 git 命令
6. **读写分类**：大量命令被标记为"只读"（如 `ls`, `cat`, `git status`），可以自动放行

### 5.4 CLAUDE.md —— 项目级 AI 配置

用户可以在项目根目录放置 `CLAUDE.md` 文件，内容会被注入到系统提示词中。这等于给 AI 定制了"项目特定的工作指南"：

```markdown
## 项目规范
- 使用 TypeScript strict mode
- 测试必须用 Vitest
- Commit message 使用 Conventional Commits 格式

## 架构约束
- API 调用都通过 src/api/ 层
- 不要直接修改 generated/ 目录下的文件

## 常用命令
- npm test: 运行测试
- npm run lint: 运行 linter
```

这个设计让 Claude Code 能**适应不同项目的编码规范**，而不是一刀切。

### 5.5 Undercover 模式

一个有趣的安全特性：当 Anthropic 内部员工用 Claude Code 给公开/开源项目贡献代码时，系统会自动进入"卧底模式"：

- 不在 commit message 中提及 Claude、Anthropic 或内部代号
- 不在 PR 中透露使用了 AI
- 不添加 `Co-Authored-By` 行
- 模型甚至不被告知自己是什么型号

这反映了 Anthropic 对"AI 生成代码"在开源社区中敏感性的深度考量。

---

## 六、工程质量亮点

### 6.1 启动性能优化

- **延迟加载**：`cli.tsx` 对所有非关键路径使用 `dynamic import()`
- **并行预取**：认证 token、MCP 连接、命令列表等在后台并行准备
- **Profile 检查点**：内置性能打点，可追踪启动瓶颈

### 6.2 错误恢复

- **流式失败回退**：流式 API 调用失败后自动退回非流式模式
- **模型降级**：连续过载错误后自动切换到备用模型
- **上下文过大恢复**：413 错误时自动截断历史消息重试
- **最大输出恢复**：如果模型输出被截断，自动用更大的 max_tokens 重试

### 6.3 可扩展架构

Claude Code 提供了四个维度的扩展能力：

| 维度 | 机制 | 示例 |
|------|------|------|
| **项目配置** | CLAUDE.md | 注入项目规范 |
| **工具扩展** | MCP 服务器 | 接入数据库、API、CI 系统 |
| **行为钩子** | Hooks | 自动格式化、自定义审批 |
| **技能** | Skills | 自定义工作流（如 /commit, /review） |
| **插件** | Plugin 系统 | 第三方功能包 |

### 6.4 Feature Flag 精细控制

通过 GrowthBook（一个开源 Feature Flag 平台），Claude Code 对功能进行细粒度控制：

- 编译时 `feature()` 函数 + Bun bundler 的 DCE（死代码消除）
- 运行时 `getFeatureValue_CACHED_MAY_BE_STALE()` 非阻塞读取
- 内部用户(`USER_TYPE === 'ant'`) vs 外部用户的功能隔离
- A/B 测试新功能对用户体验的影响

---

## 七、架构总结

Claude Code 的技术架构可以用一句话概括：

> **一个把"大模型推理能力"和"本地开发环境操作能力"无缝结合的 Agent 框架，同时在安全性、可扩展性、性能上做了工业级的工程投入。**

它不仅仅是一个"调用 API 的脚本"，而是一个完整的产品：

- **安全层**比大部分竞品深一个数量级（AST 级命令分析、多层权限、AI 审批 AI）
- **上下文管理**解决了长会话的根本问题（三层压缩 + 跨会话记忆）
- **多代理协作**支持了复杂任务的并行处理
- **可扩展性**通过 MCP、Hooks、Skills、Plugins 四个维度覆盖了几乎所有定制需求
- **API 成本优化**通过 Prompt Cache、微压缩、Fork 共享缓存等多种手段

作为一个软件工程师阅读这个代码库，最大的收获可能是：**看到一个世界级团队如何把一个"大模型 + 工具调用"的简单概念，打磨成一个可靠、安全、高性能的产品。** 其中的工程设计决策 —— 从流式工具执行到 AST 级安全检查，从上下文压缩到 Prompt Cache 优化 —— 都值得深入学习。

---

*本文基于 [claude-code-source-code](https://github.com/anthropics/claude-code) v2.1.88 反编译源码分析，源码解读项目见 GitHub。*
