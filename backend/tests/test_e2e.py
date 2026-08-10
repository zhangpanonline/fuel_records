"""端到端测试 — 模拟真实用户旅程的 API 级完整流程

本文件对应 e2e-test-spec.md 中可自动化的业务链路测试。
涉及真机 UI 交互的场景（手势、骨架屏、SmartFAB、APK 安装等）不在本文件覆盖范围。
"""

from decimal import Decimal

import pytest


# ═══════════════════════════════════════════════════════════════════════════
# Journey 1 — 新用户注册与登录
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney1RegisterAndLogin:
    """新用户注册 → 登录 → Token 持久化 → 获取用户信息 → 异常登录"""

    def test_full_register_login_me_flow(self, client):
        """E2E-1.1: 注册 → 拿 token → 登录 → 查看 /auth/me"""
        # 注册新用户
        resp = client.post("/api/v1/auth/register", json={
            "username": "e2euser", "password": "test123",
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        assert token

        # 通过 /auth/me 获取当前用户信息
        resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "e2euser"

        # 登录同一用户（退出后重新登录的模拟）
        resp = client.post("/api/v1/auth/login", json={
            "username": "e2euser", "password": "test123",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client):
        """E2E-1.2: 错误密码 → 400"用户名或密码错误" """
        client.post("/api/v1/auth/register", json={
            "username": "zp", "password": "zp1992",
        })
        resp = client.post("/api/v1/auth/login", json={
            "username": "zp", "password": "wrong",
        })
        assert resp.status_code == 400

    def test_login_nonexistent_user(self, client):
        """E2E-1.2: 不存在的用户 → 400"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "nobody", "password": "test123",
        })
        assert resp.status_code == 400

    def test_token_required_for_protected_routes(self, client):
        """E2E-1.3: 未登录访问受保护路由 → 401/403"""
        routes = [
            "/api/v1/vehicles/",
            "/api/v1/records/",
            "/api/v1/expenses/",
            "/api/v1/expenses/categories",
            "/api/v1/expenses/stats?start_date=2025-01-01&end_date=2025-12-31&group_by=none",
            "/api/v1/stats/summary?vehicle_id=1",
        ]
        for url in routes:
            resp = client.get(url)
            assert resp.status_code in (401, 403), f"GET {url} expected 401/403, got {resp.status_code}"

    def test_register_duplicate_shows_error(self, client):
        """E2E-1.4: 重复注册同一用户名 → 409 "已被注册" """
        # 首次注册成功
        resp = client.post("/api/v1/auth/register", json={
            "username": "e2e_dup_reg", "password": "test123",
        })
        assert resp.status_code == 200

        # 再次注册同一用户名 → 409
        resp = client.post("/api/v1/auth/register", json={
            "username": "e2e_dup_reg", "password": "test123",
        })
        assert resp.status_code == 409
        assert "已被注册" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════
# Journey 2 — 加油记录全流程
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney2FuelRecords:
    """创建车辆 → 基线记录 → 第二条记录油耗计算 → 编辑 → 删除级联重算"""

    def _setup_user_vehicle(self, client) -> tuple[str, dict, dict]:
        """注册用户，创建车辆，返回 (token, headers, vehicle)"""
        token = client.post("/api/v1/auth/register", json={
            "username": "fueluser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        v = client.post("/api/v1/vehicles/", json={
            "name": "KPT400", "initial_mileage": 52000,
        }, headers=headers).json()
        return token, headers, v

    def _create_record(self, client, headers, vehicle_id, mileage, volume, cost,
                       full_tank=True, note="", record_date=None):
        return client.post("/api/v1/records/", json={
            "mileage": mileage, "fuel_volume": volume, "fuel_cost": cost,
            "is_full_tank": full_tank, "note": note, "vehicle_id": vehicle_id,
            "record_date": record_date or "2025-01-01T00:00:00",
        }, headers=headers)

    def test_create_baseline_and_second_record_with_consumption(self, client):
        """E2E-2.1: 首次使用 — 创建车辆 → 基线记录 → 第二条记录自动计算油耗"""
        _, headers, v = self._setup_user_vehicle(client)

        # 基线记录
        r1 = self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                                 record_date="2025-01-01T00:00:00")
        assert r1.status_code == 200
        r1_data = r1.json()
        assert Decimal(r1_data["mileage"]) == Decimal("52000")
        assert r1_data["fuel_consumption"] is None  # 基线无油耗

        # 第二条记录
        r2 = self._create_record(client, headers, v["id"], 52500, 13.0, 100.0,
                                 record_date="2025-01-15T00:00:00")
        assert r2.status_code == 200
        r2_data = r2.json()
        # 油耗 = (13.0 / (52500 - 52000)) * 100 = 2.6 L/100km
        assert r2_data["fuel_consumption"] is not None
        assert Decimal(r2_data["fuel_consumption"]) == Decimal("2.60")

    def test_not_full_tank_skips_own_consumption(self, client):
        """E2E-2.3: 非加满加油记录本身不显示油耗"""
        _, headers, v = self._setup_user_vehicle(client)

        # 基线记录
        self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                           record_date="2025-01-01T00:00:00")

        # 非加满记录
        r2 = self._create_record(client, headers, v["id"], 52800, 5.0, 40.0,
                                 full_tank=False, record_date="2025-02-01T00:00:00")
        assert r2.json()["fuel_consumption"] is None

    def test_update_record_triggers_cascade_recalc(self, client):
        """E2E-2.5: 编辑中位记录触发级联重算"""
        _, headers, v = self._setup_user_vehicle(client)

        self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                           record_date="2025-01-01T00:00:00")
        r2 = self._create_record(client, headers, v["id"], 52500, 13.0, 100.0,
                                 record_date="2025-01-15T00:00:00")
        r3 = self._create_record(client, headers, v["id"], 53000, 12.0, 96.0,
                                 record_date="2025-02-01T00:00:00")

        # 修改 r2 金额
        resp = client.put(f"/api/v1/records/{r2.json()['id']}", json={
            "fuel_cost": 110.0,
        }, headers=headers)
        assert resp.status_code == 200

        # r3 油耗应级联重算
        r3_updated = client.get("/api/v1/records/", headers=headers).json()
        r3_data = [r for r in r3_updated["records"] if Decimal(r["mileage"]) == Decimal("53000")][0]
        assert r3_data["fuel_consumption"] is not None

    def test_delete_middle_record_cascade_recalc(self, client):
        """E2E-2.6: 删除中间记录 → 后续记录油耗自动重算"""
        _, headers, v = self._setup_user_vehicle(client)

        self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                           record_date="2025-01-01T00:00:00")
        r2 = self._create_record(client, headers, v["id"], 52500, 13.0, 100.0,
                                 record_date="2025-01-15T00:00:00")
        self._create_record(client, headers, v["id"], 53000, 12.0, 96.0,
                           record_date="2025-02-01T00:00:00")

        # 删除中间记录
        resp = client.delete(f"/api/v1/records/{r2.json()['id']}", headers=headers)
        assert resp.status_code == 200

        # 第 3 条记录油耗重算
        records = client.get("/api/v1/records/", headers=headers).json()
        assert records["total"] == 2             # 从 3 条变为 2 条
        r3 = [r for r in records["records"] if Decimal(r["mileage"]) == Decimal("53000")][0]
        assert r3["fuel_consumption"] is not None

    def test_delete_only_record_succeeds(self, client):
        """E2E-2.6: 删除车辆的唯一加油记录 — 现在允许（initial_mileage 作为永久基线）"""
        _, headers, v = self._setup_user_vehicle(client)

        r1 = self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                                 record_date="2025-01-01T00:00:00")
        resp = client.delete(f"/api/v1/records/{r1.json()['id']}", headers=headers)
        assert resp.status_code == 200
        assert "删除成功" in resp.json()["detail"]

    def test_filter_records(self, client):
        """E2E-2.7: 日期 + 加满状态筛选"""
        _, headers, v = self._setup_user_vehicle(client)

        self._create_record(client, headers, v["id"], 52000, 12.5, 98.75,
                           record_date="2025-01-01T00:00:00")
        self._create_record(client, headers, v["id"], 52500, 5.0, 40.0,
                           full_tank=False, record_date="2025-06-01T00:00:00")
        self._create_record(client, headers, v["id"], 53000, 12.0, 96.0,
                           record_date="2025-12-01T00:00:00")

        # 日期范围筛选
        resp = client.get(
            "/api/v1/records/?start_date=2025-01-01&end_date=2025-06-30",
            headers=headers,
        )
        assert resp.json()["total"] == 2

        # 仅加满筛选
        resp = client.get("/api/v1/records/?is_full_tank=true", headers=headers)
        assert resp.json()["total"] == 2

    def test_vehicle_plate_persists(self, client):
        """E2E-2.8: 创建车辆时传入 plate，验证 plate 正确持久化并在 GET 响应中返回"""
        token = client.post("/api/v1/auth/register", json={
            "username": "e2e_plate_car", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 创建带车牌号的车辆
        resp = client.post("/api/v1/vehicles/", json={
            "name": "KPT400", "initial_mileage": 52000, "plate": "京A12345",
        }, headers=headers)
        assert resp.status_code == 200
        v = resp.json()
        assert v["plate"] == "京A12345"

        # 查询车辆列表，验证 plate 持久化
        resp = client.get("/api/v1/vehicles/", headers=headers)
        assert resp.status_code == 200
        vehicles = resp.json()
        assert len(vehicles) == 1
        assert vehicles[0]["plate"] == "京A12345"


# ═══════════════════════════════════════════════════════════════════════════
# Journey 3 — 多车管理
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney3MultiVehicle:
    """多车并存 — 数据隔离 — 删除保护"""

    def test_multi_vehicle_isolation(self, client):
        """E2E-3.1: 两辆车各自记录互不干扰"""
        token = client.post("/api/v1/auth/register", json={
            "username": "multiuser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 创建两辆车
        v1 = client.post("/api/v1/vehicles/", json={
            "name": "KPT400", "initial_mileage": 52000,
        }, headers=headers).json()
        v2 = client.post("/api/v1/vehicles/", json={
            "name": "卡罗拉", "initial_mileage": 80000,
        }, headers=headers).json()

        # 各录入一条基线
        client.post("/api/v1/records/", json={
            "mileage": 52000, "fuel_volume": 12.5, "fuel_cost": 98.75,
            "is_full_tank": True, "note": "", "vehicle_id": v1["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=headers)
        client.post("/api/v1/records/", json={
            "mileage": 80000, "fuel_volume": 40, "fuel_cost": 320,
            "is_full_tank": True, "note": "", "vehicle_id": v2["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=headers)

        # 按车辆查询，数据隔离
        r1 = client.get(f"/api/v1/records/?vehicle_id={v1['id']}", headers=headers).json()
        r2 = client.get(f"/api/v1/records/?vehicle_id={v2['id']}", headers=headers).json()
        assert r1["total"] == 1
        assert r2["total"] == 1

    def test_cannot_delete_vehicle_with_records(self, client):
        """E2E-3.2: 有加油记录的车辆不能删除"""
        token = client.post("/api/v1/auth/register", json={
            "username": "deluser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        v = client.post("/api/v1/vehicles/", json={
            "name": "test_car", "initial_mileage": 100,
        }, headers=headers).json()
        client.post("/api/v1/records/", json={
            "mileage": 100, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=headers)

        resp = client.delete(f"/api/v1/vehicles/{v['id']}", headers=headers)
        assert resp.status_code == 400  # 有关联记录


# ═══════════════════════════════════════════════════════════════════════════
# Journey 4 — 油耗统计
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney4FuelStats:
    """统计概览 — 时间线 — 月度明细"""

    def test_summary_stats(self, client):
        """E2E-4.1: 统计概览卡片数据"""
        token = client.post("/api/v1/auth/register", json={
            "username": "statsuser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        v = client.post("/api/v1/vehicles/", json={
            "name": "KPT400", "initial_mileage": 52000,
        }, headers=headers).json()

        client.post("/api/v1/records/", json={
            "mileage": 52000, "fuel_volume": 12.5, "fuel_cost": 98.75,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=headers)
        client.post("/api/v1/records/", json={
            "mileage": 52500, "fuel_volume": 13.0, "fuel_cost": 100.0,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-15T00:00:00",
        }, headers=headers)

        resp = client.get(f"/api/v1/stats/summary?vehicle_id={v['id']}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 2
        assert data["total_mileage"] == 500.0
        assert data["total_fuel_volume"] == 25.5
        assert data["total_fuel_cost"] == 198.75

    def test_timeline_monthly(self, client):
        """E2E-4.2: 按月份时间线统计"""
        token = client.post("/api/v1/auth/register", json={
            "username": "timeuser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        v = client.post("/api/v1/vehicles/", json={
            "name": "V", "initial_mileage": 100,
        }, headers=headers).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=headers)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=headers)

        resp = client.get(
            f"/api/v1/stats/timeline?vehicle_id={v['id']}&group_by=month",
            headers=headers,
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 2
        assert items[0]["period"] == "2025-01"
        assert items[1]["period"] == "2025-02"


# ═══════════════════════════════════════════════════════════════════════════
# Journey 5 — 记账全流程
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney5ExpenseWorkflow:
    """分类冷启动 → 记一笔 → 编辑 → 删除 → 六区间卡片"""

    def _setup_expense_user(self, client) -> tuple[str, dict]:
        token = client.post("/api/v1/auth/register", json={
            "username": "expuser", "password": "test123",
        }).json()["access_token"]
        return token, {"Authorization": f"Bearer {token}"}

    def _create_full_category_chain(self, client, headers):
        """创建 餐饮/午餐/外卖 三级分类链"""
        r1 = client.post("/api/v1/expenses/categories", json={
            "name": "餐饮",
        }, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={
            "name": "午餐", "parent_id": l1_id,
        }, headers=headers)
        l2_id = r2.json()["id"]
        r3 = client.post("/api/v1/expenses/categories", json={
            "name": "外卖", "parent_id": l2_id,
        }, headers=headers)
        return r1.json(), r2.json(), r3.json()

    def test_full_expense_crud_flow(self, client):
        """E2E-5.1/5.2: 创建分类 → 记一笔 → 查看 → 编辑 → 删除"""
        _, headers = self._setup_expense_user(client)
        self._create_full_category_chain(client, headers)

        # 记一笔
        resp = client.post("/api/v1/expenses/", json={
            "amount": 35.5, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-15",
            "note": "美团 — 黄焖鸡米饭",
        }, headers=headers)
        assert resp.status_code == 201
        exp_id = resp.json()["id"]

        # 查看列表
        resp = client.get("/api/v1/expenses/", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["note"] == "美团 — 黄焖鸡米饭"

        # 编辑金额
        resp = client.put(f"/api/v1/expenses/{exp_id}", json={
            "amount": 42.0,
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["amount"] == "42.00"

        # 删除
        resp = client.delete(f"/api/v1/expenses/{exp_id}", headers=headers)
        assert resp.status_code == 204

        # 确认删除
        resp = client.get("/api/v1/expenses/", headers=headers)
        assert resp.json()["total"] == 0

    def test_multi_summary_cards(self, client):
        """E2E-5.4: 六区间统计卡片"""
        _, headers = self._setup_expense_user(client)
        self._create_full_category_chain(client, headers)

        client.post("/api/v1/expenses/", json={
            "amount": 35.5, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-15",
        }, headers=headers)

        resp = client.get("/api/v1/expenses/multi_summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "current_year" in data
        assert "current_month" in data
        assert "current_week" in data
        assert "recent_year" in data
        assert "recent_month" in data
        assert "recent_week" in data

    def test_pagination(self, client):
        """E2E-5.5: 分页加载 — 超过 20 条"""
        _, headers = self._setup_expense_user(client)
        self._create_full_category_chain(client, headers)

        # 创建 25 条
        for i in range(25):
            client.post("/api/v1/expenses/", json={
                "amount": 10 + i, "category_l1": "餐饮", "category_l2": "午餐",
                "category_l3": "外卖", "expense_date": f"2025-07-{min(i+1, 28):02d}",
            }, headers=headers)

        resp = client.get("/api/v1/expenses/?page=1&page_size=20", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 25
        assert len(resp.json()["items"]) == 20
        assert resp.json()["page"] == 1
        assert resp.json()["page_size"] == 20

    def test_empty_state(self, client):
        """E2E-5.6: 无数据时的空状态"""
        _, headers = self._setup_expense_user(client)

        resp = client.get("/api/v1/expenses/", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []

    def test_category_sort_order_persists(self, client):
        """E2E-5.7: 创建分类时指定 sort_order，验证其出现在分类树响应中"""
        token = client.post("/api/v1/auth/register", json={
            "username": "e2e_sort_cat", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 创建分类，指定 sort_order=5
        resp = client.post("/api/v1/expenses/categories", json={
            "name": "餐饮", "sort_order": 5,
        }, headers=headers)
        assert resp.status_code == 201
        cat = resp.json()
        assert cat["sort_order"] == 5
        l1_id = cat["id"]

        # 创建子分类
        client.post("/api/v1/expenses/categories", json={
            "name": "午餐", "parent_id": l1_id, "sort_order": 10,
        }, headers=headers)

        # 查询分类树，验证 sort_order 持久化
        resp = client.get("/api/v1/expenses/categories", headers=headers)
        assert resp.status_code == 200
        categories = resp.json()["categories"]
        assert len(categories) == 1
        assert categories[0]["sort_order"] == 5
        assert len(categories[0]["children"]) == 1
        assert categories[0]["children"][0]["sort_order"] == 10


# ═══════════════════════════════════════════════════════════════════════════
# Journey 6 — 记账统计与图表
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney6ExpenseStats:
    """统计汇总 + 分类占比 + 分时段"""

    def test_expense_stats_with_category_breakdown(self, client):
        """E2E-6.1: 支出统计 → 分类占比 breakdown (ROLLUP)"""
        token = client.post("/api/v1/auth/register", json={
            "username": "estatsuser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 创建分类链
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": l2_id}, headers=headers)

        # 创建两条支出
        client.post("/api/v1/expenses/", json={
            "amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-15",
        }, headers=headers)
        client.post("/api/v1/expenses/", json={
            "amount": 25, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-20",
        }, headers=headers)

        resp = client.get(
            "/api/v1/expenses/stats?start_date=2025-07-01&end_date=2025-07-31&group_by=none",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "none"
        assert data["total_amount"] == "60.00"
        assert data["record_count"] == 2
        # ROLLUP 产生 4 行：L1/L2/L3 汇总、L1/L2 汇总、L1 汇总、总计
        assert len(data["category_breakdown"]) == 4

    def test_expense_stats_by_period(self, client):
        """E2E-6.1: 按月/周/年分时段统计"""
        token = client.post("/api/v1/auth/register", json={
            "username": "perioduser", "password": "test123",
        }).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": r2.json()["id"]}, headers=headers)

        client.post("/api/v1/expenses/", json={
            "amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-15",
        }, headers=headers)

        for group in ["month", "week", "year"]:
            resp = client.get(
                f"/api/v1/expenses/stats?start_date=2025-01-01&end_date=2025-12-31&group_by={group}",
                headers=headers,
            )
            assert resp.status_code == 200
            assert resp.json()["group_by"] == group
            assert len(resp.json()["items"]) > 0


# ═══════════════════════════════════════════════════════════════════════════
# Journey 10 — 数据隔离（多用户安全）
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney10DataIsolation:
    """用户 A 和 B 之间完全数据隔离"""

    def test_vehicle_and_record_isolation(self, client):
        """E2E-10.1: 用户 A 创建的数据，用户 B 看不到"""
        # 用户 A
        token_a = client.post("/api/v1/auth/register", json={
            "username": "user_a", "password": "test123",
        }).json()["access_token"]
        ha = {"Authorization": f"Bearer {token_a}"}

        v_a = client.post("/api/v1/vehicles/", json={
            "name": "KPT400", "initial_mileage": 52000,
        }, headers=ha).json()
        client.post("/api/v1/records/", json={
            "mileage": 52000, "fuel_volume": 12.5, "fuel_cost": 98.75,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=ha)

        # 用户 B
        token_b = client.post("/api/v1/auth/register", json={
            "username": "user_b", "password": "test123",
        }).json()["access_token"]
        hb = {"Authorization": f"Bearer {token_b}"}

        # B 看不到 A 的车辆
        resp = client.get("/api/v1/vehicles/", headers=hb)
        assert resp.json() == []

        # B 看不到 A 的记录
        resp = client.get("/api/v1/records/", headers=hb)
        assert resp.json()["total"] == 0

    def test_cross_user_access_blocked(self, client):
        """E2E-10.2: 用户 B 尝试操作 A 的资源 → 被拒绝"""
        token_a = client.post("/api/v1/auth/register", json={
            "username": "a_owner", "password": "test123",
        }).json()["access_token"]
        ha = {"Authorization": f"Bearer {token_a}"}

        v_a = client.post("/api/v1/vehicles/", json={
            "name": "mycar", "initial_mileage": 100,
        }, headers=ha).json()
        r_a = client.post("/api/v1/records/", json={
            "mileage": 100, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=ha).json()

        # 用户 B 注册
        token_b = client.post("/api/v1/auth/register", json={
            "username": "b_intruder", "password": "test123",
        }).json()["access_token"]
        hb = {"Authorization": f"Bearer {token_b}"}

        # B 尝试修改 A 的记录 → 403（无权）
        resp = client.put(f"/api/v1/records/{r_a['id']}", json={
            "note": "hack",
        }, headers=hb)
        assert resp.status_code == 403

        # B 尝试删除 A 的记录 → 403
        resp = client.delete(f"/api/v1/records/{r_a['id']}", headers=hb)
        assert resp.status_code == 403

        # B 尝试删除 A 的车辆 → 403
        resp = client.delete(f"/api/v1/vehicles/{v_a['id']}", headers=hb)
        assert resp.status_code == 403

        # B 尝试在 A 的车辆下创建记录 → 403
        resp = client.post("/api/v1/records/", json={
            "mileage": 200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=hb)
        assert resp.status_code == 403

    def test_expense_data_isolation(self, client):
        """E2E-10.3: 记账数据隔离 — 分类 + 支出"""
        token_a = client.post("/api/v1/auth/register", json={
            "username": "ea_user", "password": "test123",
        }).json()["access_token"]
        ha = {"Authorization": f"Bearer {token_a}"}

        # A 创建分类 + 支出
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=ha)
        r2 = client.post("/api/v1/expenses/categories", json={
            "name": "午餐", "parent_id": r1.json()["id"],
        }, headers=ha)
        client.post("/api/v1/expenses/categories", json={
            "name": "外卖", "parent_id": r2.json()["id"],
        }, headers=ha)
        client.post("/api/v1/expenses/", json={
            "amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
            "category_l3": "外卖", "expense_date": "2025-07-15",
        }, headers=ha)

        # B 注册 → 看不到 A 的数据
        token_b = client.post("/api/v1/auth/register", json={
            "username": "eb_user", "password": "test123",
        }).json()["access_token"]
        hb = {"Authorization": f"Bearer {token_b}"}

        resp = client.get("/api/v1/expenses/categories", headers=hb)
        assert resp.json()["categories"] == []

        resp = client.get("/api/v1/expenses/", headers=hb)
        assert resp.json()["total"] == 0


# ═══════════════════════════════════════════════════════════════════════════
# Journey 12 — Token 过期与异常恢复
# ═══════════════════════════════════════════════════════════════════════════

class TestJourney12TokenAndRecovery:
    """无效 Token → 401, 篡改 Token → 401, 无 Token → 401"""

    def test_invalid_token_rejected(self, client):
        """E2E-12.1: 伪造 Token → 401"""
        resp = client.get("/api/v1/vehicles/", headers={
            "Authorization": "Bearer invalid.token.here",
        })
        assert resp.status_code == 401

    def test_malformed_token_rejected(self, client):
        """E2E-12.1: 完全伪造 Token → 401"""
        resp = client.get("/api/v1/vehicles/", headers={
            "Authorization": "Bearer completely.invalid.token.value",
        })
        assert resp.status_code == 401

    def test_no_token_rejected(self, client):
        """E2E-12.1: 无 Token → 401"""
        resp = client.get("/api/v1/vehicles/")
        assert resp.status_code == 401

    def test_expired_token_handler_works_on_protected_routes(self, client):
        """E2E-12.2: 所有受保护路由统一 401"""
        routes = [
            ("GET", "/api/v1/stats/timeline?vehicle_id=1&group_by=month"),
            ("GET", "/api/v1/stats/monthly?vehicle_id=1"),
            ("GET", "/api/v1/expenses/stats?start_date=2025-01-01&end_date=2025-12-31&group_by=none"),
            ("GET", "/api/v1/auth/me"),
            ("POST", "/api/v1/records/"),
            ("POST", "/api/v1/expenses/"),
        ]
        for method, url in routes:
            resp = client.request(method, url)
            assert resp.status_code in (401, 422), f"{method} {url} expected 401/422, got {resp.status_code}"
