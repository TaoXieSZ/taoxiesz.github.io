---
title: context-os:给自己造一个 Context Window
description: 点子太多、什么都想做、打游戏还有罪恶感——我把自己当成一个 LLM 来管理:idea inbox、active slots、swap/handoff 协议、agent 主持的每周 review。记录这个工具从头脑风暴、三模型独立冷读到设计定稿的全过程。
pubDate: 2026-07-07
author: 谢韬
project: context-os
tags:
  - agent
  - productivity
  - claude
  - tooling
  - design
---

## 起因:63 个项目和一份罪恶感

我让 Claude 数了一下,`~/OpenSourceProjects` 下面有 63 个项目。待办板上同时挂着 Agent Farm、工作、Jira、生活四条线。点子太多,什么都想做;同时我又要打游戏、要健身,而且玩的时候心里总惦记着那堆项目。

于是我提了个很模糊的需求:"能不能做个工具,帮我管理我自己的上下文?"

接下来发生的事比工具本身更有意思——这是一次完整的"AI 当产品顾问"流程:结构化访谈 → 三个模型独立冷读 → 对抗性评审 → 设计定稿。

## 访谈:我不是"手太快",我是"放不下"

Claude 没有直接开写代码,而是先做了几轮选择题式访谈。第一个问题就把方向拧过来了。

我以为我的问题是"点子一来就动手,WIP 越堆越多"。自诊之后发现不是——我是:

- **不敢放下型**:怕关掉一个项目就丢失状态,恢复成本太高,所以宁可全部挂着;
- **脑内常驻型**:点子不一定马上做,但一直在脑子里转,打游戏、健身时都惦记着。

对应的解法也就清楚了:我不需要更强的自控力,我需要**更低的卸载成本**。第二轮访谈确认了两个信任前提:

1. **恢复成本证明**——关项目时自动生成 handoff(做到哪/下一步/为什么停),重启时一条命令满血复活。亲眼验证一次,我就信了。
2. **点子有去处有回访**——丢进 inbox 的点子保证每周被重新过一遍。大脑只有相信"它会回来找我",才肯松手(Zeigarnik 效应)。

## 把人当 LLM 管理

核心隐喻:**注意力就是 context window,项目就是可加载/卸载的 context bundle**。

- **Idea Inbox**:一句话卸载点子。记录 ≠ 承诺。
- **Active Slots**:同时最多加载 3 个。**打游戏、健身是一等公民 slot**——占预算,但不产生罪恶感,因为它是被系统正式授权的。
- **Swap 协议**:换入新项目必须先换出一个旧的,换出时自动写 handoff——就像 LLM 的 compaction。
- **每周 Review**:agent 主持,过 inbox:冷冻、合并、毙掉、换入。

这里有个我很喜欢的洞察:所有个人管理系统(GTD、PARA、Second Brain)都是**存储中心**的,它们假设瓶颈在"组织"。但我根本不缺存储——我缺的是**操作员**:写 handoff 的人、保证每周回访的人。GTD 类系统几乎都死在每周 review,因为 review 是人最讨厌的人肉劳动——**而这恰好是 agent 不会腻的活**。这个工具在两年前不成立,现在成立。

## 三模型评审团

方案成形后,我说:"把 codex、Cursor 和 opencode 一起叫来。"三个模型拿到同一份结构化摘要,互相看不见,独立冷读。

结果三家**零沟通收敛在同一个结论**上:

> MVP 不是 inbox,是"复活魔术"。周末唯一目标是亲眼看到一次 swap-out → swap-in 满血复活。没有那次验证,一个项目都不会真正放下,后面全是空中楼阁。(cursor 的原话更狠:"周末不是做工具,是做一次复活魔术给他看。")

三家还都引用了我说的同一句话——"亲眼验证一次就信"——并给出同一个诊断:我要的不是效率,是**赦免**。"被允许放下"才是真正的 job to be done。

各家也有独门贡献:

- **opencode**:revive 不能只读文档,换入时要跑 git status/build 探针,把"我能复活"变成可验证信号;"本周未回访"应该算系统级故障。
- **codex**:动词体系 `ctx load / unload / swap / revive / play`,以及产品名——**Context Window for Humans**。金句:"它不是帮你更勤奋,而是帮你安全遗忘。"
- **cursor**:最大胆的愿景——handoff 是通用的"可恢复工作单元"序列化格式,恢复方既可以是人,**也可以是 agent**。换出 ≠ 暂停,而是转成异步 worker 继续推进。我的人生变成 agent farm 的 head node,我自己是唯一有特权打游戏的 worker。

(这个愿景被 Claude 泼了盆冷水:后台 agent 产出会堆积成"审查债",罪恶感换个马甲回来。所以它是 v3,且必须限量派发。)

## 设计定稿

设计文档过了一轮对抗性评审(独立 agent,只看文档不看对话),8/10,抓出 10 个"动手就会撞墙"的含糊点,全部修复。最终的 Phase 1 长这样:

```
~/context-os/
  slots.md              # 活跃 slot,含 GAMING/FITNESS,WIP ≤ 3
  inbox.md              # 只做"能追加",不做路由
  projects/<name>/
    handoff.md          # 做到哪 / 下一步 / 为什么停 / 重启命令
    state.json          # 项目目录、tmux session、相关文件、branch、commit
  bin/ctx               # zsh 薄壳 CLI
  agent/operator.md     # Claude 操作员协议
  prompts/              # unload / revive / weekly-review 模板
```

```bash
ctx swap-out <project>   # claude -p 读 git 状态 → 写 handoff + state.json
ctx swap-in  <project>   # 检查 WIP 上限 → 恢复 tmux/编辑器 → 给新 Claude 会话灌 handoff
ctx status               # 当前 slots
ctx capture "一句话"     # 追加 inbox
ctx play <活动> --for 90m # 娱乐授权:launchd 倒计时,到点通知"你已被正式授权休息"
```

评审后锁定的四个拍板,都是五分钟决策但不定就返工的坑:

1. 授权倒计时用 launchd/at 一次性任务,脱离终端生命周期(前台 sleep 关终端就没了);
2. 目录语义零侵入——只记录现有项目路径,不动真 git worktree;
3. WIP ≤ 3 由 `ctx swap-in` 强制,满了就拒绝换入;
4. 不做精确"打开标签页"恢复(Cursor 没有稳定接口),改由 claude -p 从 git diff 推断相关文件。

**验收标准只有一条**:周日晚 `ctx swap-out` 一个真实项目,周一 `ctx swap-in`,60 秒内回到"我知道下一步做什么、并且相信不会丢"的状态。

Phase 2 加飞书 bot(离机捕捉 + 授权推送,一个渠道干两件事)和 agent 主持的每周 review。Phase 3 是 head node 愿景。

## 后记

整个过程里最值钱的不是设计本身,而是访谈逼出来的那句自我诊断:**我的问题是卸载成本,不是自控力**。工具还没写一行代码,但光是把"打游戏需要被正式授权"这件事说出来,罪恶感就已经轻了一半。

repo 已经在本地开工,这个周末做复活魔术。跑通"复活闭环"后会开源出来,到时候补上链接。
