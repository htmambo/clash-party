# macOS Intel 应用打包指南

## 📦 已生成的应用

**文件**: `dist/clash-party-macos-1.9.0-x64.pkg`
**大小**: 117 MB
**架构**: Intel x86_64
**版本**: 1.9.0

## 🚀 安装方法

1. 双击 `clash-party-macos-1.9.0-x64.pkg` 文件
2. 按照安装向导完成安装
3. 在应用程序文件夹中找到 "Clash Party"

## 🔧 打包脚本

### 方法 1: 使用标准构建命令（推荐）

```bash
pnpm build:mac
```

这将自动：
- 构建前端代码
- 打包 Electron 应用
- 生成 `.pkg` 安装包

### 方法 2: 使用自定义脚本

```bash
./build-macos-intel.sh
```

这个脚本会：
1. 清理旧的构建文件
2. 安装依赖（包括 sysproxy-darwin-x64）
3. 准备构建资源
4. 执行打包
5. 显示结果

### 方法 3: 使用简化脚本（跳过网络下载）

```bash
./build-macos-intel-simple.sh
```

如果网络有问题，使用这个脚本可以跳过部分网络请求。

## 📋 系统要求

- **操作系统**: macOS 10.15+ (Catalina 或更高版本)
- **架构**: Intel x86_64
- **Node.js**: 22.x
- **包管理器**: pnpm

## 🔍 构建产物

打包完成后，`dist/` 目录包含：

- `clash-party-macos-1.9.0-x64.pkg` - 安装包（117 MB）
- `mac/` - 未打包的应用目录
- `builder-debug.yml` - 构建调试信息
- `party.mihomo.app.plist` - 应用配置文件

## ⚠️ 注意事项

### 代码签名

当前构建**未签名**，安装时可能需要：
1. 在"系统偏好设置" → "安全性与隐私"中允许运行
2. 或右键点击应用，选择"打开"

### 代码签名方法

如果需要签名，请设置以下环境变量：

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx"
export APPLE_TEAM_ID="xxxx"
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="xxxx"
```

## 🐛 常见问题

### 1. 构建失败: "Cannot download Electron"

**解决方案**: 检查网络连接，或使用国内镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm build:mac
```

### 2. 权限错误: "Permission denied"

**解决方案**: 确保脚本有执行权限：

```bash
chmod +x build-macos-intel.sh
./build-macos-intel.sh
```

### 3. 依赖安装失败

**解决方案**: 清理缓存并重新安装：

```bash
rm -rf node_modules
pnpm install
```

## 📚 相关资源

- **GitHub Actions**: `.github/workflows/build.yml`
- **Electron Builder**: `electron-builder.yml`
- **项目文档**: README.md

## 🎯 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 构建 macOS Intel 应用
pnpm build:mac

# 3. 安装测试
open dist/clash-party-macos-1.9.0-x64.pkg
```

---

**打包完成时间**: 2026-01-12
**Node 版本**: v22
**Electron 版本**: v37.10.0
