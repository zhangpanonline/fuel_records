#!/bin/bash

BASE="${BASE:-http://localhost:8000/api/v1}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "❌ $desc (期望包含 '$expected', 实际: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Fuel Records 自动化功能测试"
echo "  目标: $BASE"
echo "========================================"
echo ""

# Phase 1
echo "--- Phase 1 ---"
check "健康检查" '"status":"ok"' "$(curl -s $BASE/health)"

# Phase 4: Auth
echo ""
echo "--- Phase 4: Auth ---"
REG=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"test123"}')
check "注册新用户" "access_token" "$REG"
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

DUP=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"test123"}')
check "重复注册" "已被注册" "$DUP"

LOGIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"test123"}')
check "正确登录" "access_token" "$LOGIN"

BAD=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"wrong"}')
check "错误密码" "用户名或密码错误" "$BAD"

HTTP401=$(curl -s -o /dev/null -w "%{http_code}" $BASE/records/)
check "无Token访问" "401" "$HTTP401"

# Phase 4: Data Isolation
echo ""
echo "--- Phase 4: Data Isolation ---"
curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"username":"autotest2","password":"test123"}' > /dev/null 2>&1 || true
TOKEN2=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest2","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

R1=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"mileage":52000,"fuel_volume":12.5,"fuel_cost":98.75}')
check "创建记录" "baseline" "$R1"

R2=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" -d '{"mileage":30000,"fuel_volume":40.0,"fuel_cost":320.0}')
check "另一个用户创建记录" "baseline" "$R2"

ACOUNT=$(curl -s $BASE/records/ -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
check "用户1只看到1条记录" "1" "$ACOUNT"

BCOUNT=$(curl -s $BASE/records/ -H "Authorization: Bearer $TOKEN2" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
check "用户2只看到1条记录" "1" "$BCOUNT"

CROSS=$(curl -s -X PUT $BASE/records/1 -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" -d '{"note":"hack"}')
check "跨用户修改被拒" "无权" "$CROSS"

echo ""
echo "========================================"
echo "  结果: $PASS 通过, $FAIL 失败"
echo "========================================"
