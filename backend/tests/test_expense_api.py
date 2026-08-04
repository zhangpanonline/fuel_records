"""支出模块 API 测试"""

import pytest


class TestExpenseCategoryAPI:
    """分类管理 API 测试"""

    def test_create_l1_category(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/expenses/categories",
            json={"name": "餐饮"},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "餐饮"
        assert resp.json()["level"] == 1

    def test_create_l2_category(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        # 创建 L1
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        # 创建 L2
        r2 = client.post(
            "/api/v1/expenses/categories",
            json={"name": "午餐", "parent_id": l1_id},
            headers=headers,
        )
        assert r2.status_code == 201
        assert r2.json()["level"] == 2

    def test_create_l3_category(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        r3 = client.post(
            "/api/v1/expenses/categories",
            json={"name": "外卖", "parent_id": l2_id},
            headers=headers,
        )
        assert r3.status_code == 201
        assert r3.json()["level"] == 3

    def test_cannot_create_level4(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        r3 = client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": l2_id}, headers=headers)
        l3_id = r3.json()["id"]
        r4 = client.post(
            "/api/v1/expenses/categories",
            json={"name": "川菜", "parent_id": l3_id},
            headers=headers,
        )
        assert r4.status_code == 400

    def test_parent_not_found(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/expenses/categories",
            json={"name": "午餐", "parent_id": 9999},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_duplicate_name_same_level(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        resp = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        assert resp.status_code == 409

    def test_get_category_tree(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        resp = client.get("/api/v1/expenses/categories", headers=headers)
        assert resp.status_code == 200
        cats = resp.json()["categories"]
        assert len(cats) == 1
        assert cats[0]["name"] == "餐饮"
        assert len(cats[0]["children"]) == 1

    def test_delete_category_with_children(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        resp = client.delete(f"/api/v1/expenses/categories/{l1_id}", headers=headers)
        assert resp.status_code == 400  # 有子分类不能删

    def test_delete_category_with_records(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        # 创建完整分类链
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        r3 = client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": l2_id}, headers=headers)
        l3_id = r3.json()["id"]
        # 创建支出记录
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        # 删除 L3 分类（关联了记录）
        resp = client.delete(f"/api/v1/expenses/categories/{l3_id}", headers=headers)
        assert resp.status_code == 400  # 有关联记录不能删

    def test_update_category_name(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        cat_id = r1.json()["id"]
        resp = client.put(
            f"/api/v1/expenses/categories/{cat_id}",
            json={"name": "食品"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "食品"


class TestExpenseAPI:
    """支出记录 API 测试"""

    def _setup_categories(self, client, headers):
        """创建完整的三级分类链并返回名称"""
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": l2_id}, headers=headers)

    def test_create_expense(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        resp = client.post(
            "/api/v1/expenses/",
            json={
                "amount": 35.5,
                "category_l1": "餐饮",
                "category_l2": "午餐",
                "category_l3": "外卖",
                "expense_date": "2026-07-31",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["id"] == 1

    def test_create_expense_invalid_chain(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        # L2 不匹配
        resp = client.post(
            "/api/v1/expenses/",
            json={
                "amount": 35.5,
                "category_l1": "餐饮",
                "category_l2": "晚餐",
                "category_l3": "外卖",
                "expense_date": "2026-07-31",
            },
            headers=headers,
        )
        assert resp.status_code == 400

    def test_list_expenses(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        resp = client.get("/api/v1/expenses/", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1

    def test_update_expense(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        r = client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        exp_id = r.json()["id"]
        resp = client.put(
            f"/api/v1/expenses/{exp_id}",
            json={"amount": 50},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["amount"] == "50.00"

    def test_delete_expense(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        r = client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        exp_id = r.json()["id"]
        resp = client.delete(f"/api/v1/expenses/{exp_id}", headers=headers)
        assert resp.status_code == 204

    def test_unauthorized_access(self, client):
        """无 Token 访问返回 403（HTTPBearer 拒绝）"""
        resp = client.get("/api/v1/expenses/")
        assert resp.status_code in (401, 403)

    def test_data_isolation(self, client):
        """用户 A 不能看到用户 B 的记录"""
        # 用户 A 创建
        token_a = _register_and_login(client, "user_a")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        self._setup_categories(client, headers_a)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers_a,
        )

        # 用户 B 注册
        token_b = _register_and_login(client, "user_b")
        headers_b = {"Authorization": f"Bearer {token_b}"}
        resp = client.get("/api/v1/expenses/", headers=headers_b)
        assert resp.json()["total"] == 0

    def test_expense_stats_summary(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        resp = client.get(
            "/api/v1/expenses/stats?start_date=2026-07-01&end_date=2026-07-31&group_by=none",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "none"
        assert data["total_amount"] == "35.00"
        assert len(data["category_breakdown"]) == 4  # L1+L2+L3 / L1+L2 / L1 / grand total

    def test_expense_stats_monthly(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )
        resp = client.get(
            "/api/v1/expenses/stats?start_date=2026-07-01&end_date=2026-07-31&group_by=month",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "month"
        assert len(data["items"]) == 1
        assert data["items"][0]["period"] == "2026-07"


# ── 辅助函数 ──

def _register_and_login(client, username: str = "testuser") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "test123"},
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]
