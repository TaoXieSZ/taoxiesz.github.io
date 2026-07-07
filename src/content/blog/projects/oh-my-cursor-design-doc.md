---
title: oh-my-cursor 设计文档：为什么需要一个 Cursor 编排层
description: OMC 的设计动机、核心理念、标准工作流、角色系统，以及和 oh-my-codex 的关键差异。
pubDate: 2026-04-04
author: 谢韬
project: oh-my-cursor
tags:
  - oh-my-cursor
  - cursor
  - workflow
  - design-doc
  - agent
---

> 项目：[oh-my-cursor (OMC)](https://github.com/TaoXieSZ/oh-my-cursor)

---

## 概要

oh-my-cursor（OMC）是一个面向 Cursor IDE 的工作流编排层。它不替代 Cursor，而是在 Cursor 之上叠加一层**更好的工作流、更强的技能体系、和持久化的运行时状态**，让 AI Agent 在 Cursor 里能跑得更远、更稳、更可控。

本文记录 OMC 的设计动机、核心理念、以及和灵感来源 oh-my-codex（OMX）的关键差异。

---

## 一、问题：Cursor 原生缺什么

Cursor 是一个优秀的 AI IDE，但在实际工程使用中有几个痛点：

1. **没有标准工作流**：每次对话都从零开始。没有 "先澄清、再规划、再执行" 的标准流程。
2. **Agent 没有角色意识**：所有 Task tool 子 agent 都是通用的，没有专门的 "调试者"、"审计者"、"架构师" 人格。
3. **状态不持久**：对话结束后，计划、进度、决策全部丢失。下次需要重新建立上下文。
4. **技能不可复用**：好的工作模式只能靠用户记忆和手动提示词复现。

## 二、设计目标

OMC 的设计围绕四个原则：

### 原则 1：Cursor 是引擎，OMC 是导航

OMC 不做任何 AI 推理——所有实际工作都由 Cursor Agent 完成。OMC 只负责**告诉 Agent 该怎么工作**：遵循什么流程、扮演什么角色、把状态存在哪。

### 原则 2：渐进式增强

安装 OMC 后，Cursor 的所有原生能力都保留。OMC 只在需要时激活——用户说 `$forge`，工作流才启动。不说，Cursor 照常工作。

### 原则 3：原生集成优先

尽可能使用 Cursor 的原生机制：
- `.cursor/rules/*.mdc` 而不是自定义配置文件
- `.cursor/skills/` 而不是新的插件格式
- Task tool 而不是外部进程管理
- MCP 服务器而不是文件系统 hack

### 原则 4：简洁胜于完备

OMX 有 33 个角色提示词和复杂的 tmux 协调。OMC 有意精简为 **10 个角色、12 个技能、3 条规则**，覆盖 80% 的使用场景。

## 三、核心概念

### 标准工作流：四阶段流水线

```
$deep-interview → $blueprint → $forge / $team
    澄清              规划         执行
```

| 阶段 | 技能 | 作用 |
|------|------|------|
| 澄清 | `$deep-interview` | Socratic 问答，一轮一问，逐步消除歧义 |
| 规划 | `$blueprint` | 结构化审议：架构、权衡、测试策略 |
| 执行（单线程） | `$forge` | 持久完成循环：implement → verify → fix |
| 执行（并行） | `$team` | 多 Agent 并行：通过 Task tool 派发子任务 |

不是每个任务都需要走全流程。简单任务直接执行，复杂任务走完整流水线。

### 角色提示词：10 种 Agent 人格

每个角色是一个 markdown 文件，包含四个部分：

```xml
<identity>      — 我是谁，我做什么
<constraints>   — 我不做什么，边界在哪
<execution_loop> — 我的工作循环是什么
<output_contract> — 我的输出长什么样
```

**6 个核心角色**：executor、architect、debugger、verifier、explorer、planner

**4 个专家角色**：code-reviewer、test-engineer、writer、security-reviewer

角色通过关键词路由自动匹配：说 "debug this" → debugger 角色，说 "review the code" → code-reviewer 角色。

### 持久化状态：`.omc/` 目录

```
.omc/
├── state/           — 模式状态文件（forge、team 等）
├── plans/           — PRD 和测试规格
├── prompts/         — 角色提示词（项目级安装时）
├── logs/            — 会话日志
├── notepad.md       — 临时笔记
└── project-memory.json — 跨会话记忆
```

两个 MCP 服务器（omc-state、omc-memory）提供结构化的读写接口，技能通过 MCP 而不是直接文件操作来管理状态。

## 四、与 oh-my-codex 的关键差异

OMC 的灵感来自 [oh-my-codex (OMX)](https://github.com/Yeachan-Heo/oh-my-codex)，但在几个核心设计决策上走了不同的路：

| 维度 | OMX | OMC | 为什么不同 |
|------|-----|-----|-----------|
| 编排契约 | 单个 `AGENTS.md`（500+ 行） | 模块化 `.mdc` 规则（3 个文件） | Cursor 原生支持 rules 目录 |
| 团队模式 | tmux 会话 + 工作树 | Cursor Task tool | Cursor 内置子 Agent 能力 |
| 角色系统 | 33 个 TOML 生成的提示词 | 10 个手写 markdown | 简洁优先，覆盖核心场景 |
| 原生组件 | Rust（explore、mux、runtime） | 纯 TypeScript | 降低门槛，npm 一键安装 |
| 状态访问 | MCP + 文件系统 | MCP 优先 | 结构化接口，避免 prompt 里的文件操作 |
| 安装 | `npm install -g oh-my-codex` | `npm install -g oh-my-cursor` | 相同的分发模型 |

### 我们的优势

1. **零外部依赖**：不需要 tmux、Rust 工具链，`npm install` 即用。
2. **原生集成**：规则、技能、MCP 全部用 Cursor 的标准机制，不引入新概念。
3. **更轻的认知负担**：10 个角色 vs 33 个，12 个技能 vs 20+，3 个规则 vs 1 个 500 行文件。

### 我们的劣势

1. **成熟度**：OMX 经过大量社区使用和迭代，OMC 刚起步。
2. **性能组件**：OMX 的 Rust 原生工具（explore、sparkshell）比纯 TS 快。
3. **功能覆盖**：OMX 有更多高级技能（ultrawork、ultraqa、visual-verdict）。

## 五、命名哲学

OMC 有意给核心技能选择了**有实质含义的名字**：

| 技能 | 含义 | 为什么叫这个 |
|------|------|-------------|
| `$forge` | 锻造 | 反复加热、锤打、检验，直到成品达标 |
| `$blueprint` | 蓝图 | 锻造前的设计图，结构化的计划 |
| `$deep-interview` | 深度访谈 | Socratic 式的逐步澄清 |
| `$autopilot` | 自动驾驶 | 从起点到终点的全自主执行 |
| `$web-clone` | 网站克隆 | URL → 可运行的本地副本 |

## 六、当前状态

| 指标 | 数值 |
|------|------|
| 版本 | v0.1.0 |
| TypeScript 源码 | ~750 行 |
| 测试 | 75/75 pass |
| 规则 | 3 个 .mdc 文件 |
| 技能 | 12 个 |
| 角色提示词 | 10 个 |
| MCP 服务器 | 2 个（state + memory） |
| npm 包 | oh-my-cursor |

## 七、下一步

- GitHub Actions CI
- 社区贡献指南（CONTRIBUTING.md）
- npm 正式发布 v0.1.0
- 更多社区反馈驱动的技能迭代

---

> 代码仓库：[github.com/TaoXieSZ/oh-my-cursor](https://github.com/TaoXieSZ/oh-my-cursor)
