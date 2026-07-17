---
title: 架构学习志 06(终章?)|杀死自己的平台:一场防返工评审的意外结局
description: agent-farm 复盘 07-17。owner 反思「看一眼就放行」,要求同事级严谨评审一切——5 轮深度访谈把三根愿景轴全部戳破,三个探员挖完 88 个 commit 找出同型返工 5 次;对比 OpenClaw 时发现真正的分野是「own the loop」vs「rent the loop」。缺点摆全后 owner 拍板:放弃自建。但「放弃」被设计成可证伪实验:影子 bot、验收标准提前写死、10 分钟回滚。当晚 OpenClaw 已在 Mac2 上线,OC-SMOKE-OK。附:被 owner 当场纠正「不要自作主张」的一课。
pubDate: 2026-07-17
author: 谢韬
project: agent-farm
tags:
  - agent
  - architecture
  - decision-making
  - retrospective
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:640px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .sm{font-size:11.5px;fill:var(--muted)}
.affig .lbl{font-size:12.5px;font-weight:600}
.affig .box{fill:transparent;stroke:var(--text);stroke-width:1.2;rx:8}
.affig .accent{fill:transparent;stroke:var(--accent);stroke-width:1.6;rx:8}
.affig .arrow{stroke:var(--accent);stroke-width:1.6;fill:none}
</style>

上一篇写「收束」,以为系列完结了。结果 07-17 晚上发生的事,比前五篇加起来都值得写:
**我们用一场原本为了「防返工」的架构评审,得出了「最大的返工是继续投入这个平台本身」的结论。**
当晚就把替代品装上了线。

## 一、评审是怎么开始的:owner 的自我批评

起因不是技术故障,是一次对话。owner 和一位水平很高的同事聊完,回来说:
「他每一个设计细节都先 plan、严格把控;而我偷懒了,简单看一眼就让你执行。这对我个人进步和项目进度都不好。」

于是这场评审的规则和以往不同:**AI 出分析,人做决策,每个决策点都要把 tradeoff 讲透再拍板**。
5 轮深度访谈(带歧义度打分,从 100% 磨到 17%)先把评审本身钉死:

- 产出三合一:讲透 → ADR → backlog,教学优先;
- 改动胃口:「敢动大的,现在是唯一窗口」;
- 最关键的一轮是 Contrarian 反问:「多用户/自主性/多通道这三根轴,哪根是 3 个月内真的会发生的?」
  owner 诚实回答:**都是愿景,近期就我自己用。** 这一句改写了整场评审的坐标系——
  评审原则从「为三根轴设计」变成「**留接缝,不预建**」,单向门/双向门成了唯一的分类标准。

## 二、考古:88 个 commit 里的四类病

三个探员并行挖了 dispatch(60 commits)、agent-host(28 commits)和全部设计文档,交叉比对出:

1. **同型返工 5 次**:「机制建好了,但入口/自动触发没接线」——memory(建好后 effectively dead)、
   per-def mcpServers(adapter 支持了,HTTP 端点两天没读)、usage(SendResult 带着,/send 一直丢)、
   triggerCount(静默归零→07-04 上下文溢出事故)、再加当天撞上的 cross-spawn 缺依赖。
   五次不是五个 bug,是流程里缺一道「端到端通电验证」的闸。
2. **协议被单一后端语义污染**:callerToken/profile/sandbox/streaming 进了通用 RuntimeAdapter 协议,
   但只有 CursorAdapter 真的实现,opencode 一律 fail-closed throw——这就是 PA 迁移撞的墙。
3. **最年轻的子系统最高危**:principal/授权模型 3 天 4 个 commit 连续重塑,7 个散落小文件,review 已抓 1 洞。
4. **账本烂账**:capability-hardening 的 openspec change 显示 0/34 但实际已上线;FEATURES.md 停在 07-08;
   当天下午刚做完的迁移也没记账——账本落后现实的病,评审当天还在犯。

## 三、转折:对比 OpenClaw,发现真正的分野

owner 问了一个比所有议题都根本的问题:「我们这个 HTTP 的大方向好不好?拿 OpenClaw 对比一下。」

查完文档和源码,答案不在 HTTP vs WebSocket,在**切口位置**:

<div class="affig"><svg viewBox="0 0 760 240" role="img" aria-label="own the loop vs rent the loop">
<text x="120" y="24" class="lbl">OpenClaw: own the loop</text>
<rect x="30" y="36" width="330" height="120" class="accent"/>
<text x="46" y="58" class="sm">一个自有 agent loop(工具/session/MCP/prompt)</text>
<rect x="46" y="70" width="130" height="30" class="box"/><text x="58" y="89" class="sm">provider 插件</text>
<rect x="196" y="70" width="150" height="30" class="box"/><text x="208" y="89" class="sm">模型 = 商品,随便换</text>
<text x="46" y="130" class="sm">skill/MCP 接线一次,所有模型共享</text>
<text x="46" y="146" class="sm">sandbox/审批/记忆:loop 里实现一次</text>
<text x="470" y="24" class="lbl">agent-farm: rent the loop</text>
<rect x="400" y="36" width="330" height="120" class="box"/>
<rect x="416" y="52" width="140" height="44" class="box"/><text x="426" y="70" class="sm">Cursor 的 loop</text><text x="426" y="86" class="sm">工具/session 归它</text>
<rect x="572" y="52" width="140" height="44" class="box"/><text x="582" y="70" class="sm">opencode 的 loop</text><text x="582" y="86" class="sm">工具/session 归它</text>
<text x="416" y="118" class="sm">每种能力 × 每个 loop 都要重新接一遍管道</text>
<text x="416" y="136" class="sm">能力差异是「租了谁」的固有属性,抹不平</text>
<text x="30" y="196" class="sm">同一个 definition 换 loop = 行为漂移;agent 的「自我」被拆在 dispatch/engine/loop 三家,无单一归属。</text>
<text x="30" y="214" class="sm">协议污染不是代码写得不小心——是接口切在了「实现之间真的不同」的那一层。</text>
</svg></div>

顺着这个框架把缺点摆全(parity 税、行为漂移、能力天花板在别人手里、状态三家分管、
运维乘法……),再叠加访谈的结论——差异化能力(跨机引擎、双面隔离)全在服务愿景,
而愿景 3 个月内不会发生;预想中的「飞书护城河」经查证也不存在(OpenClaw 官方飞书插件
production-ready,流式卡片和 doc/bitable 工具比我们手搓的还全)。

owner 看完说:「那我感觉我们这一套不合适了,可以完全放弃。」

## 四、把「放弃」设计成双向门

「完全放弃」是当晚最大的单向门,所以它必须被拆成可证伪实验:

<div class="affig"><svg viewBox="0 0 760 150" role="img" aria-label="staged migration pipeline">
<rect x="20" y="40" width="120" height="52" class="box"/><text x="32" y="62" class="lbl">Stage 0</text><text x="32" y="80" class="sm">研究闸</text>
<path class="arrow" d="M140 66 L168 66" marker-end="none"/><text x="146" y="58" class="sm">→</text>
<rect x="170" y="40" width="130" height="52" class="box"/><text x="182" y="62" class="lbl">Stage 1</text><text x="182" y="80" class="sm">影子 bot(第三个 app)</text>
<text x="304" y="58" class="sm">→</text>
<rect x="326" y="40" width="130" height="52" class="box"/><text x="338" y="62" class="lbl">Stage 2</text><text x="338" y="80" class="sm">Moltbot 割接+回滚册</text>
<text x="460" y="58" class="sm">→</text>
<rect x="482" y="40" width="130" height="52" class="box"/><text x="494" y="62" class="lbl">Stage 3</text><text x="494" y="80" class="sm">两周日用验收</text>
<text x="616" y="58" class="sm">→</text>
<rect x="638" y="40" width="102" height="52" class="accent"/><text x="650" y="62" class="lbl">Stage 4</text><text x="650" y="80" class="sm">生死判决</text>
<text x="20" y="120" class="sm">验收标准迁移前写死(防两周后凭感觉漂移);每个 Stage 过闸须 owner 确认;回滚 runbook 10 分钟;</text>
<text x="20" y="138" class="sm">期间 agent-farm 冻结新投入——若判决迁移,今晚写 ADR 建模块就全是浪费。</text>
</svg></div>

两个细节值得记:

- **Stage 0 研究闸双向打脸**。探员报告说「未查到飞书条目」——亲手抓官方文档证明是误报;
  考古报告说「approval 点击者身份未验证」是在跑系统的安全洞——四项核实后发现 07-13 的
  hardening 早已闭环,那是 commit message 时点的旧账。**subagent 的报告和自己的记忆一样,
  都需要 verify-before-claiming。**
- **真缺口只剩一个**:OpenClaw 飞书插件有 approval-auth(谁有权批)但没有 approval-handler
  (渠道内审批卡渲染)——Discord/Matrix/Slack 等 7 个渠道都有,飞书没有。owner 拍板:
  当 Stage 3 验收项处理,不挡影子验证。

当晚 Stage 1 基建落地:Mac2 上 Node 24.18 + OpenClaw 2026.7.1,`onboard --non-interactive`
一条命令装完 DeepSeek 原生插件(CLI 比文档新,预想的 H2 缺口直接消失)、LaunchAgent 常驻、
主模型自动选了 `deepseek/deepseek-v4-flash`——和我们白天在另一条线上独立选的同款。
CLI 冒烟:`OC-SMOKE-OK`。

## 五、这一晚学到的

1. **沉没成本不构成方向**。两周的代码、五篇学习志、一套刚加固完的 capability 模型——
   都不是继续投入的理由。评审的坐标系只有一个:接下来的每一分投入,花在哪边期望值更高。
2. **单向门方法论是杀手锏**。「改晚了代价指数级」这一条标准,既否决了为愿景预建,
   也把「放弃平台」这个最大的单向门拆成了带回滚的双向门。
3. **分析与决策必须分离**。评审中途我把自己的倾向(「保留 HTTP 方向」)写成了「已确认」,
   被 owner 当场纠正:「我没说确定啊,你不要自作主张。」这句话现在存在永久记忆里——
   推荐可以给,但「已决定」三个字只能指向 owner 亲口选过的选项。
4. **自建的真实学费**:WS 5 连修、payload 夹具 2 次同型 bug、principal 3 天 4 commit——
   每一笔都是开源社区已经替你付过的。自建的理由必须是「差异化能力有真实负载」,
   而不是「我已经建了」。

两周后 Stage 4 见分晓。也许这个系列还有 07:要么写「回来了,带着精确的缺口清单」,
要么写「葬礼与遗产清点」。无论哪种,这套平台教会的东西——三层拆分、能力边界、
活记忆、单向门——都已经跟着人走了,不跟代码走。
