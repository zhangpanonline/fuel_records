#!/usr/bin/env bash
set -euo pipefail

# ── 一键发版：升版本号 → 构建 APK → 上传 Supabase ──
# 用法: ./build_apk.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> 检查 JAVA_HOME ..."
JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null)" || {
  echo "❌ JDK 21 未找到，请先安装 Amazon Corretto 21"
  exit 1
}
export JAVA_HOME
echo "   JAVA_HOME=$JAVA_HOME"

echo "==> 加载环境变量 ..."
if [ ! -f .env ]; then
  echo "❌ 缺少 .env 文件，请先创建"
  exit 1
fi
# 逐行 export，避免 xargs 解析 JWT 中的引号字符
set -a
while IFS= read -r line; do
  [[ -n "$line" ]] && export "$line"
done < <(grep -v '^#' .env | grep -v '^$' || true)
set +a

if [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  echo "❌ .env 中缺少 SUPABASE_SERVICE_KEY"
  exit 1
fi

echo "==> 检查 capacitor.config.ts ..."
if grep -q "url:" frontend/capacitor.config.ts 2>/dev/null; then
  echo "❌ capacitor.config.ts 中仍有 server.url（开发联调配），请先去掉 server 块再打包"
  echo "   开发联调时才需要 server 块指向电脑 IP，打包 APK 必须从内置 dist/ 加载"
  exit 1
fi
echo "   配置正常（无 server 块，将从内置 dist/ 加载）"

echo "==> 开始发版 ..."
node scripts/upload-apk.js

echo ""
echo "✅ 发版完成"
