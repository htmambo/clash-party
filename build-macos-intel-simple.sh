#!/bin/bash

# ============================================================================
# macOS Intel 应用打包脚本（简化版）
# 跳过网络下载，使用已有资源
# ============================================================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  macOS Intel 应用打包脚本（简化版）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查架构
ARCH=$(uname -m)
echo -e "${YELLOW}当前系统架构: ${ARCH}${NC}"

# 设置目标架构
TARGET_ARCH="x64"
echo -e "${YELLOW}目标打包架构: ${TARGET_ARCH} (Intel x86_64)${NC}"
echo ""

# ============================================================================
# 步骤 1: 检查环境
# ============================================================================
echo -e "${GREEN}[1/6] 检查环境...${NC}"

# 检查是否已有 extra 资源
if [ ! -d "extra/sidecar" ] || [ -z "$(ls -A extra/sidecar 2>/dev/null)" ]; then
    echo -e "${YELLOW}警告: extra/sidecar 目录为空或不存在${NC}"
    echo -e "${YELLOW}打包可能会失败，或者生成的应用不完整${NC}"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}取消打包${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ 环境检查完成${NC}"
echo ""

# ============================================================================
# 步骤 2: 安装依赖
# ============================================================================
echo -e "${GREEN}[2/6] 安装依赖...${NC}"

# 设置架构环境变量
export npm_config_arch=$TARGET_ARCH
export npm_config_target_arch=$TARGET_ARCH

# 安装基础依赖
echo -e "${YELLOW}安装 pnpm 依赖...${NC}"
pnpm install 2>&1 | tail -20

# 尝试安装 sysproxy（如果失败则跳过）
echo -e "${YELLOW}安装 sysproxy-darwin-x64（可能跳过）...${NC}"
pnpm add @mihomo-party/sysproxy-darwin-x64 2>/dev/null || echo -e "${YELLOW}sysproxy 安装失败，将使用本地版本${NC}"

echo -e "${GREEN}✓ 依赖安装完成${NC}"
echo ""

# ============================================================================
# 步骤 3: 构建前端
# ============================================================================
echo -e "${GREEN}[3/6] 构建前端代码...${NC}"
pnpm electron-vite build
echo -e "${GREEN}✓ 前端构建完成${NC}"
echo ""

# ============================================================================
# 步骤 4: 准备资源
# ============================================================================
echo -e "${GREEN}[4/6] 准备打包资源...${NC}"

# 设置脚本执行权限
chmod +x build/pkg-scripts/postinstall 2>/dev/null || true
chmod +x build/pkg-scripts/preinstall 2>/dev/null || true

# 设置 sidecar 二进制文件执行权限
find extra/sidecar -type f -exec chmod +x {} \; 2>/dev/null || true

echo -e "${GREEN}✓ 资源准备完成${NC}"
echo ""

# ============================================================================
# 步骤 5: 执行打包
# ============================================================================
echo -e "${GREEN}[5/6] 打包 macOS Intel 应用...${NC}"

# 使用 electron-builder 打包
npx electron-builder --mac --x64 --publish never

echo -e "${GREEN}✓ 打包完成${NC}"
echo ""

# ============================================================================
# 步骤 6: 显示结果
# ============================================================================
echo -e "${GREEN}[6/6] 构建结果...${NC}"
echo ""

# 查找生成的文件
if [ -d "dist" ]; then
    echo -e "${YELLOW}生成的文件:${NC}"
    echo ""

    # 显示 .pkg 文件
    if ls dist/*.pkg 1> /dev/null 2>&1; then
        echo -e "${GREEN}安装包 (.pkg):${NC}"
        ls -lh dist/*.pkg
        echo ""
    fi

    # 显示 .dmg 文件
    if ls dist/*.dmg 1> /dev/null 2>&1; then
        echo -e "${GREEN}磁盘映像 (.dmg):${NC}"
        ls -lh dist/*.dmg
        echo ""
    fi

    # 显示其他文件
    echo -e "${YELLOW}所有文件:${NC}"
    ls -lh dist/ | tail -10
else
    echo -e "${RED}未找到 dist 目录${NC}"
fi

echo ""

# ============================================================================
# 完成
# ============================================================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  打包完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}应用位置: dist/${NC}"
echo ""
echo -e "${GREEN}提示:${NC}"
echo -e "  - 双击 .pkg 文件进行安装"
echo -e "  - 或双击 .dmg 文件打开磁盘映像"
echo ""
