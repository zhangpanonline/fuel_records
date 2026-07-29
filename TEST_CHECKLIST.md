# Fuel Records — 功能测试清单

> 每次完成一个 Phase 后，补充对应的测试用例。测试时从 Phase 1 按顺序跑到最新 Phase，防止回归。

---

## 测试环境说明

### 本地环境
- 后端: `http://localhost:8000`
- 前端: `http://localhost:5173`
- 数据库: SQLite (`DB_TYPE=sqlite`)，文件 `backend/fuel_records.db`

### 线上环境
- 后端: `https://fuel-records.onrender.com`
- 数据库: PostgreSQL (Supabase)，`DB_TYPE=postgresql`
- 注意: Render 免费实例 15 分钟无请求会休眠，首次访问需等 30-60 秒冷启动
- 注意: 线上数据库不参与本地测试，避免污染生产数据

### 测试前准备

```bash
# 本地：清空数据库重新开始
cd backend && rm -f fuel_records.db && cd ..

# 启动后端
cd backend && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &

# 启动前端（可选，纯 API 测试可跳过）
cd frontend && npm run dev &

# 设置变量（方便后续 curl 命令复用）
BASE="http://localhost:8000/api/v1"
```

---

## Phase 1 — "Hello 油耗"（最小可用版）

### 1.1 健康检查

- [ ] `GET /api/v1/health` 返回 `{"status":"ok","version":"1.0.0"}`

```bash
curl -s $BASE/health
```

### 1.2 创建加油记录

- [ ] 创建第一条记录 → 返回 `is_baseline: true`，`fuel_consumption: null`
- [ ] 创建第二条记录（里程 > 第一条）→ 自动计算油耗
- [ ] 里程小于上一条 → 返回 400 错误 "里程数不能低于上一条记录"
- [ ] 油量/金额为 0 或负数 → 返回 422 校验错误

```bash
# 第一条（基线）
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -d '{"mileage":52000,"fuel_volume":12.5,"fuel_cost":98.75}'

# 第二条（有油耗）
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -d '{"mileage":52500,"fuel_volume":13.0,"fuel_cost":100.0}'

# 里程倒退（应报错）
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -d '{"mileage":51000,"fuel_volume":10.0,"fuel_cost":80.0}'

# 无效数据（应报错）
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -d '{"mileage":0,"fuel_volume":10.0,"fuel_cost":80.0}'
```

### 1.3 获取记录列表

- [ ] 返回分页数据（total, page, page_size, records）
- [ ] 按 record_date 倒序排列

```bash
curl -s "$BASE/records/?page=1&page_size=20"
```

---

## Phase 2 — "CRUD 完整版"

### 2.1 修改记录

- [ ] 修改里程 → 级联重算后续记录的油耗
- [ ] 修改不存在的记录 → 返回 400 "记录不存在"
- [ ] 修改后里程小于上一条 → 返回 400 错误

```bash
# 正常修改备注
curl -s -X PUT $BASE/records/1 \
  -H "Content-Type: application/json" \
  -d '{"note":"中石化XX站"}'

# 修改不存在的记录
curl -s -X PUT $BASE/records/999 \
  -H "Content-Type: application/json" \
  -d '{"note":"test"}'
```

### 2.2 删除记录

- [ ] 删除中间记录 → 级联重算后续记录油耗
- [ ] 删除唯一的基线记录 → 返回 400 错误
- [ ] 删除不存在的记录 → 返回 400 "记录不存在"

```bash
# 正常删除
curl -s -X DELETE $BASE/records/2
```

---

## Phase 3 — "上云"

### 3.1 线上部署验证

- [ ] `GET https://fuel-records.onrender.com/api/v1/health` 返回 200
- [ ] 冷启动：首次请求 30-60 秒后响应
- [ ] 热请求：后续请求正常秒级响应

```bash
curl -s https://fuel-records.onrender.com/api/v1/health
```

---

## Phase 4 — "用户来了"（鉴权）

> **重要**: 以下测试依赖 JWT，需要先获取 token。Phase 4 起所有 `/records` 接口都需要鉴权。

### 4.0 获取测试 Token

```bash
# 注册用户 A
TOKEN_A=$(curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 注册用户 B
TOKEN_B=$(curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"lisi","password":"654321"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 登录用户 A（如果 A 已注册）
TOKEN_A=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

### 4.1 用户注册

- [ ] 正常注册 → 返回 JWT token
- [ ] 重复用户名 → 返回 400 "用户名已被注册"
- [ ] 密码不足 6 位 → 返回 422 校验错误
- [ ] 用户名为空 → 返回 422 校验错误

```bash
# 正常注册
curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'

# 重复注册
curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'

# 短密码
curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","password":"123"}'
```

### 4.2 用户登录

- [ ] 正确密码 → 返回 JWT token
- [ ] 错误密码 → 返回 400 "用户名或密码错误"
- [ ] 不存在的用户 → 返回 400 "用户名或密码错误"

```bash
# 正确登录
curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456"}'

# 错误密码
curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"wrong"}'

# 不存在用户
curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nobody","password":"123456"}'
```

### 4.3 鉴权拦截

- [ ] 无 Token 访问 `/records` → 返回 401
- [ ] 无效 Token 访问 → 返回 401 "Token 无效或已过期"
- [ ] 空 Authorization 头 → 返回 403（FastAPI HTTPBearer 默认行为）

```bash
# 无 Token
curl -s -o /dev/null -w "HTTP %{http_code}" $BASE/records/
echo " (预期 401)"

# 无效 Token
curl -s $BASE/records/ -H "Authorization: Bearer invalid_token_here"
```

### 4.4 数据隔离

- [ ] 用户 A 只能看到自己的记录
- [ ] 用户 B 只能看到自己的记录
- [ ] 用户 B 不能修改 A 的记录 → "无权修改此记录"
- [ ] 用户 B 不能删除 A 的记录 → "无权删除此记录"

```bash
# A 创建记录
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d '{"mileage":52000,"fuel_volume":12.5,"fuel_cost":98.75}'

# B 创建记录
curl -s -X POST $BASE/records/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d '{"mileage":30000,"fuel_volume":40.0,"fuel_cost":320.0}'

# A 看记录
echo -n "A 记录数: "
curl -s $BASE/records/ -H "Authorization: Bearer $TOKEN_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])"

# B 看记录
echo -n "B 记录数: "
curl -s $BASE/records/ -H "Authorization: Bearer $TOKEN_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])"

# B 尝试改 A 的记录（A 的记录 id=1）
curl -s -X PUT $BASE/records/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d '{"note":"hacked"}'

# B 尝试删 A 的记录
curl -s -X DELETE $BASE/records/1 \
  -H "Authorization: Bearer $TOKEN_B"
```

### 4.5 级联重算隔离

- [ ] 用户 A 修改记录时，级联重算不会影响用户 B 的记录

```bash
# A 修改自己的记录
curl -s -X PUT $BASE/records/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d '{"note":"正常修改"}'

# 确认 B 的记录没有受影响
echo -n "修改后 B 记录数: "
curl -s $BASE/records/ -H "Authorization: Bearer $TOKEN_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])"
```

### 4.6 前端验证

- [ ] 未登录时访问 `/` → 自动跳转到 `/login`
- [ ] 登录页 Tab 切换：登录 / 注册
- [ ] 注册成功后 → 自动跳转首页
- [ ] 登录成功后 → 自动跳转首页
- [ ] 首页显示"退出"按钮
- [ ] 点击退出 → 跳转 `/login`，清除 localStorage token
- [ ] 再次访问 `/` → 回到登录页
- [ ] 注册表单校验：两次密码不一致时报错
- [ ] 登录表单校验：用户名/密码为空时报错

---

## 已知坑位记录

### 本地 vs 线上差异

| 场景 | 本地 (SQLite) | 线上 (PostgreSQL) | 影响 |
|------|--------------|-------------------|------|
| `server_default=func.now()` | SQLite 的 `CURRENT_TIMESTAMP` | PostgreSQL 的 `NOW()` | 时区行为可能不同，线上应统一用 UTC |
| `unique=True` 对 NULL | SQLite 允许多个 NULL | PostgreSQL 允许多个 NULL | email 允许多个 NULL，暂无影响 |
| SQLAlchemy echo | 输出 SQL 日志 | 线上会打印到 Render 日志 | 生产环境关掉 APP_DEBUG |
| 连接池 | SQLite 无连接池 | PostgreSQL 自动用连接池 | 线上并发性能更好 |

### Phase 4 踩过的坑

1. **passlib 1.7.4 与 bcrypt 5.0.0 不兼容**
   - 现象: `AttributeError: module 'bcrypt' has no attribute '__about__'`
   - 修复: 降级 bcrypt 到 4.2.1，或直接用 bcrypt 库代替 passlib

2. **`recalculate_consumption` 未过滤 user_id**
   - 现象: 用户 A 修改记录，级联到用户 B 的记录，报错 "里程数不能低于上一条记录"
   - 修复: `recalculate_consumption` 加上 `user_id` 参数，查询时过滤 `FuelRecord.user_id == user_id`

---

## 一键测试脚本

> 将以下内容保存为 `test_all.sh`，`chmod +x test_all.sh`，每次修改后运行一次。

```bash
#!/bin/bash
set -e

BASE="${BASE:-http://localhost:8000/api/v1}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "✅ $desc"
    ((PASS++))
  else
    echo "❌ $desc (期望包含 '$expected', 实际: $actual)"
    ((FAIL++))
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

# Phase 4: 鉴权测试（Phase 4 起 records 接口需登录，故跳过 Phase 1-3 的非鉴权方式）
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

# Phase 4: Data isolation
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
```

> **说明:** `test_all.sh` 脚本可在本地 `backend/` 目录下运行，需确保 `curl` 和 `python3` 可用。

---

> **更新记录**
> - 2026-07-29: 初版，覆盖 Phase 1-4 所有功能测试 + 踩坑记录
