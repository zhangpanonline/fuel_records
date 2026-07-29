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
echo "--- Phase 1: Health ---"
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
check "重复注册被拒" "已被注册" "$DUP"

LOGIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"test123"}')
check "正确登录" "access_token" "$LOGIN"

BAD=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest","password":"wrong"}')
check "错误密码" "用户名或密码错误" "$BAD"

HTTP401=$(curl -s -o /dev/null -w "%{http_code}" $BASE/records/)
check "无Token访问401" "401" "$HTTP401"

# User B
curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"username":"autotest2","password":"test123"}' > /dev/null 2>&1 || true
TOKEN2=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"autotest2","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Phase 5: Vehicle CRUD
echo ""
echo "--- Phase 5: Vehicle CRUD ---"

V1=$(curl -s -X POST $BASE/vehicles/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"name":"KPT400","initial_mileage":52000}')
check "用户A创建车辆" "KPT400" "$V1"
VEH1_ID=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

V2=$(curl -s -X POST $BASE/vehicles/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"name":"卡罗拉","plate":"粤B12345","initial_mileage":80000}')
check "用户A创建第二辆车" "卡罗拉" "$V2"
VEH2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

VLIST=$(curl -s $BASE/vehicles/ -H "Authorization: Bearer $TOKEN")
check "用户A车辆列表有2辆" "卡罗拉" "$VLIST"

VUPDATE=$(curl -s -X PUT $BASE/vehicles/$VEH1_ID -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"name":"KPT400改"}')
check "修改车辆名称" "KPT400改" "$VUPDATE"

# Phase 5: Records with vehicle_id
echo ""
echo "--- Phase 5: Records with vehicle_id ---"

# 无 vehicle_id 应失败
NOVID_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"mileage":52000,"fuel_volume":12.5,"fuel_cost":98.75}')
check "无vehicle_id被拒(422)" "422" "$NOVID_CODE"

# 创建车辆1的加油记录
R1=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d "{\"vehicle_id\":$VEH1_ID,\"mileage\":52000,\"fuel_volume\":12.5,\"fuel_cost\":98.75}")
check "创建记录(基线)" "baseline" "$R1"

R2=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d "{\"vehicle_id\":$VEH1_ID,\"mileage\":52500,\"fuel_volume\":13.0,\"fuel_cost\":100.0}")
check "创建第二条记录(有油耗)" "fuel_consumption" "$R2"

# 里程倒退
BACK=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d "{\"vehicle_id\":$VEH1_ID,\"mileage\":51000,\"fuel_volume\":10.0,\"fuel_cost\":80.0}")
check "里程倒退被拒" "不能低于" "$BACK"

# 不存在的车辆
BADVEH=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"vehicle_id":99999,"mileage":50000,"fuel_volume":10.0,"fuel_cost":80.0}')
check "不存在的车辆" "不存在" "$BADVEH"

# 车辆2的记录（独立）
R3=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d "{\"vehicle_id\":$VEH2_ID,\"mileage\":80000,\"fuel_volume\":40.0,\"fuel_cost\":320.0}")
check "车辆2创建记录(基线)" "baseline" "$R3"

# Phase 5: Per-vehicle filtering
echo ""
echo "--- Phase 5: Vehicle filtering ---"

VC1=$(curl -s "$BASE/records/?vehicle_id=$VEH1_ID" -H "Authorization: Bearer $TOKEN")
check "车辆1有2条记录" '"total":2' "$VC1"

VC2=$(curl -s "$BASE/records/?vehicle_id=$VEH2_ID" -H "Authorization: Bearer $TOKEN")
check "车辆2有1条记录" '"total":1' "$VC2"

# Phase 5: Data isolation
echo ""
echo "--- Phase 5: Data isolation ---"

# B 看不到 A 的车辆
BVLIST=$(curl -s $BASE/vehicles/ -H "Authorization: Bearer $TOKEN2")
check "B看不到A的车辆" "\[\]" "$BVLIST"

# B 替 A 的车创建记录应被拒
BCROSS=$(curl -s -X POST $BASE/records/ -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" -d "{\"vehicle_id\":$VEH1_ID,\"mileage\":60000,\"fuel_volume\":20.0,\"fuel_cost\":160.0}")
check "B不能替A的车创建记录" "无权" "$BCROSS"

# B 不能改 A 的记录
BEDIT=$(curl -s -X PUT $BASE/records/1 -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" -d '{"note":"hack"}')
check "跨用户修改被拒" "无权" "$BEDIT"

# Phase 5: Delete protection (per vehicle)
echo ""
echo "--- Phase 5: Delete ---"

# 删除车辆1的基线记录（该车还有第2条，应允许）
DEL1=$(curl -s -X DELETE $BASE/records/1 -H "Authorization: Bearer $TOKEN")
check "删除基线记录(非唯一)" "删除成功" "$DEL1"

# 车辆2只有一条基线，删除应被拒
DEL2=$(curl -s -X DELETE $BASE/records/3 -H "Authorization: Bearer $TOKEN")
check "删除唯一基线被拒" "无法删除" "$DEL2"

# 删除有记录的车辆应被拒
DELVEH=$(curl -s -X DELETE $BASE/vehicles/$VEH1_ID -H "Authorization: Bearer $TOKEN")
check "删除有关联记录的车辆被拒" "无法删除" "$DELVEH"

echo ""
echo "========================================"
echo "  结果: $PASS 通过, $FAIL 失败"
echo "========================================"
