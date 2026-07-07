---
title: 从一个飞书机器人,到个人分布式 Agent 运行时
description: Agent Farm 阶段总结:两个控制面、三台机器四个引擎、Cursor 云与自托管 OpenCode 双后端、国产模型真实在跑。记录架构决策(为什么换后端不换平台)、agent 互问的实现原理,以及"Fable 规划 + Cursor 执行"的工程方法。
pubDate: 2026-07-07
author: 谢韬
project: agent-farm
tags:
  - agent
  - feishu
  - opencode
  - multi-model
  - claude
  - infrastructure
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:680px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .lbl{font-size:13px;font-weight:600}
.affig .sm{font-size:11px;fill:var(--muted);font-weight:400}
.affig .mono{font-family:var(--font-mono);font-size:10.5px;fill:var(--muted)}
.affig .box{fill:var(--surface);stroke:var(--line);stroke-width:1.2}
.affig .core{fill:var(--accent-soft);stroke:var(--accent)}
.affig .warm{fill:transparent;stroke:#b07f2e}
.affig .arrow{stroke:var(--muted);stroke-width:1.4;fill:none}
.affig .arrow.strong{stroke:var(--accent);stroke-width:1.8}
.affig .arrow.dash{stroke-dasharray:5 4}
.affig .cap{font-size:12px;fill:var(--muted)}
</style>

一开始只是想要一个"在飞书里随叫随到的 AI 助手"。几周之后,它长成了一套我称为 **Agent Farm** 的个人分布式 Agent 运行时:

- **2 个飞书 bot**(一个试验田、一个工作专用),背后是 **2 个互相隔离的控制面**
- **3 台机器、4 个引擎**:两台 Mac + 一台云 VM,引擎间用 Tailscale 打通
- **2 种 Agent 后端**:Cursor 云,和自托管的 OpenCode
- 国产模型(腾讯混元)驱动的 agent **真实在跑**,和 Claude 系 agent 同一套调度管线

这篇是阶段总结:哪些架构决策是对的、agent 互问怎么实现、以及这套东西是怎么被"造出来"的。

## 架构:控制面与引擎分离

整套系统只有两个服务:

```
飞书消息 → dispatch(控制面)→ agent-host(引擎,N 台机器)→ Agent 后端
```

- **dispatch** 管事件接入(飞书长连接、cron)、路由、创建-或-唤醒、忙重试、故障自愈、上下文轮换,以及一个观测 dashboard。
- **agent-host** 管 agent 生命周期:闲置休眠/按需唤醒、磁盘元数据、**活记忆**(稳定 memory key,跨 agent 更换存续)、MCP 技能挂载、token 用量记账。

两者之间是普通 HTTP + bearer,控制面通过配置里的 `engine` 字段把不同 agent 定义钉到不同机器。控制面部署在一台常驻小主机上——合上笔记本,bot 不死。

当前的全景是这样(两个 bot、两个互相隔离的控制面、跨机的引擎群):

<div class="affig"><svg viewBox="0 0 800 340" role="img" aria-label="Agent Farm 全景拓扑">
  <defs><marker id="fg1" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.4"/></marker></defs>
  <rect x="20" y="40" width="150" height="52" rx="6" class="box warm"/>
  <text x="95" y="62" text-anchor="middle" class="lbl">飞书 · 试验田 bot</text>
  <text x="95" y="80" text-anchor="middle" class="sm">WS 长连接</text>
  <rect x="20" y="220" width="150" height="52" rx="6" class="box warm"/>
  <text x="95" y="242" text-anchor="middle" class="lbl">飞书 · 工作 bot</text>
  <text x="95" y="260" text-anchor="middle" class="sm">刻意隔离,最小能力</text>
  <rect x="230" y="40" width="160" height="52" rx="6" class="box core"/>
  <text x="310" y="62" text-anchor="middle" class="lbl">dispatch · 测试面</text>
  <text x="310" y="80" text-anchor="middle" class="sm">5 个 agent 定义</text>
  <rect x="230" y="220" width="160" height="52" rx="6" class="box core"/>
  <text x="310" y="242" text-anchor="middle" class="lbl">dispatch · 工作面</text>
  <text x="310" y="260" text-anchor="middle" class="sm">1 引擎 · 1 agent</text>
  <rect x="470" y="16" width="180" height="46" rx="6" class="box"/>
  <text x="560" y="35" text-anchor="middle" class="lbl">引擎 · 工作 Mac</text>
  <text x="560" y="52" text-anchor="middle" class="sm">Cursor 云后端</text>
  <rect x="470" y="78" width="180" height="46" rx="6" class="box core"/>
  <text x="560" y="97" text-anchor="middle" class="lbl">引擎 · 工作 Mac ×2</text>
  <text x="560" y="114" text-anchor="middle" class="sm">OpenCode → 混元 hy3 ★</text>
  <rect x="470" y="152" width="180" height="46" rx="6" class="box"/>
  <text x="560" y="171" text-anchor="middle" class="lbl">引擎 · 常驻小主机</text>
  <text x="560" y="188" text-anchor="middle" class="sm">两个控制面共享</text>
  <rect x="470" y="226" width="180" height="46" rx="6" class="box"/>
  <text x="560" y="245" text-anchor="middle" class="lbl">引擎 · 云端 VM</text>
  <text x="560" y="262" text-anchor="middle" class="sm">代理路径,延迟高但可用</text>
  <path d="M170 66 L230 66" class="arrow strong" marker-end="url(#fg1)"/>
  <path d="M170 246 L230 246" class="arrow strong" marker-end="url(#fg1)"/>
  <path d="M390 58 L470 39" class="arrow" marker-end="url(#fg1)"/>
  <path d="M390 66 L470 101" class="arrow" marker-end="url(#fg1)"/>
  <path d="M390 74 L470 170" class="arrow" marker-end="url(#fg1)"/>
  <path d="M390 82 Q440 160 470 243" class="arrow dash" marker-end="url(#fg1)"/>
  <path d="M390 238 L470 180" class="arrow" marker-end="url(#fg1)"/>
  <text x="400" y="320" text-anchor="middle" class="cap">共享引擎在拓扑上只画一个节点,每个控制面各自实测一条延迟边</text>
</svg></div>

## 最值钱的一道口子:RuntimeAdapter

agent-host 对 Agent 后端的依赖被压缩成一个五操作协议(创建/发送/隐藏/存在性/轮次计数),生命周期机制全部写在协议之上的基类里。具体后端只需要实现四个钩子。

这道口子本周被兑现了:想用上 GLM、DeepSeek、混元这些模型,而原有后端的模型菜单是锁死的。分析下来,所谓"换模型"其实是三层问题——**模型权重、推理 API、Agent 执行循环(harness)**。裸模型 API 只给你前两层;真正贵的是第三层的 tool-loop。自己造等于重写一个 Cursor;正确答案是换一个开源、自托管、模型无关的 harness:**OpenCode**。

<div class="affig"><svg viewBox="0 0 760 250" role="img" aria-label="Agent 后端的三层拆解">
  <rect x="30" y="30" width="420" height="56" rx="6" class="box core"/>
  <text x="52" y="53" class="lbl">层 3 · Agent 执行循环(harness)</text>
  <text x="52" y="72" class="sm">tool-loop · 改文件 · 跑 shell · 挂 MCP · 会话持久化 —— 最贵的一层</text>
  <rect x="30" y="100" width="420" height="50" rx="6" class="box"/>
  <text x="52" y="122" class="lbl">层 2 · 推理 API</text>
  <text x="52" y="140" class="sm">chat / completions 端点 —— 易替换</text>
  <rect x="30" y="164" width="420" height="50" rx="6" class="box"/>
  <text x="52" y="186" class="lbl">层 1 · 模型权重</text>
  <text x="52" y="204" class="sm">Claude / GLM / DeepSeek / 混元 —— 易替换</text>
  <text x="490" y="52" class="sm">Cursor SDK = 三层打包(云端)</text>
  <text x="490" y="76" class="sm">裸模型 API = 只有层1+2,</text>
  <text x="490" y="93" class="sm">层3 要自己造 = 重写一个 Cursor</text>
  <text x="490" y="126" class="lbl" fill="var(--accent)">OpenCode = 换一个开源自托管的层3</text>
  <text x="490" y="148" class="sm">模型无关,层1 退化成一行配置</text>
</svg></div>

于是新后端 `OpenCodeAdapter` 只写了四个钩子(agent = OpenCode session,发送 = `session.prompt`),其余能力——休眠唤醒、活记忆注入、轮换、用量——**零改动继承**。模型退化成 agent 定义里的一个字符串:

```yaml
- id: hy3-helper
  engine: mac-oc          # 指到跑 OpenCode 的引擎
  model: tencent-token-plan/hy3
```

换模型 = 改这个字符串。验收那天,混元驱动的 agent 在同一套管线里完成了多轮对话、活记忆落盘、token 归属显示——和 Claude 系 agent 无差别。

一个诚实的代价:OpenCode 是编码 harness,每轮会注入完整系统提示与工具定义(约 2 万 input token 的固定开销)。它适合当"干活 agent",不适合高频闲聊——**按任务选模型**,便宜活便宜模型,硬 agentic 活强模型。

## agent 问 agent:ask_agent 的原理

平台从"人 → agent"升级为"agent → agent 网络"的那块砖,是一个约 300 行、零依赖的 **stdio MCP 服务器**。它不跑任何模型,只做一件事:把"某个 agent 调用了 `ask_agent(目标, 问题)` 工具"翻译成**对控制面的一次 HTTP 请求**,让被问的 agent 走一遍和真实消息完全相同的调度管线。

```
① Agent A 调用工具 ask_agent("B", 问题)
② A 身边的 MCP 子进程 → POST 控制面 /api/ask(bearer 现读,不落配置)
③ 控制面护栏:发起者校验 → 允许名单 → 环检测 → 深度上限
④ 控制面按标准流程派发 B → B 回答
⑤ 答案作为工具结果,内联出现在 A 的推理里(有界等待,超时按跳过)
```

<div class="affig"><svg viewBox="0 0 780 240" role="img" aria-label="ask_agent 回旋镖路径">
  <defs><marker id="fg3" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.4"/></marker></defs>
  <rect x="20" y="24" width="330" height="190" rx="10" fill="none" stroke="var(--line)" stroke-dasharray="3 5"/>
  <text x="40" y="46" class="mono">工作 Mac(双方的"身体")</text>
  <rect x="40" y="60" width="130" height="48" rx="6" class="box core"/>
  <text x="105" y="80" text-anchor="middle" class="lbl">Agent A</text>
  <text x="105" y="97" text-anchor="middle" class="sm">调用 ask_agent 工具</text>
  <rect x="40" y="150" width="130" height="48" rx="6" class="box"/>
  <text x="105" y="170" text-anchor="middle" class="lbl">MCP 子进程</text>
  <text x="105" y="187" text-anchor="middle" class="sm">stdio · 零依赖</text>
  <rect x="200" y="60" width="130" height="48" rx="6" class="box core"/>
  <text x="265" y="80" text-anchor="middle" class="lbl">Agent B</text>
  <text x="265" y="97" text-anchor="middle" class="sm">走标准派发被唤醒</text>
  <rect x="480" y="90" width="200" height="70" rx="6" class="box warm"/>
  <text x="580" y="113" text-anchor="middle" class="lbl">dispatch · 常驻主机</text>
  <text x="580" y="131" text-anchor="middle" class="sm">允许名单 · 环检测 · 深度上限</text>
  <text x="580" y="148" text-anchor="middle" class="sm">全程 trace 审计</text>
  <path d="M105 108 L105 150" class="arrow" marker-end="url(#fg3)"/>
  <text x="112" y="133" class="sm">①</text>
  <path d="M170 174 Q400 200 500 150" class="arrow strong" marker-end="url(#fg3)"/>
  <text x="350" y="203" class="sm">② POST /api/ask(bearer)</text>
  <path d="M480 105 Q380 60 330 78" class="arrow strong" marker-end="url(#fg3)"/>
  <text x="380" y="62" class="sm">③④ 护栏通过 → 派发 B</text>
  <path d="M200 74 L170 74" class="arrow dash" marker-end="url(#fg3)"/>
  <text x="152" y="66" class="sm">⑤ 答案内联返回</text>
</svg></div>

有意思的是物理路径:控制面在常驻主机上,而问答双方的"身体"可能都在我的工作 Mac 上——一条问题走的是"本机 → 控制面 → 本机"的回旋镖。这不是浪费:换来的是**所有 agent 间通信都经过同一个有审计、有护栏、有 trace 的入口**。同一个 MCP 进程里还住着 `notify_user`(agent 主动 DM 我,带限流和去重)和 `request_approval`(高危动作弹飞书审批卡,我点批准/拒绝,超时视为拒绝)。

## 治理:能力墙比信任更可靠

- **两个控制面物理隔离**:工作 bot 的控制面只有一个引擎、一个 agent,连 ask_agent 都没挂——不是"信任它不乱来",而是危险工具根本不在它手里。
- **注入防御写进每个 agent 的初始提示**:工具带回来的内容(网页、文件、日志)一律是数据,不是指令。
- **自改代码有 playbook**:owner 当轮授权 → 构建+全部检查门 → 延迟重启 → 健康探测失败自动回滚。agent 可以改自己平台的代码,但改坏了会被机器人性地拽回来。

## 可观测:从"能看日志"到"看一眼就懂"

dashboard 这周从两个标签页长成了六个:概览 / Agents / 对话 / Traces / 事件流 / 配置。几个值得记的点:

- **拓扑图**成了概览页的主角:两个控制面、共享引擎(一个节点、每个控制面各自实测延迟的入边)、每个引擎背后的链路(Cursor 云还是 OpenCode→混元)全在一张 SVG 里,点任意节点弹出详情(agent 定义连 init prompt 都能看),健康的边有定向流动动画。第一次刷新它就纠正了一条过时的文档记载——一条被认为不可达的链路其实通着,只是延迟高。**测量胜过记忆。**
- **对话页**:直接在看板上和任意 agent 聊,默认走临时会话(不打扰真 agent),每条回复带耗时、真实模型 id、token 数和 trace 跳转。
- 事件流的 16 种事件全部人话化;trace 详情从 JSON 墙变成步骤时间线。

## 工程方法:Fable 规划,Cursor 执行

这套东西大部分代码不是我(也不是某一个模型)逐行敲的。工作流是:

1. **Claude(Fable)做架构与规格**:探索代码、写 OpenSpec 变更(proposal/design/tasks/spec)、把任务蒸馏成执行 spec;
2. **派发给 headless Cursor agent 执行**,在独立 git worktree 里干活(和其他并行工作物理隔离);
3. **Fable 审查**:不信执行器的自述,重新跑全部检查脚本、亲眼读 diff、抽查关键契约点,通过才 commit;
4. 每单出一张**评分卡**(A–F,一次返工封顶 C)——"最终过了"和"一把过"在账面上是两回事。

配套的验证纪律:两个仓库共 7 套检查脚本必须全绿;mock 检查之上,**真机端到端验证**(真实飞书消息、真实模型回复、真实日志行)才算数,汇报时写明验证到哪一级。

本周四单派发:三单 A、一单 B(那单 B 是执行器试图一次性写出 1200 行文件把工具调用撑爆了——修正方式是把"单次写入不超过 150 行"写成硬规则,之后全部一把过)。

## 接下来

- **eval 地基**:现在能度量"管道对不对",还不能度量"agent 行为好不好"。一套场景回归集是自我改进循环的前提。
- **记忆检索**:活记忆目前是"整文件注入",上限就是上下文窗口;要长期变聪明,得上选择性召回。
- 把云 VM 的引擎升级到最新协议,以及把三个定时任务(心跳/任务巡检/记忆蒸馏)在新控制面上复活。

平台的部分渐渐稳了。接下来的问题不再是"机制缺不缺",而是"这个 agent 到底好不好用"——那是另一篇文章的事了。
