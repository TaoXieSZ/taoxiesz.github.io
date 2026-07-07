---
title: OpenClaw Web-Search 配置避坑笔记
description: 配置了正确的 API Key，但 web-search 始终报认证错误——根因是漏了 baseUrl 参数。
pubDate: 2026-04-02
author: 谢韬
project: openclaw
tags:
  - openclaw
  - web-search
  - troubleshooting
  - configuration
---

## 概要

排查了一个诡异的问题：配置了正确的 API Key，但 OpenClaw 的 web-search 始终报认证错误。

最后发现根因是：**配置文件里漏了 `baseUrl` 参数**。

---

## 一、问题现象

配置完成后，web-search 工具始终报错：

```
API key or authentication error
```

检查了：
- API Key 来源：platform 生成的，有效期内 ✓
- 配置路径：`plugins.entries` ✓
- Provider 设置：`tools.web.search.provider` ✓

三样都对，但就是认证失败。

---

## 二、排查过程

### 1. 检查配置文件

```json
"tools": {
  "web": {
    "search": {
      "enabled": true,
      "provider": ""
    }
  }
},
"plugins": {
  "entries": {
    "": {
      "enabled": true,
      "config": {
        "webSearch": {
          "apiKey": "sk-xxxxx"
        }
      }
    }
  }
}
```

看起来没问题。

### 2. 查看插件源码

找到 OpenClaw 源码中的 plugin 定义：

```json
{
  "id": "",
  "contracts": {
    "webSearchProviders": [""]
  },
  "uiHints": {
    "webSearch.apiKey": {
      "label": "",
      "help": "fallback"
    },
    "webSearch.baseUrl": {
      "label": "",
      "help": ""
    }
  }
}
```

注意到了！`webSearch.baseUrl` 是个独立字段，且 `help` 明确写了 "override"——说明 baseUrl 不是自动推断的。

### 3. 对比正确配置

翻看 OpenClaw 官方文档后确认：

对于中国大陆用户，**必须显式配置 baseUrl**。

---

## 三、根本原因

Moonshot 有两个不同的 API 端点：

| 端点 | 用途 | 适用地区 |
|------|------|---------|
| `https://api.` | 中国区 | 中国大陆用户 |
| `https://api.` | 全球版 | 其他地区 |

如果在中国大陆使用中国区 Key 调用了全球版的端点（默认行为或未配置 baseUrl），会直接返回认证失败——因为这两个是独立的账号体系。

---

## 四、解决方案

在 `openclaw.json` 的 `plugins.entries` 中添加 `baseUrl`：

```json
"plugins": {
  "entries": {
    "": {
      "enabled": true,
      "config": {
        "webSearch": {
          "apiKey": "sk-xxxxx",
          "baseUrl": "https://api."
        }
      }
    }
  }
}
```

或者通过 CLI：

```bash
openclaw config set plugins.entries.baseUrl "https://api."
```

修改后需要重启 OpenClaw：

```bash
openclaw daemon restart
```

---

## 五、验证方法

重启后测试搜索功能：

```bash
openclaw doctor
```

或者直接在 Agent 对话中使用 web-search 工具，应该能正常返回搜索结果了。

---

## 六、排查速查表

| 要查什么 | 怎么查 |
|---------|--------|
| 当前 web search 配置 | `openclaw config get tools.web` |
| 插件配置 | `openclaw config get plugins.entries` |
| 插件加载状态 | `openclaw plugins doctor` |
| 日志 | `openclaw logs --follow` |

---

## 七、经验总结

1. **文档要看全**：OpenClaw 的 plugin.json 里每个字段都有 `help` 说明，配置前先扫一遍
2. **区分 Key 类型**：同一个平台的 Key，不同域名是独立体系
3. **配置 override 字段**：遇到 "override" / "fallback" 关键字的字段，通常不是可选的，而是必需的
