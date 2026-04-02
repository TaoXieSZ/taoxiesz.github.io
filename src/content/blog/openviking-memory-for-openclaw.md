---
title: 把 OpenViking 接进 OpenClaw 记忆系统
description: 记录一次把 OpenViking 配进 OpenClaw、替换默认 memory-core，并确认记忆链路生效的过程。
pubDate: 2026-03-27
author: 谢韬
project: openclaw
tags:
  - openclaw
  - openviking
  - memory
  - ai-agent
  - workflow
---

今天总算把 **OpenViking** 接进了我的 **OpenClaw** 环境里。

这事看起来只是“换一个记忆插件”，但对我来说，它更像是把 agent 的记忆系统从“能用”推进到“可验证、可扩展、可梳理”的一步。

## 我这次实际做了什么

核心步骤其实不多：

1. 按 OpenViking 文档把环境先装起来  
   文档：<https://www.volcengine.com/docs/6396/2249500?lang=zh>
2. 禁用 OpenClaw 默认的记忆插件：

```bash
openclaw plugins disable memory-core
```

3. 运行状态检查：

```bash
openclaw status
```

然后我在状态页里看到了这一行：

```text
Memory: enabled (plugin openviking)
```

这基本就说明，当前 OpenClaw 已经把 **OpenViking 识别为正在生效的记忆插件**，而不是继续走默认的 `memory-core`。

## 为什么要先关掉 memory-core

这一步我觉得非常关键。

如果默认记忆插件不关，至少在心智模型上会有两个麻烦：

- 你不容易判断**到底是谁在接管 Memory 能力**
- 出现 recall / capture 异常时，很难快速定位问题到底在默认插件还是 OpenViking

所以我的做法很直接：

- **默认的关掉**
- **让 OpenViking 明确接管**
- **再用 status 和进程状态确认链路**

这样排障和后续维护都清楚很多。

## 我是怎么确认它真的起来了

目前我用的是一套很朴素，但足够可靠的检查方式。

### 1. 看 OpenClaw 状态

最直观的信号就是：

```text
Memory: enabled (plugin openviking)
```

只要这一行出现，说明 OpenClaw 至少在平台层已经把记忆能力绑定到 OpenViking 上了。

### 2. 看插件加载信息

我在本机还能看到类似这样的加载信息：

```text
[plugins] openviking: registered context-engine (before_prompt_build=auto-recall, afterTurn=auto-capture, sessionKey=stable mapped session)
```

这个信息很有价值，因为它直接说明了 OpenViking 不是“静态躺在目录里”，而是已经注册进了实际运行链路。

从字面上看，它接到了两类关键动作：

- **before_prompt_build = auto-recall**
- **afterTurn = auto-capture**

也就是说：

- 在 prompt 构建前，它会参与召回相关记忆
- 在一次对话结束后，它会参与捕获新的可记忆信息

### 3. 看本地进程

我还确认到了 OpenViking 相关 Python 进程正在运行。

这一步不能单独作为“功能正常”的证明，但它至少说明服务端不是没起来。

## 这次接好以后，我准备怎么用记忆

我不想把“插件记忆”和“工作记忆”混在一起，所以最后给自己定的是一套 **两级结构**。

### 系统层：OpenViking

这一层负责：

- 自动 recall
- 自动 capture
- 给 OpenClaw 提供系统级的记忆增强能力

它适合做“运行时自动补上下文”这类事。

### 工作层：显式双层记忆

我另外保留一套可读、可改、可审阅的本地记忆结构：

- **短期记忆：** `memory/YYYY-MM-DD.md`
- **长期记忆：** `MEMORY.md`

这样分层的好处很明确：

- OpenViking 负责“自动化”
- 本地文件负责“可控性”

#### 短期记忆放什么

放当天的：

- 临时背景
- 排障过程
- 会话里的新信息
- 当天做出的阶段性决定

#### 长期记忆放什么

只放跨天仍然有价值的东西：

- 用户偏好
- 稳定工作流
- 身份设定
- 反复会用到的决策

我的原则很简单：

> **新信息先写短期，确认长期有价值后再沉淀进长期。**

## 这次让我更确定的一件事

我越来越觉得，agent 的“记忆”不能只靠黑盒自动化。

自动 recall 很重要，自动 capture 也很重要，但如果没有一层**人能直接读懂、直接编辑、直接审查**的显式记忆，很多东西最后还是会变得不可控。

所以我现在更认可的方案是：

- **系统层**用 OpenViking
- **工作层**用 daily notes + curated memory

换句话说：

- 让系统负责“记得更自然”
- 让文件负责“记得更可靠”

## 这次的结论

这次折腾下来，我得到的结论很简单：

- OpenViking 已经成功接入 OpenClaw
- 默认 `memory-core` 已经退出
- `openclaw status` 能明确看到 Memory 由 OpenViking 接管
- 本地运行链路、插件加载信息、服务进程三方面都能互相印证

接下来更值得做的，不是继续盯着“它装没装上”，而是继续验证两件事：

1. recall 是否稳定
2. capture 是否符合预期

装上只是开始，**真正有价值的是把记忆系统变成一个能长期协作的基础设施。**
