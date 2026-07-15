---
title: 架构学习志 05(收束)|能力先行,边界后补:从一条品味到一个技术闭环
description: agent-farm 复盘 07-12~15,系列收束。一个测试暴露定时任务授权靠 prompt 绑死——能力债被照出来。加固把「嘴上说的边界」焊成「技术上做不到」:可撤销 principal、per-run token、审批 terminal-cancel。review 三路独立审抓出部署炸弹(42/59 存量 agent 会被 brick),canary 真机确证。首尾闭环:owner 12 天前「底层操作不该给 LLM」的品味,原来是一条架构原则。
pubDate: 2026-07-15
author: 谢韬
project: agent-farm
tags:
  - agent
  - architecture
  - security
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

> 架构学习志系列收束篇(前四篇:[01 创世日](/blog/agent-farm-arch-journal-01-genesis-day/) · [02 静默的两副面孔](/blog/agent-farm-arch-journal-02-silence/) · [03 五层静默失败](/blog/agent-farm-arch-journal-03-five-silent-failures/) · [04 控制面搬家](/blog/agent-farm-arch-journal-04-more-faces/))。这一篇我全程亲历:能力边界加固的 review → 修 → 部署 → canary 确证。

系列的最后一篇,回到第一篇的起点。我做这个项目的初心是一条品味:**「Slack 回复这种底层操作,不该留给 LLM 自己做。」**这周发生的事,是同一条品味在更高一层的第二次应用——而这次,它闭环了。

## 导火索:一个测试暴露的洞

07-12 单群 E2E 时两条用例卡住:**定时任务的授权来源由静态环境变量绑死到 owner 私聊**。看似小配置问题,实则是能力边界的洞——agent 从 07-05 起就能自建定时任务、互相问、主动通知、审批,但这些能力当时**只有 prompt 在管**(init_prompt 写着「高风险动作只能由主人直接授权」)。测试逼出真相:**prompt 里的一句话,不是边界。**被 injection 套话的 agent,或 origin 绑错的定时任务,能绕过它。

> 能力债和技术债不一样:技术债让你改得慢,能力债让你不安全。它平时完全看不见(没人攻击时一切正常),直到一个测试用例、或一次真实攻击把它照出来。**给任何「目前靠自觉/靠 prompt 约束」的地方记一笔账,它迟早要换成技术强制。**

## 把「嘴上说」焊成「做不到」

加固的核心是把能力从 prompt 约束换成技术闭环:可撤销的 HMAC principal(能即时撤销,不等过期)、只在当前这轮 run 有效的 per-run token、反向调用必须绑定活跃 dispatch 调用(定时任务零反向能力)、以及最关键的审批:

> **Approval 若只是 prompt 里的一句「STOP」,不是安全边界。**必须 terminal cancel——高危操作弹卡片给真实 owner 点,点之前那轮 run 被进程级掐断;失败还升级到撤权、隔离、强杀,最后 fail-stop 兜底。

这就是初心的第二次应用。第一次:**投递**不能靠 LLM 自觉(agent 没有「回复飞书」的工具)。这次:**安全**不能靠 LLM 自觉(agent 没有「自己决定停不停」的权力)。同一个形状——**把不能出错的决定,从模型手里拿走,交给确定性代码。**

## review:独立三审,抓出部署炸弹

07-15 我 review 时第一个决定是**不自审**——派三个互不通气的 reviewer(dispatch 代码 / agent-host 代码 / 跨仓安全设计)。

> 审查自己刚写的东西会继承写它时的盲区。独立性来自「不共享上下文」——三个 reviewer 谁也不知道别人看什么,才各自撞见不同问题。

安全设计审结论是好的(模型成立、fail-closed、无越权绕过);但代码审抓出一个部署炸弹:**新代码 resume agent 时严格校验 metadata 形状,而线上 59 个存量 agent 里 42 个是旧格式**——直接部署会让这 42 个(含休眠中的主助手)永久无法恢复,还报 500 不触发自愈。我实测数过。这条 bug 的代码逻辑完全正确,它只是假设了所有 metadata 都是新格式。

> 最危险的 bug 不在「新写的代码错了」,在「新代码和**存量数据/线上现实**的接缝处」。每次改动一个读历史数据的格式/校验,先去线上数一遍:有多少旧数据会撞上你的新假设。

## 部署:canary,与那个「不 canary」的下午

修完部署到 Mac2:备份 → 只改必要 config(只动 2 个 definition) → 先执行面后控制面重启(带自动回滚) → rotate → **canary**。canary 那步最关键:让主助手真的通过 ask_agent 问哨兵,18.5 秒成功拿回真实回答——这才**真机证明**了 per-run token 确实到达 MCP 并通过鉴权(review 里最大的、mock 测不出的未验证项)。

为什么死磕 canary?因为[第三篇](/blog/agent-farm-arch-journal-03-five-silent-failures/)那个下午就是「不 canary」的代价:一份部署报告说「硬化已上线、审批会拦截」,线上根本没生效,害得一下午考古。**「部署报告说做了」≠「线上真在跑」,安全功能尤其:必须真机触发、亲眼看见它拦截。**

## 收束:一条品味,两次应用,一个闭环

<div class="affig"><svg viewBox="0 0 660 210" role="img" aria-label="同一条原则的两次应用">
  <rect x="20" y="30" width="270" height="120" class="box"/><text x="36" y="54" class="lbl">第一次(创世日)</text>
  <text x="36" y="78" class="sm">场景:消息投递</text><text x="36" y="98" class="sm">错:LLM 自己回复消息</text><text x="36" y="118" class="sm">对:agent 只出文本,投递归代码</text>
  <rect x="370" y="30" width="270" height="120" class="accent"/><text x="386" y="54" class="lbl" fill="var(--accent)">第二次(本周)</text>
  <text x="386" y="78" class="sm">场景:高危操作安全</text><text x="386" y="98" class="sm">错:prompt 里让 agent 别乱来</text><text x="386" y="118" class="sm">对:agent 只出意图,边界归技术</text>
  <path d="M290,90 L370,90" class="arrow" marker-end="url(#c5m)"/>
  <defs><marker id="c5m" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.6"/></marker></defs>
  <text x="20" y="188" class="sm">同一条原则:不能出错的决定,从模型手里拿走,交给确定性代码。</text>
  <text x="20" y="204" class="sm">12 天前的一丝不适,原来是一条架构原则——只是当时还没被说成一句话。</text>
</svg></div>

我 12 天前凭品味感到的那一丝不适(「底层操作不该给 LLM」),不是功能偏好——它是一条**架构原则**,只是当时没被说成一句话。这个系列做的事,就是把它显影:从一次「看着不舒服」,到一个跑在四台机器上、经真机 canary 确证的技术闭环。

**这也是整个「架构学习志」想教的元能力:你的品味里藏着原则。**vibe coding 时它们默默生效又默默流失;把它们一条条捞出来、说成话、连成线——那一刻,你就从「提需求的人」变成了「能解释自己为什么这么选的人」。那就是架构师。

## 自测三题

1. 你的系统里现在有哪些「靠自觉/靠约定/靠 prompt」在守的边界?各记一笔能力债——哪个最先该换成技术强制?
2. 你上次 review 自己的代码,是真独立,还是继承了写它时的假设?怎么给自己制造「不共享上下文」的第二视角?
3. 你最近一次改「读历史数据的格式校验」,去线上数过有多少旧数据会撞上新假设吗?

> 系列完。五篇回看:[01](/blog/agent-farm-arch-journal-01-genesis-day/) · [02](/blog/agent-farm-arch-journal-02-silence/) · [03](/blog/agent-farm-arch-journal-03-five-silent-failures/) · [04](/blog/agent-farm-arch-journal-04-more-faces/) · 05。谢谢陪我把一个项目的思考过程,一天一天走完。
