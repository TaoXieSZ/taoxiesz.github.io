---
title: 架构学习志 01|创世日:一天建成分布式 Agent Runtime,学的不是快,是决策顺序
description: 复盘 agent-farm 的 2026-07-03:24 个 commit、14 小时,从 git init 到「分布式+安全+运维+观测」。scaffold 后 6 分钟提交 1988 行核心、第 21 分钟出现第一个并发竞态、首个 commit 里就有 mock——五个反直觉的教学点。
pubDate: 2026-07-15
author: 谢韬
project: agent-farm
tags:
  - agent
  - architecture
  - retrospective
  - learning
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:680px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .lbl{font-size:13px;font-weight:600}
.affig .sm{font-size:11px;fill:var(--muted);font-weight:400}
.affig .band{font-size:12px;font-weight:700;fill:var(--muted);letter-spacing:.2em}
.affig .box{fill:transparent;stroke:var(--text);stroke-width:1.2;rx:8}
.affig .plane{fill:none;stroke:var(--accent);stroke-width:1.4;stroke-dasharray:6 5;rx:12}
.affig .plane2{fill:none;stroke:#2e9d7b;stroke-width:1.4;stroke-dasharray:6 5;rx:12}
.affig .warm{fill:transparent;stroke:#b07f2e}
.affig .arrow{stroke:var(--muted);stroke-width:1.4;fill:none}
.affig .arrow.strong{stroke:var(--accent);stroke-width:1.8}
</style>

> 「架构学习志」是一个新系列:我和 Claude 一起复盘 agent-farm(我的个人分布式 Agent 平台,[四天诞生记](/blog/agent-farm-four-days/)讲过它是什么)的每一个架构决策——不是记流水账,而是提炼「看到什么信号,就该想到什么设计」。我在 vibe coding 里错过了太多在我眼皮底下发生的决策,这个系列是把它们一个个找回来。

第一篇讲创世日:2026-07-03,两个空目录到一个能跨机器干活、有安全边界、有全链路观测的分布式 runtime。**24 个 commit,14.3 小时。**

先说清楚:这一天最不值得学的就是「快」——代码是 AI 写的,快是默认的。值得学的是**决策顺序**:先做什么、后做什么、什么被明确推迟。

## 当天立起的架构

<div class="affig"><svg viewBox="0 0 860 470" role="img" aria-label="三层×两平面架构图">
  <defs><marker id="gj1m" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.4"/></marker></defs>
  <text x="16" y="32" class="band">事 件 层</text>
  <rect x="150" y="14" width="150" height="34" class="box warm"/><text x="166" y="36" class="lbl">飞书 DM / 群 @</text>
  <rect x="320" y="14" width="170" height="34" class="box warm"/><text x="336" y="36" class="lbl">cron 定时(次日)</text>
  <line x1="300" y1="62" x2="300" y2="92" class="arrow strong" marker-end="url(#gj1m)"/>
  <text x="316" y="82" class="sm">事件 → 该由哪个「定义」处理?</text>
  <rect x="140" y="96" width="580" height="130" class="plane"/>
  <text x="158" y="120" class="lbl" fill="var(--accent)">控制面 dispatch</text>
  <rect x="158" y="132" width="120" height="32" class="box"/><text x="170" y="153" class="sm">触发器路由</text>
  <rect x="290" y="132" width="180" height="32" class="box"/><text x="302" y="153" class="sm">定义 definition(yaml)</text>
  <rect x="482" y="132" width="220" height="32" class="box"/><text x="494" y="153" class="sm">busy-retry / 轮换 / 自愈</text>
  <rect x="158" y="176" width="120" height="32" class="box"/><text x="170" y="197" class="sm">warm pool</text>
  <rect x="290" y="176" width="180" height="32" class="box"/><text x="302" y="197" class="sm">traces + dashboard</text>
  <text x="482" y="197" class="sm">——全部是确定性代码</text>
  <line x1="300" y1="240" x2="300" y2="272" class="arrow strong" marker-end="url(#gj1m)"/>
  <text x="316" y="262" class="sm">HTTP × N 台机器(静态 engines 配置,Day 1 下午落地)</text>
  <rect x="140" y="276" width="580" height="130" class="plane2"/>
  <text x="158" y="300" class="lbl" fill="#2e9d7b">执行面 agent-host</text>
  <rect x="158" y="312" width="250" height="32" class="box"/><text x="170" y="333" class="sm">5-op 协议(create/send/hide/…)</text>
  <rect x="420" y="312" width="150" height="32" class="box"/><text x="432" y="333" class="sm">实例生命周期</text>
  <rect x="582" y="312" width="120" height="32" class="box"/><text x="594" y="333" class="sm">休眠 ⇄ 恢复</text>
  <rect x="158" y="356" width="160" height="32" class="box"/><text x="170" y="377" class="sm">memory(次日解耦)</text>
  <rect x="330" y="356" width="150" height="32" class="box"/><text x="342" y="377" class="sm">MCP 技能挂载</text>
  <text x="494" y="377" class="sm">协议出生即有 mock 第二实现</text>
  <text x="16" y="445" class="sm">贯穿全天的一条原则:确定性的活给代码,判断性的活给模型 —— agent 从头到尾没有「回复飞书」的工具</text>
</svg></div>

这套「三层(触发器/定义/实例)× 两平面(控制/执行)」的拆分,动机是我最初的不适感:我同事的同类系统里,连「回 Slack 消息」这种底层操作都交给 LLM 自己做。**投递、重试、路由这些有唯一正确做法、需要保证的事,应该是代码;模型只该出现在需要判断的地方。**这条品味在 Day 1 就是结构,不是注释。

## 三幕结构

这一天不是匀速堆代码,是三幕清晰的决策序列——每一幕回答一个不同层次的问题。

**第一幕(上午 09:08–10:38)骨架——系统是什么形状。**两 repo 同时 scaffold;6 分钟后 agent-host 核心 1,988 行一次落地,13 分钟后 dispatch 核心 1,697 行落地;09:26 飞书接入;09:29 修掉第一个并发竞态;10:38 secrets 进 .env。

**第二幕(下午 14:43–14:45)能力——分布式与技能。**MCP 挂载 + 静态多引擎路由,前后 2 分钟。

**第三幕(晚上 20:49–23:28)边界与观测——怎么控制它、怎么看见它。**allowlist(20:49)→ usage 追踪(20:51)→ PM2(21:00)→ 路由细化(21:24–22:36)→ **事件总线+per-message traces+dashboard(23:02–23:28)**。全天最后一个 commit 是「能看见一切」。

## 五个教学点

**① 思考发生在代码之前。**scaffold 后 6 分钟提交 1,988 行——6 分钟写不出想清楚的 2,000 行,真正的设计在当天三份 openspec 的 proposal/design 里完成,代码只是誊写。spec-first 的本质:把「想清楚」这个瓶颈,前置到改起来最便宜的阶段(改文档比改代码便宜 100 倍)。

**② 协议出生即有两个实现。**首个 commit 里就有 52 行的 mock-adapter 和 186 行的检查脚本——测试与代码同龄。RuntimeAdapter 那条 5-op 边界后来被证明画得极准(第 5 天接 OpenCode 后端,只写 4 个新 hook,休眠/记忆/轮换/用量全部白拿),根源在这里:**第一天就被 mock 逼着「只暴露真正必要的东西」。验证抽象边界画没画对,唯一的硬证据是第二实现能白拿多少。**

**③ 并发问题按分钟到达。**系统活了 21 分钟,第一个竞态就来了(busy 状态在 await 之后才置位,并发 send 可以钻进去)。只要有「异步生产者 + 有状态消费者」,竞态不是会不会来,是几分钟后来。解法是「先占位再干活」——busy 在任何 await 之前同步置位。

**④ 野心大 ≠ 基础设施重。**「分布式」这个初心没有被推迟——Day 1 下午就落地。但落的方式极克制:静态 config 列引擎,显式拒绝动态发现和负载均衡,而且**把拒绝理由和前提写进了 openspec**(「机器列表小且人工维护;动态发现会引入一整个我们没有的问题的子系统」)。前提写下来,未来才能复核前提变没变。

**⑤ 观测不是奢侈品,是分布式的门票。**大多数项目把 dashboard 拖到第三周;这里 Day 1 深夜就有 per-message trace。不是勤奋,是必然:拆成两个进程的那一刻,「消息死在哪一跳」就成了没有 trace 回答不了的问题。**每一次解耦,都要用新的可观测性和可靠性机制买单——预算时把这笔算进去。**

## 自测三题

1. 如果让你重建这一天,dashboard 你会放在第几天做?这里为什么是 Day 1 深夜?
2. 首 commit 里 52 行的 mock-adapter,成本值吗?它买到了什么?
3. 第 21 分钟的竞态,换成「在 prompt 里叮嘱 agent 别并发」行不行?为什么不行?

> 下一篇:[静默的两副面孔](/blog/agent-farm-arch-journal-02-silence/)——身份解耦、心跳,与两堂「静默失效」课。
