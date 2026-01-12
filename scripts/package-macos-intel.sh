#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-x64}"

if [[ "${ARCH}" != "x64" ]]; then
  echo "仅支持 Intel(x64) 打包：用法：$0 [x64]" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "此脚本仅支持在 macOS 上运行" >&2
  exit 2
fi

HOST_ARCH="$(uname -m)"
if [[ "${HOST_ARCH}" == "arm64" ]]; then
  cat >&2 <<'EOF'
检测到当前是 Apple Silicon(arm64)。
构建 x64 目标通常需要 Rosetta，并建议在 x86_64 shell 下执行，例如：
  arch -x86_64 /bin/zsh
然后再运行本脚本。
EOF
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "未找到 pnpm，请先安装 pnpm" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "==> 打包目标：macOS Intel (x64)"
echo "==> 输出目录：${REPO_ROOT}/dist"

export npm_config_arch="x64"
export npm_config_target_arch="x64"
# electron-builder 的下载缓存目录（仓库内，已在 .gitignore 忽略）
export ELECTRON_CACHE="${ELECTRON_CACHE:-${REPO_ROOT}/.cache/electron}"
export ELECTRON_BUILDER_CACHE="${ELECTRON_BUILDER_CACHE:-${REPO_ROOT}/.cache/electron-builder}"

mkdir -p "${ELECTRON_CACHE}" "${ELECTRON_BUILDER_CACHE}"

# 如果系统缓存里已有 Electron zip，则拷贝到 ELECTRON_CACHE，避免下载失败
ELECTRON_VERSION="$(node -p "require('./package.json').devDependencies.electron")"
ELECTRON_ZIP="electron-v${ELECTRON_VERSION}-darwin-x64.zip"
if [[ ! -f "${ELECTRON_CACHE}/${ELECTRON_ZIP}" ]]; then
  SYSTEM_ELECTRON_ZIP="$(find "${HOME}/Library/Caches/electron" -maxdepth 3 -name "${ELECTRON_ZIP}" -print -quit 2>/dev/null || true)"
  if [[ -n "${SYSTEM_ELECTRON_ZIP}" && -f "${SYSTEM_ELECTRON_ZIP}" ]]; then
    echo "==> 复用系统 Electron 缓存：${SYSTEM_ELECTRON_ZIP}"
    cp -f "${SYSTEM_ELECTRON_ZIP}" "${ELECTRON_CACHE}/${ELECTRON_ZIP}"
  fi
fi

retry() {
  local -r max_attempts="$1"
  shift
  local attempt=1
  local delay=3
  until "$@"; do
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      return 1
    fi
    echo "重试 (${attempt}/${max_attempts}) 失败，${delay}s 后重试：$*" >&2
    sleep "${delay}"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

echo "==> 安装依赖"
SKIP_PREPARE=1 retry 3 pnpm install

if [[ "${FORCE_PREPARE:-0}" == "1" ]] || [[ ! -x "extra/sidecar/mihomo" ]]; then
  echo "==> 准备资源（下载内核/规则等）"
  retry 3 pnpm prepare --x64
else
  echo "==> 检测到已有资源，跳过 prepare（如需强制更新：FORCE_PREPARE=1）"
fi

if [[ -f "build/pkg-scripts/postinstall" ]]; then
  chmod +x build/pkg-scripts/postinstall || true
fi
if [[ -f "build/pkg-scripts/preinstall" ]]; then
  chmod +x build/pkg-scripts/preinstall || true
fi

echo "==> 构建 .pkg（electron-builder target: pkg）"
retry 3 pnpm build:mac --x64

echo "==> 生成校验和（可选）"
pnpm checksum .pkg || true

echo "==> 完成，产物："
ls -la dist | sed -n '1,200p'
