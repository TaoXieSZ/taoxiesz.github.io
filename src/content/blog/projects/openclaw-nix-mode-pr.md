---
title: OpenClaw PR #40: Nix Mode Support 实现文档
description: 详细解析 OpenClaw/Clawdis 项目 Nix 模式支持的实现，包括声明式配置管理、macOS 可重现构建、Telegram 密钥管理改进等功能。
pubDate: 2026-03-27
project: openclaw
tags:
  - openclaw
  - clawdis
  - nix
  - macos
  - devops
  - configuration
---

# OpenClaw PR #40: Nix Mode Support 实现文档

## 概述

PR #40 "Nix mode support + macOS Info.plist template" 为 OpenClaw/Clawdis 项目引入了声明式配置管理能力，通过 Nix 模式支持，实现了不可变配置和可重现构建，同时保持了对传统用户的完全向后兼容性。

**状态**: ✅ 已合并 (2026-01-01)
**作者**: Josh Palmer (@joshp123)
**审核者**: Peter Steinberger (@steipete)

---

## 核心功能

### 1. Nix 模式支持

通过环境变量 `CLAWDIS_NIX_MODE=1` 启用的声明式配置模式：

```bash
# 启用 Nix 模式
export CLAWDIS_NIX_MODE=1
export CLAWDIS_CONFIG_PATH=/etc/clawdis/config.json
export CLAWDIS_STATE_DIR=/var/lib/clawdis
```

**核心特性**：
- **只读配置**：所有设置页面变为不可编辑状态
- **声明式管理**：配置文件完全由 Nix ���理，应用内修改被禁用
- **跳过引导**：自动隐藏引导流程，避免用户困惑
- **路径覆盖**：支持自定义配置和状态目录

### 2. 配置路径环境变量

新增环境变量支持灵活的路径配置：

```bash
# 配置文件路径覆盖
CLAWDIS_CONFIG_PATH=/path/to/custom/config.json

# 状态目录覆盖（用于数据库、缓存等）
CLAWDIS_STATE_DIR=/path/to/state/dir

# Nix 模式开关
CLAWDIS_NIX_MODE=1
```

**优先级**：
1. `CLAWDIS_CONFIG_PATH` 指定的路径
2. `CLAWDIS_STATE_DIR/clawdis.json`
3. 默认 `~/.clawdis/clawdis.json`

### 3. Telegram Token File 支持

改进的密钥管理方式，支持从文件读取 Telegram bot token：

```json
{
  "telegram": {
    "tokenFile": "/run/secrets/telegram-bot-token",
    "botToken": "fallback_inline_token"
  }
}
```

**Token 解析顺序**：
1. `TELEGRAM_BOT_TOKEN` 环境变量
2. `telegram.tokenFile` 指定的文件内容
3. `telegram.botToken` 配置字段（向后兼容）

**优势**：
- 与密钥管理系统集成（如 NixOps、Kubernetes Secrets）
- 支持密钥轮换而无需修改配置文件
- 提高安全性，避免 token 在进程列表中暴露

### 4. macOS 应用可重现构建

#### Info.plist 模板化

将 `Info.plist` 从构建脚本中提取为模板文件：

```xml
<!-- apps/macos/Sources/Clawdis/Resources/Info.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- 静态配置 -->
    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <!-- ATS 异常（为 Tailscale） -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
        <key>NSExceptionDomains</key>
        <dict>
            <key>100.100.100.100</key>
            <dict>
                <key>NSExceptionAllowsInsecureHTTPLoads</key>
                <true/>
            </dict>
        </dict>
    </dict>
</dict>
</plist>
```

#### 构建脚本改进

```bash
# scripts/package-mac-app.sh
# 复制模板并打补丁
cp "$APP_RESOURCES/Info.plist" "$APP_TEMP_DIR/Info.plist"

# 使用 PlistBuddy 更新动态字段
/usr/libexec/PlistBuddy "$APP_TEMP_DIR/Info.plist" \
  -c "Set :CFBundleShortVersionString $VERSION" \
  -c "Set :CFBundleVersion $BUILD_NUMBER"
```

**优势**：
- 构建过程确定性，相同输入产生相同输出
- 支持 Nix 和 CI 环境中的本地签名
- 保持所有必要的 ATS 异常配置

### 5. Peekaboo 桥接动态 TeamID

为本地签名的构建添加自动化桥接支持：

```swift
// PeekabooBridgeHostCoordinator.swift
let currentTeamID = getCurrentAppTeamID()
allowlist.insert(currentTeamID)
```

**安全特性**：
- 仅添加当前应用的 TeamID
- 不使用通配符，保持安全边界
- 支持本地开发和 CI/CD 流程

---

## 技术实现细节

### Nix 模式检测

**TypeScript 后端**：
```typescript
// src/config/config.ts
export function isNixMode(): boolean {
  return process.env.CLAWDIS_NIX_MODE === '1' ||
         process.env.CLAWDIS_CONFIG_PATH !== undefined;
}

export function getConfigPath(): string {
  if (process.env.CLAWDIS_CONFIG_PATH) {
    return process.env.CLAWDIS_CONFIG_PATH;
  }
  if (process.env.CLAWDIS_STATE_DIR) {
    return path.join(process.env.CLAWDIS_STATE_DIR, 'clawdis.json');
  }
  return path.join(os.homedir(), '.clawdis', 'clawdis.json');
}
```

**Swift macOS 前端**：
```swift
// ProcessInfo+Clawdis.swift
extension ProcessInfo {
  var isNixMode: Bool {
    return environment["CLAWDIS_NIX_MODE"] == "1" ||
           environment["CLAWDIS_CONFIG_PATH"] != nil
  }
}

// ConfigSettings.swift
@Observable
final class ConfigSettings {
  private var isNixMode: Bool {
    ProcessInfo.processInfo.isNixMode
  }

  var isConfigEditable: Bool {
    !isNixMode
  }

  func saveConfig() {
    guard !isNixMode else { return } // Nix 模式下阻止保存
    // 正常保存逻辑
  }
}
```

### UI 适配

**设置界面**：
- Nix 模式下显示"配置由 Nix 管理"横幅
- 禁用所有配置编辑控件
- 显示当前配置路径供参考

**引导流程**：
```swift
// Onboarding.swift
func shouldShowOnboarding() -> Bool {
  if ProcessInfo.processInfo.isNixMode {
    markOnboardingSeen()
    return false
  }
  return !hasSeenOnboarding()
}
```

### Telegram Token 加载

```typescript
// src/gateway/server.ts
async function loadTelegramToken(config: Config): Promise<string> {
  // 1. 环境变量优先
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  // 2. Token 文件
  if (config.telegram.tokenFile) {
    try {
      const token = await fs.readFile(config.telegram.tokenFile, 'utf-8');
      return token.trim();
    } catch (error) {
      logger.warn(`Failed to read token file: ${error.message}`);
      // 继续到下一步
    }
  }

  // 3. 内联 token（向后兼容）
  return config.telegram.botToken || '';
}
```

### 健康检查改进

```typescript
// src/commands/health.ts
async function getTelegramHealth(config: Config) {
  const token = await loadTelegramToken(config);
  const hasToken = !!token || !!config.telegram.tokenFile;

  if (!hasToken) {
    return { status: 'missing' };
  }

  try {
    const bot = await telegramBot.getMe();
    return { status: 'ok', bot };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

---

## 安全考量

### 1. 特性门控
所有 Nix 相关功能都通过环境变量控制，默认行为完全不变：
- 不设置环境变量 = 传统可写配置
- 设置 `CLAWDIS_NIX_MODE=1` = 只读声明式配置

### 2. 配置写保护
```typescript
function saveConfig(newConfig: Config) {
  if (isNixMode()) {
    throw new Error('Cannot modify config in Nix mode');
  }
  // 正常保存逻辑
}
```

### 3. TeamID 安全
```swift
// 不使用通配符，仅添加当前应用
let currentTeamID = getCurrentAppTeamID()
if !allowlist.contains(currentTeamID) {
  allowlist.insert(currentTeamID)
}
```

### 4. 密钥管理
- Token 文件权限检查
- 不在日志中暴露敏感信息
- 支持密钥轮换机制

---

## 测试覆盖

### 单元测试

```typescript
// src/config/config.test.ts
describe('Nix mode', () => {
  it('should detect Nix mode from env', () => {
    process.env.CLAWDIS_NIX_MODE = '1';
    expect(isNixMode()).toBe(true);
  });

  it('should resolve custom config path', () => {
    process.env.CLAWDIS_CONFIG_PATH = '/custom/path.json';
    expect(getConfigPath()).toBe('/custom/path.json');
  });

  it('should use state dir when set', () => {
    process.env.CLAWDIS_STATE_DIR = '/var/lib/clawdis';
    expect(getConfigPath()).toBe('/var/lib/clawdis/clawdis.json');
  });
});
```

### 集成测试

```typescript
// src/commands/health.snapshot.test.ts
describe('Telegram tokenFile support', () => {
  it('should load token from file', async () => {
    const tokenPath = '/tmp/test-token';
    await fs.writeFile(tokenPath, 'test-token-123');

    const config = {
      telegram: { tokenFile: tokenPath }
    };

    const token = await loadTelegramToken(config);
    expect(token).toBe('test-token-123');
  });

  it('should fallback to botToken', async () => {
    const config = {
      telegram: {
        tokenFile: '/non/existent/file',
        botToken: 'fallback-token'
      }
    };

    const token = await loadTelegramToken(config);
    expect(token).toBe('fallback-token');
  });
});
```

---

## 部署和使用

### Nix 配置示例

```nix
# configuration.nix
{ config, pkgs, ... }:

{
  services.clawdis = {
    enable = true;
    settings = {
      telegram = {
        tokenFile = "/run/secrets/telegram-token";
      };
      nixMode = true;
    };
  };

  # 密钥管理
  systemd.services.clawdis.serviceConfig.SupplementaryGroups = [ "keys" ];
}
```

### 系统服务配置

```ini
# /etc/systemd/system/clawdis.service
[Unit]
Description=Clawdis AI Assistant
After=network.target

[Service]
Type=simple
User=clawdis
Environment=CLAWDIS_NIX_MODE=1
Environment=CLAWDIS_CONFIG_PATH=/etc/clawdis/config.json
Environment=CLAWDIS_STATE_DIR=/var/lib/clawdis
ExecStart=/usr/bin/clawdis
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## 问题解决

### Issue #40 背景与解决

**问题描述**：
- 需要在 NixOS 环境中声明式管理 Clawdis 配置
- macOS 应用构建需要可重现性
- Telegram token 管理需要更好的安全性

**解决方案**：
1. 引入 Nix 模式特性标志
2. 重构 macOS 打包流程
3. 增强密钥管理选项
4. 改进健康检查逻辑

**讨论亮点**：
- 作者分享了使用 AI agent 开发此功能的经验（消耗 33.33 亿 tokens）
- 体现了 Swift/Nix 跨领域开发的挑战
- 维护者对代码质量和安全性的关注
- 最终作者被接纳为项目贡献者

---

## 影响和收益

### 对用户

**Nix 用户**：
- ✅ 完整的声明式配置支持
- ✅ 与 NixOS 生态系统集成
- ✅ 可重现的部署流程

**传统用户**：
- ✅ 零影响，完全向后兼容
- ✅ 可选使用新的环境变量功能
- ✅ 改进的密钥管理选项

### 对项目

- ✅ 拓展了技术栈适用范围
- ✅ 提高了企业级部署可行性
- ✅ 建立了可扩展的架构模式
- ✅ 增强了 macOS 应用构建稳定性

---

## 相关文件

### 核心代码文件
- `src/config/config.ts` - 配置管理和 Nix 模式检测
- `src/gateway/server.ts` - Token 加载逻辑
- `src/commands/health.ts` - 健康检查改进
- `apps/macos/Sources/Clawdis/ConfigSettings.swift` - UI 适配
- `scripts/package-mac-app.sh` - 构建脚本重构

### 文档
- `docs/nix.md` - Nix 模式用户指南
- `docs/index.md` - 更新主文档索引

### 测试文件
- `src/config/config.test.ts` - 配置模块测试
- `src/commands/health.snapshot.test.ts` - 健康检查测试

---

## 未来方向

### 已知限制
1. Nix 包定义需要在上游 Nixpkgs 中单独提交
2. macOS UI 仍需手动检查 Nix 模式状态
3. 配置变更需要重启服务才能生效

### 后续计划
1. 在 nixpkgs 提交 Clawdis 包定义
2. 考虑插件化架构，支持更多扩展方式
3. 改进配置热重载机制
4. 扩展到其他 Linux 发行包管理器

---

## 参考资料

- **PR**: https://github.com/openclaw/openclaw/pull/40
- **Issue**: https://github.com/openclaw/openclaw/issues/40
- **Nix 语言**: https://nixos.org/manual/nix/stable/language/
- **macOS 代码签名**: https://developer.apple.com/support/code-signing/
- **GitHub Actions**: https://github.com/openclaw/openclaw/actions

---

**文档版本**: 1.0
**最后更新**: 2026-03-27
**维护者**: OpenClaw 社区
