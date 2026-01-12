#!/bin/bash

# ============================================================================
# 修复缺失的二进制文件
# ============================================================================

set -e

echo "=== 修复 macOS 应用缺失的二进制文件 ==="
echo ""

# 检查是否需要下载 helper
if [ ! -f "extra/sidecar/party.mihomo.helper" ]; then
    echo "下载 party.mihomo.helper..."
    curl -L -o extra/sidecar/party.mihomo.helper \
        "https://github.com/mihomo-party-org/mihomo-party-helper/releases/download/x64/party.mihomo.helper"
    chmod +x extra/sidecar/party.mihomo.helper
    echo "✓ party.mihomo.helper 下载完成"
fi

# 下载 mihomo 内核（如果需要）
# 注意：这些文件很大，可能需要较长时间
MIHOMO_VERSION="1.18.10"  # 使用稳定版本

if [ ! -f "extra/sidecar/mihomo-alpha" ]; then
    echo ""
    echo "下载 mihomo-alpha..."
    curl -L -o /tmp/mihomo-alpha.gz \
        "https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-darwin-amd64-compatible-${MIHOMO_VERSION}.gz"
    gunzip -c /tmp/mihomo-alpha.gz > extra/sidecar/mihomo-alpha
    chmod +x extra/sidecar/mihomo-alpha
    rm /tmp/mihomo-alpha.gz
    echo "✓ mihomo-alpha 下载完成"
fi

if [ ! -f "extra/sidecar/mihomo" ]; then
    echo ""
    echo "下载 mihomo..."
    curl -L -o /tmp/mihomo.gz \
        "https://github.com/MetaCubeX/mihomo/releases/download/v${MIHOMO_VERSION}/mihomo-darwin-amd64-compatible-${MIHOMO_VERSION}.gz"
    gunzip -c /tmp/mihomo.gz > extra/sidecar/mihomo
    chmod +x extra/sidecar/mihomo
    rm /tmp/mihomo.gz
    echo "✓ mihomo 下载完成"
fi

if [ ! -f "extra/sidecar/mihomo-smart" ]; then
    echo ""
    echo "下载 mihomo-smart..."
    curl -L -o /tmp/mihomo-smart.gz \
        "https://github.com/vernesong/mihomo/releases/download/Prerelease-Alpha/mihomo-darwin-amd64-v2-go120.gz"
    # 注意：smart 版本的文件名可能不同
    gunzip -c /tmp/mihomo-smart.gz > extra/sidecar/mihomo-smart 2>/dev/null || \
        mv /tmp/mihomo-smart extra/sidecar/mihomo-smart
    chmod +x extra/sidecar/mihomo-smart
    rm /tmp/mihomo-smart.gz 2>/dev/null || true
    echo "✓ mihomo-smart 下载完成"
fi

echo ""
echo "=== 验证文件 ==="
ls -lh extra/sidecar/
echo ""

echo "=== 完成！现在可以重新打包 ==="
echo "运行: pnpm build:mac"
