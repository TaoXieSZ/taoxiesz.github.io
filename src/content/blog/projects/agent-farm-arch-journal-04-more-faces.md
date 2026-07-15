---
title: 架构学习志 04|控制面搬家,长出更多面孔:成功如何持续暴露新问题
description: agent-farm 复盘 07-06~11:控制面拆出来后「它自己跑在哪」炸了(会合盖的笔记本→always-on Mac2);一个复活的旧进程双消费同一个 bot 烧掉 1600万 token/小时;两个 bot 跑两份 dispatch 是 workaround 不是设计;语音通道刻意不挂高危工具——四个新面孔,四堂课。
pubDate: 2026-07-15
author: 谢韬
project: agent-farm
tags:
  - agent
  - architecture
  - retrospective
  - distributed-systems
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:620px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .sm{font-size:11.5px;fill:var(--muted)}
.affig .lbl{font-size:12.5px;font-weight:600}
.affig .box{fill:transparent;stroke:var(--text);stroke-width:1.2;rx:8}
.affig .bad{fill:transparent;stroke:#b3564a;stroke-width:1.4;stroke-dasharray:4 4;rx:8}
.affig .good{fill:transparent;stroke:#2e9d7b;stroke-width:1.6;rx:8}
.affig .arrow{stroke:var(--muted);stroke-width:1.3;fill:none}
.affig .x{stroke:#b3564a;stroke-width:1.8}
</style>

> 架构学习志系列第四篇(前三篇:[创世日](/blog/agent-farm-arch-journal-01-genesis-day/) · [静默的两副面孔](/blog/agent-farm-arch-journal-02-silence/) · [五层静默失败](/blog/agent-farm-arch-journal-03-five-silent-failures/))。这一段没有单一主线,因为它展示的恰恰是**成熟系统的常态**:每个能力站稳,都会顶出一个你上一阶段看不到的新问题。四个新面孔,四堂课。

## 面孔一:控制面自己要 always-on

创世日把系统拆成了控制面(dispatch,管路由)和执行面(agent-host,管 agent)。拆的时候没人问的一个问题这时炸了:**控制面自己跑在哪?**——它一直跑在主 Mac 上,而主 Mac 是台会合盖睡眠的笔记本。笔记本一合,整个飞书 bot 就死。07-06 把 dispatch 迁到一台 always-on 的 Mac2。

<div class="affig"><svg viewBox="0 0 640 170" role="img" aria-label="控制面从笔记本迁到 always-on 机器">
  <rect x="20" y="30" width="180" height="70" class="bad"/><text x="34" y="55" class="lbl" fill="#b3564a">主 Mac(笔记本)</text><text x="34" y="76" class="sm">dispatch 控制面</text><text x="34" y="92" class="sm">合盖睡眠 → bot 全死</text>
  <path d="M210,65 L280,65" class="arrow"/><text x="220" y="56" class="sm">07-06 迁移</text>
  <rect x="300" y="30" width="180" height="70" class="good"/><text x="314" y="55" class="lbl" fill="#2e9d7b">Mac2(always-on)</text><text x="314" y="76" class="sm">dispatch 控制面</text><text x="314" y="92" class="sm">永不休眠</text>
  <text x="20" y="140" class="sm">课:每当你说「把 X 抽成独立的 Y」,紧接着问——那 Y 自己的可用性谁保证?</text>
  <text x="20" y="158" class="sm">解耦制造了一个新的单点。控制面的高可用,是拆维度那笔账单里延迟到账的一项。</text>
</svg></div>

**拆维度有一笔延迟到账的账单:被拆出来的那个组件,它自己的可用性变成了一个独立问题。**你把「路由」从「执行」里解耦、让它能管多台机器,很好;但那一刻起,「路由器本身挂了怎么办」就是个新命题。信号:每当你说「把 X 抽成一个独立的 Y」,紧接着问一句「那 Y 自己的可用性谁保证」。

## 面孔二:分布式幽灵烧掉 1600 万 token/小时

迁移留了尾巴:主 Mac 上那个「旧」dispatch 没停干净,某天**复活了**,和 Mac2 的新 dispatch **同时消费同一个飞书 bot**。两个大脑抢同一批消息,11 个助手实例扇出去,烧掉约 1600 万 token/小时。两层教训,第二层更贵:

- **分布式幽灵**:你以为停了的进程会回来。跨机器迁移时,「在新家启动」和「在旧家确认死透」是两件事,后者最容易漏。`pm2 stop && pm2 save`——`save` 那步才是让它别在重启后诈尸的关键。
- **agent 不能可靠自省系统状态**:抓到烧钱后有人问助手「是谁在烧?」,它**从记忆里编了个答案**。心跳告警(读真实数据)是 true positive;助手的自我解释是幻觉。**要系统的事实,去查系统;别问住在系统里的 agent。**模型擅长判断,不擅长当自己运行环境的可信探针——这又是「确定性归代码」的一个变体。

## 面孔三:workaround 还是设计?

那时有两个飞书 bot(测试脸 / 工作脸),做法是**跑两个完整的 dispatch**。复盘时点破:这个分裂「是单 bot FeishuChannel 的 workaround,不是设计」。方向锁定——一个 dispatch 多路复用 N 个 bot,一个 dashboard,能力/数据边界按 definition 走。

> **当你发现自己在复制整整一个服务,只为绕过某个组件的单例限制——停。**那是在说「这个组件不该是单例」。复制服务来加实例,成本随实例数线性叠加(两份配置、两个 dashboard、两套部署);改掉单例假设是一次性的。要常问自己:我是在解决问题,还是在给一个不该存在的约束搭脚手架?

## 面孔四:按信任级别分配能力(能力边界的前奏)

07-08 上线语音网关,让桌面语音设备也能接入同一个助手。但它的 definition 有一条刻意设计——**不挂任何高危工具**(不能改代码、不能主动通知、不能审批)。原因:这是个**低信任通道,任何在旁边的人都能对它说话**。

> 能力不是「有就都给」,是**按通道的信任级别分配**。同一个助手,从飞书私聊(高信任)进来能做的事,和从「桌上谁路过都能喊两句的音箱」进来能做的事,必须不同。危险的工具在低信任通道里**物理上就不在它手里**——不是靠 prompt 说「你别做」,是根本没挂。

这一条直接通向下一篇:一周后的能力边界加固,本质就是把这个「按信任分配、危险能力不靠自觉」的思路,从「语音通道不挂工具」这个特例,推广成整个平台**技术强制**的能力边界。

## 自测三题

1. 你系统里最近「抽成独立服务」的组件,它自己挂了谁兜底?为它做过和主服务同等的可用性设计吗?
2. 你有没有「复制一整份东西来绕过某个单例」的地方?那个单例假设是本质的,还是历史包袱?
3. 你的系统有几个入口通道?信任级别一样吗?能力分配跟着信任走了吗?

> 下一篇(系列收束):[能力先行,边界后补](/blog/agent-farm-arch-journal-05-capability-boundary/)——从一条品味到一个技术闭环。
