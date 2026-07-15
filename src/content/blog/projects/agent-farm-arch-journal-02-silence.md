---
title: 架构学习志 02|静默的两副面孔:身份解耦、心跳,与两堂静默失效课
description: agent-farm 复盘 07-04~05:memory_key 把「短命实例」和「长命身份」掰开;[SILENT] 心跳是设计出来的静默;而同两天里,两个 commit message 不约而同写下了 silently——部署静默失败、轮换静默停摆。静默失效比报错危险十倍。
pubDate: 2026-07-15
author: 谢韬
project: agent-farm
tags:
  - agent
  - architecture
  - retrospective
  - reliability
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:680px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .lbl{font-size:13px;font-weight:600}
.affig .sm{font-size:11px;fill:var(--muted);font-weight:400}
.affig .box{fill:transparent;stroke:var(--text);stroke-width:1.2;rx:8}
.affig .dead{fill:transparent;stroke:var(--muted);stroke-width:1.2;stroke-dasharray:4 4;rx:8}
.affig .idline{stroke:#2e9d7b;stroke-width:2.6;fill:none}
.affig .arrow{stroke:var(--muted);stroke-width:1.4;fill:none}
.affig .x{stroke:#b3564a;stroke-width:1.8}
</style>

> 架构学习志系列第二篇(上一篇:[创世日](/blog/agent-farm-arch-journal-01-genesis-day/))。创世日结束时,系统能收消息、跨机器干活、被看见。接下来两天回答两个更难的问题:**它怎么活得久?它怎么自己动?**——然后被「静默失效」结结实实上了两课。

## 短命实例,长命身份

07-04 早上 08:34,dispatch 和 agent-host 在同一分钟各落一个 commit:**memory_key**。

它解决的问题一句话讲清:系统里已经有了轮换(context 涨满换实例)和自愈(agent 丢了就重建),**agent 的 id 注定要变**;但「这是同一个助手、它记得你」不能变。记忆若挂在 id 上,每次轮换都是一次失忆。

<div class="affig"><svg viewBox="0 0 860 240" role="img" aria-label="实例与身份的生命周期解耦">
  <defs><marker id="gj2m" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.4"/></marker></defs>
  <text x="16" y="30" class="lbl">实例(短命,id 会变)</text>
  <rect x="40" y="48" width="180" height="44" class="dead"/><text x="56" y="70" class="sm">agent-c862…</text><text x="56" y="86" class="sm">context 涨满 → 轮换</text>
  <line x1="196" y1="56" x2="212" y2="84" class="x"/><line x1="212" y1="56" x2="196" y2="84" class="x"/>
  <rect x="260" y="48" width="180" height="44" class="dead"/><text x="276" y="70" class="sm">agent-06ac…</text><text x="276" y="86" class="sm">404 → 自愈重建</text>
  <line x1="416" y1="56" x2="432" y2="84" class="x"/><line x1="432" y1="56" x2="416" y2="84" class="x"/>
  <rect x="480" y="48" width="180" height="44" class="box"/><text x="496" y="70" class="sm">agent-a090…</text><text x="496" y="86" class="sm">当前活着</text>
  <line x1="220" y1="70" x2="256" y2="70" class="arrow" marker-end="url(#gj2m)"/>
  <line x1="440" y1="70" x2="476" y2="70" class="arrow" marker-end="url(#gj2m)"/>
  <path d="M40,150 C 240,150 460,150 820,150" class="idline"/>
  <text x="16" y="185" class="lbl" fill="#2e9d7b">身份(长命):memory_key + 活记忆 —— 跨越所有实例,一直是「同一个助手」</text>
  <text x="16" y="216" class="sm">规则:系统里存在任何「会换 id 的替换机制」(轮换/自愈/扩缩容/蓝绿)时,立刻问——哪些东西不该跟着 id 一起死?</text>
</svg></div>

更妙的是反向影响:**正因为记忆解耦了 id,轮换才敢放手换实例**——代价从「失忆」降到「新实例冷启」。解耦不只是整洁,它给了另一个机制「敢做」的胆量。

## 会自己动的系统,需要「降噪协议」

同一天,cron 触发器 + 主动投递上线,agent 第一次不等人说话就行动。傍晚,基础设施哨兵(sentinel)开始每 30 分钟体检一次。

主动性有个隐藏成本:**一个每半小时汇报「一切正常」的系统,比不汇报更糟**——它训练你忽略它,真出事的那条也会被划走。所以配套上线了 `[SILENT]` 协议:sentinel 检查完若一切正常,在回复末行打 `[SILENT]` 标记,dispatch 看到标记就不投递;次日再迭代成「只在状态**翻转**时报警」(正常→异常 说话,异常→恢复 也说话)。

注意责任分配:**模型判断「这次值不值得打扰主人」(输出意图信号),代码执行投递决策(看到标记就拦)。**判断给模型、动作给代码——「确定性归代码,判断归模型」这条主原则在混合场景下的标准解法。

## 两堂静默失效课

同两天里,有两个 commit message 不约而同写下了 "silently":

**第一课(07-04 18:06)**:`run main() unconditionally — argv guard **silently** killed PM2 deploys`。一个看似无害的入口守卫,在 PM2 的启动方式下不成立——部署「成功」了,进程「在跑」,但 main() 从没执行。没有报错,没有崩溃,什么都没有。

**第二课(07-05 19:28)**:`persist triggerCount in AgentMeta — reset_after rotation was **silently** dead`。轮换计数器只活在内存,每次休眠→恢复清零,`reset_after: 12` 永远数不到 12。机制「存在」、配置「正确」、测试「通过」——但它**从上线起就没工作过**,直到助手的 context 从 38k 涨到 187k、逼近 300k 硬顶才被发现。

两课的共同结构值得背下来:

> **静默失效 = 机制存在 + 无人验证它发生过。**报错会喊,崩溃会倒,静默失效只是安静地不工作——比前两者危险十倍,因为系统在假装健康。

由此得到这两天最贵的两条规则:

1. **每一个「应该周期性发生的事」(轮换/备份/清扫/心跳),都需要一个「没发生时会叫」的东西。**别检查「它配置了吗」,要检查「它上次发生是什么时候」。讽刺而工整的是:这两天上线的心跳哨兵,恰是这条教训的制度化——用设计出来的静默(`[SILENT]`),消灭意外的静默(silent failure)。
2. **签下「所有 X 都必须 Y」式决策的当场,把 X 列成清单逐项核对。**triggerCount 案的根因在创世日就种下了:选「零数据库、磁盘元数据持久化」= 签约「所有跨休眠必须连续的状态都要落盘」,但没人当场列状态清单,于是漏了一项。这比「以后小心点」具体一万倍。

## 尾声:一个 30 行的小 commit,一条大原则

07-05 还有个不起眼的改动:send 的返回从「配置里的 model 别名」改成**真实解析后的 model id**。小事,但原则通用:**别让上游拿着「它以为的配置」过日子,把「实际生效的」回传。**配置漂移的可观测化,也是反静默失效的一种。

## 自测三题

1. memory_key 若不解耦,轮换机制还敢上线吗?在你的系统里找一个「解耦给了另一个机制胆量」的类似依赖对。
2. 你的系统里有哪些「应该周期性发生的事」?对每一件回答:它上次发生是什么时候,你怎么知道的?
3. `[SILENT]` 为什么不设计成「dispatch 用规则判断该不该投递」,而要模型打标记?两种方案各自的失效模式是什么?

> 系列第一篇:[创世日——学的不是快,是决策顺序](/blog/agent-farm-arch-journal-01-genesis-day/)。下一篇会讲一个并行 AI session 两天里踩过的坑——真实事故是最好的架构课。
