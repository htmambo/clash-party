#!/bin/bash

# ============================================================================
# macOS Intel 应用打包脚本
# 基于 GitHub Actions 工作流的本地版本
# ============================================================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  macOS Intel 应用打包脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查架构
ARCH=$(uname -m)
echo -e "${YELLOW}当前系统架构: ${ARCH}${NC}"

if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "arm64" ]; then
    echo -e "${RED}错误: 不支持的架构 ${ARCH}${NC}"
    exit 1
fi

# 设置目标架构
TARGET_ARCH="x64"
echo -e "${YELLOW}目标打包架构: ${TARGET_ARCH} (Intel x86_64)${NC}"
echo ""

# ============================================================================
# 步骤 1: 清理环境
# ============================================================================
echo -e "${GREEN}[1/5] 清理环境...${NC}"
rm -rf dist out node_modules/.cache
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# ============================================================================
# 步骤 2: 安装依赖
# ============================================================================
echo -e "${GREEN}[2/5] 安装依赖...${NC}"

# 设置架构环境变量
export npm_config_arch=$TARGET_ARCH
export npm_config_target_arch=$TARGET_ARCH

# 安装基础依赖
echo -e "${YELLOW}安装 pnpm 依赖...${NC}"
pnpm install

# 安装 sysproxy 原生模块（Intel 版本）
echo -e "${YELLOW}安装 sysproxy-darwin-x64...${NC}"
pnpm add @mihomo-party/sysproxy-darwin-x64

echo -e "${GREEN}✓ 依赖安装完成${NC}"
echo ""

# ============================================================================
# 步骤 3: 准备构建
# ============================================================================
echo -e "${GREEN}[3/5] 准备构建...${NC}"
pnpm prepare --${TARGET_ARCH}
echo -e "${GREEN}✓ 准备完成${NC}"
echo ""

# ============================================================================
# 步骤 4: 构建
# ============================================================================
echo -e "${GREEN}[4/5] 构建 macOS Intel 应用...${NC}"
chmod +x build/pkg-scripts/postinstall
chmod +x build/pkg-scripts/preinstall

# 构建应用
pnpm build:mac

echo -e "${GREEN}✓ 构建完成${NC}"
echo ""

# ============================================================================
# 步骤 5: 显示结果
# ============================================================================
echo -e "${GREEN}[5/5] 构建结果...${NC}"
echo ""
echo -e "${YELLOW}生成的文件:${NC}"
ls -lh dist/*.pkg 2>/dev/null || echo -e "${RED}未找到 .pkg 文件${NC}"
echo ""
echo -e "${YELLOW}生成的校验和:${NC}"
cat dist/*.sha256 2>/dev/null || echo -e "${RED}未找到 .sha256 文件${NC}"
echo ""

# ============================================================================
# 完成
# ============================================================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  打包完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}应用位置: dist/${NC}"
echo -e "${YELLOW}安装包: $(ls dist/*.pkg 2>/dev/null | head -1)${NC}"
echo ""
echo -e "${GREEN}你可以双击 .pkg 文件进行安装${NC}"
echo ""
