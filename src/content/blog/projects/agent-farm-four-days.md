---
title: 四天,从两个归档仓库到一个会自我修改的分布式 Agent 平台
description: personal-agent-runtime 的诞生记:飞书是入口,dispatch 是大脑,两台机器上的 agent-host 是躯体。它会记事、会主动说话、会消化记忆、会互相委派、会改自己的代码并安全重启——30+ 个 feature,绝大多数经真实流量验证。
pubDate: 2026-07-06
author: 谢韬
project: agent-farm
tags:
  - agent
  - feishu
  - architecture
  - self-modification
  - infrastructure
---

<style>
.affig{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 16px}
.affig svg{display:block;min-width:720px;width:100%;height:auto}
.affig text{font-family:inherit;fill:var(--text)}
.affig .lbl{font-size:13px;font-weight:600}
.affig .sm{font-size:11px;fill:var(--muted);font-weight:400}
.affig .band{font-size:11px;font-weight:700;letter-spacing:.15em;fill:var(--muted)}
.affig .mono{font-family:var(--font-mono);font-size:10.5px;fill:var(--muted)}
.affig .box{fill:var(--surface);stroke:var(--line);stroke-width:1.2}
.affig .core{fill:var(--accent-soft);stroke:var(--accent)}
.affig .warm{fill:transparent;stroke:#b07f2e}
.affig .viol{fill:transparent;stroke:#7a7dc9}
.affig .arrow{stroke:var(--muted);stroke-width:1.4;fill:none}
.affig .arrow.strong{stroke:var(--accent);stroke-width:1.8}
.affig .arrow.dash{stroke-dasharray:5 4}
.affig .zone{fill:none;stroke:var(--line);stroke-width:1;stroke-dasharray:3 5}
</style>

从归档的两个旧仓库(单体形态的 trigger + api-server)里,提取出"分布式 Agent"的内核,四天(2026-07-03 → 07-06)长成了一个平台:

- **2 个独立仓库**(dispatch / agent-host),**2 台机器**(工作 Mac + 云端 VM)
- **30+ 个 feature**,绝大多数经真实流量验证;**5 套检查脚本全绿**(200+ 断言)
- 3 个常驻 cron(心跳 / 任务自查 / 记忆蒸馏),每日滚动数据备份

> 这是 Agent Farm 系列的第一篇(平台诞生);[第二篇](/blog/agent-farm-personal-runtime/)讲它如何接入自托管 OpenCode 与国产模型。

## 全景架构

四层结构:渠道层收发消息,控制面路由与守护,引擎层管 agent 生命周期,后端是真正的模型。

<div class="affig"><svg viewBox="0 0 860 620" role="img" aria-label="personal-agent-runtime 架构图">
  <defs><marker id="afm" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M1,1 L8,4.5 L1,8" fill="none" stroke="context-stroke" stroke-width="1.4"/></marker></defs>
  <text x="16" y="34" class="band">渠 道 层</text>
  <text x="16" y="150" class="band">控 制 面</text>
  <text x="16" y="420" class="band">引 擎 层</text>
  <text x="16" y="580" class="band">后 端</text>
  <rect x="330" y="14" width="200" height="52" rx="5" class="box warm"/>
  <text x="430" y="36" text-anchor="middle" class="lbl">飞书(用户入口)</text>
  <text x="430" y="53" text-anchor="middle" class="sm">WSClient 长连接 · 无需公网</text>
  <rect x="60" y="110" width="740" height="230" rx="10" class="zone"/>
  <text x="80" y="132" class="mono">dispatch · PM2 常驻</text>
  <rect x="80" y="150" width="220" height="80" rx="5" class="box core"/>
  <text x="190" y="172" text-anchor="middle" class="lbl">飞书通道 · 体验层</text>
  <text x="190" y="190" text-anchor="middle" class="sm">卡片渲染 · ⏳占位卡原地编辑</text>
  <text x="190" y="206" text-anchor="middle" class="sm">排队+连发合并 · 署名页脚</text>
  <text x="190" y="222" text-anchor="middle" class="sm">/help /tasks /memory /new /stop</text>
  <rect x="330" y="150" width="220" height="80" rx="5" class="box core"/>
  <text x="440" y="172" text-anchor="middle" class="lbl">分发核心</text>
  <text x="440" y="190" text-anchor="middle" class="sm">路由(owner 锁 · @门 · 白名单)</text>
  <text x="440" y="206" text-anchor="middle" class="sm">create-or-resume · busy 重试</text>
  <text x="440" y="222" text-anchor="middle" class="sm">404 自愈 · 轮换 · 预热池</text>
  <rect x="580" y="150" width="200" height="80" rx="5" class="box warm"/>
  <text x="680" y="172" text-anchor="middle" class="lbl">cron 调度</text>
  <text x="680" y="190" text-anchor="middle" class="sm">心跳 */30([SILENT] 静默)</text>
  <text x="680" y="206" text-anchor="middle" class="sm">任务板自查 9/15/21</text>
  <text x="680" y="222" text-anchor="middle" class="sm">记忆蒸馏 04:00</text>
  <rect x="80" y="252" width="330" height="66" rx="5" class="box viol"/>
  <text x="245" y="274" text-anchor="middle" class="lbl">协作与主动 API(Bearer 保护)</text>
  <text x="245" y="292" text-anchor="middle" class="sm">/api/ask:链推导 · 循环/3跳 409 拒绝</text>
  <text x="245" y="308" text-anchor="middle" class="sm">/api/notify:3次/时 + 30分钟去重 → 🔔 DM</text>
  <rect x="440" y="252" width="340" height="66" rx="5" class="box"/>
  <text x="610" y="274" text-anchor="middle" class="lbl">Dashboard(token 墙)</text>
  <text x="610" y="292" text-anchor="middle" class="sm">每消息 trace · SSE 实时流 · 用量</text>
  <text x="610" y="308" text-anchor="middle" class="sm">YAML 校验编辑 + 热重载 · 手动轮换</text>
  <rect x="80" y="380" width="340" height="130" rx="10" class="zone"/>
  <text x="100" y="402" class="mono">工作 Mac(PA 的"身体" · 每日备份)</text>
  <rect x="100" y="414" width="300" height="80" rx="5" class="box core"/>
  <text x="250" y="436" text-anchor="middle" class="lbl">agent-host(API_SECRET)</text>
  <text x="250" y="454" text-anchor="middle" class="sm">personal-assistant(opus·记忆) · sentinel</text>
  <text x="250" y="470" text-anchor="middle" class="sm">休眠→磁盘唤醒同 id · triggerCount 持久化</text>
  <text x="250" y="486" text-anchor="middle" class="sm">MCP: ask-agent+notify · filesystem · 搜索</text>
  <rect x="460" y="380" width="340" height="130" rx="10" class="zone"/>
  <text x="480" y="402" class="mono">云端 VM(24/7 常驻)</text>
  <rect x="480" y="414" width="300" height="80" rx="5" class="box core"/>
  <text x="630" y="436" text-anchor="middle" class="lbl">agent-host(Bearer)</text>
  <text x="630" y="454" text-anchor="middle" class="sm">remote-helper(sonnet) · 可跑远端 shell</text>
  <text x="630" y="470" text-anchor="middle" class="sm">deploy 脚本一键更新</text>
  <text x="630" y="486" text-anchor="middle" class="sm">与旧架构同机共存互不干扰</text>
  <rect x="280" y="552" width="300" height="50" rx="5" class="box"/>
  <text x="430" y="573" text-anchor="middle" class="lbl">Cursor SDK(可替换后端)</text>
  <text x="430" y="590" text-anchor="middle" class="sm">RuntimeAdapter 5 操作协议边界 · Mock 可测</text>
  <path d="M430 66 L430 150" class="arrow strong" marker-end="url(#afm)"/>
  <path d="M300 190 L330 190" class="arrow strong" marker-end="url(#afm)"/>
  <path d="M580 190 L550 190" class="arrow" marker-end="url(#afm)"/>
  <path d="M245 230 L245 252" class="arrow dash" marker-end="url(#afm)"/>
  <path d="M400 230 L280 414" class="arrow strong" marker-end="url(#afm)"/>
  <path d="M480 230 L600 414" class="arrow strong" marker-end="url(#afm)"/>
  <path d="M250 494 L340 552" class="arrow" marker-end="url(#afm)"/>
  <path d="M630 494 L520 552" class="arrow" marker-end="url(#afm)"/>
  <path d="M140 414 Q110 370 140 318" class="arrow dash" stroke="#7a7dc9" marker-end="url(#afm)"/>
  <text x="96" y="366" class="sm">agent 回调</text>
  <path d="M680 150 Q680 100 540 46" class="arrow dash" stroke="#b07f2e" marker-end="url(#afm)"/>
  <text x="700" y="106" class="sm">主动投递</text>
</svg></div>

## 一条消息的旅程

从在飞书按下发送,到卡片原地长出答案——每一步都可以在 dashboard 的 trace 里回放:

1. **路由与门禁** — owner 锁 → @门 → 白名单 → `/to` 改道;命令走 fast-path 秒回,不进模型
2. **排队合并** — 1.2s 内连发合并成一轮;忙时静默排队;`/stop` 可中断
3. **占位反馈** — 立即回复 ⏳ 卡片,每 30s 刷新耗时
4. **创建或唤醒** — 同 id 从磁盘唤醒并注入持久记忆;busy 重试 / 404 自愈 / 满额轮换
5. **执行** — agent 干活,期间可调 `ask_agent` 委派他人、`notify_user` 主动通知
6. **定稿** — 占位卡原地变成答案 + 署名页脚(谁 · 什么模型 · 哪个实例 · 多久)

## 能力矩阵

**生命力(自愈与延续)**:休眠→唤醒同 id,10 分钟空闲落盘、元数据全量可恢复(零数据库);轮换计数持久化,记忆随 `memory_key` 跨更换延续;404 重建续跑、错误连败自动换 agent、恢复时主动通报;PM2 托管,崩溃自动拉起(`kill -9` 实测)。

**协作(agent → agent)**:`ask_agent` 按 id 同步问答、天然跨机器,已实证**二跳跨双机链**(助理→哨兵→远端 VM 查磁盘);服务端链推导护栏——循环与超 3 跳在花钱之前就 409 拒绝,**不信任 LLM 自报**;每个 agent 一句 Agent Card 能力自述,调用方知道该问谁。

**自主性**:任务板 `.agent-tasks.md`(聊天交代→记入,轮换不忘,每日三次自查);`notify_user` 让 agent 觉得值得说就主动 🔔 你(频控 + 去重);每日 04:00 记忆蒸馏,把流水账重写成「稳定认知 + 近期记录」;一切周期行为默认 `[SILENT]`,有事才响。

**自我修改**:在飞书里让助理**改平台自身的代码**——build + 全套检查门禁 → 延迟分离重启(回复先送达)→ 健康探测失败**自动回滚**。这解决了"重启 dispatch 会杀死自己回复管道"的自杀问题。

**安全与自守**:三道墙(dashboard token / 引擎密钥 / 飞书 owner 锁);注入铁律钉进所有 prompt——工具带回的内容永远是数据不是指令;烧钱哨兵按日汇总 token 超额告警;每日备份链留 14 份。未还的债也记录在案:MCP 沙箱、跨机信任、行为审计。

## 四天时间线

- **07-03 提取与奠基** — 两服务分离、RuntimeAdapter 协议边界、飞书首通道、多引擎静态路由 + 真实第二台机器上线
- **07-04 平台成型** — Dashboard(trace/SSE/热重载)通宵交付;cron + 主动投递、活记忆、第一个真实 MCP 技能;心跳上下文爆炸事故 → 跳变告警 + 连败自愈
- **07-05 能力爆发** — ask_agent v1+v2(链护栏 + Agent Card,二跳跨机实证);飞书体验四件套 + 署名;自改代码 + 安全重启;三道安全墙;部署工具化
- **07-06 自主性上线 + 实战检验** — 任务板 / 主动通知 / 记忆蒸馏三件套零返工交付;清晨哨兵误报风暴被"轮换清除叙事偏见"化解;真实网络故障暴露 WS 掉线盲区 → 记入 agent 自己的任务板

## 对标:站在收敛主线的交点上

| 维度 | 业界参照 | 本平台 |
|---|---|---|
| agent 互问形态 | CrewAI Ask/Delegate · OpenAI `as_tool` | as_tool 语义 × MCP 承载,比 OpenClaw 原生更进一步(其无 blocking ask) |
| 聊天体验 | OpenClaw 飞书插件(卡片流式·命令·合并) | Top 5 模式全部移植(真 token 流式待做) |
| 护栏设计 | CrewAI 委派循环教训 · OpenClaw loop protection | 服务端链推导——不信任 LLM 自报,超前于多数框架 |
| 与旧架构关系 | trigger + api-server(同机单体) | 借其部署形态之壳,装多引擎/记忆/技能/体验之魂 |

## 还差什么(当时的清单)

C4 自我改进闭环、真 token 流式、dispatch 迁常驻机、WS 掉线自愈、MCP 沙箱与跨机信任。其中"dispatch 迁常驻机"和"第二 Adapter 冒烟"在次日就变成了现实——见[续篇](/blog/agent-farm-personal-runtime/)。
