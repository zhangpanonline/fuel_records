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

    def test_update_nonexistent_category(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.put(
            "/api/v1/expenses/categories/9999",
            json={"name": "x"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_delete_nonexistent_category(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.delete("/api/v1/expenses/categories/9999", headers=headers)
        assert resp.status_code == 404

    def test_delete_empty_category(self, client):
        """删除无子分类且无关联支出记录的分类 → 204"""
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        cat_id = r1.json()["id"]

        resp = client.delete(f"/api/v1/expenses/categories/{cat_id}", headers=headers)
        assert resp.status_code == 204


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
        assert resp.json()["id"] is not None

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

    def test_create_expense_amount_zero_rejected(self, client):
        """amount=0 → 422 (Pydantic gt=0)"""
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        resp = client.post(
            "/api/v1/expenses/",
            json={"amount": 0, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_create_expense_amount_negative_rejected(self, client):
        """amount 为负数 → 422"""
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        resp = client.post(
            "/api/v1/expenses/",
            json={"amount": -5, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        assert resp.status_code == 422

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

    def test_update_expense_to_invalid_category(self, client):
        """更新支出到无效分类链 → 400"""
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
            json={"category_l1": "餐饮", "category_l2": "晚餐", "category_l3": "外卖"},
            headers=headers,
        )
        assert resp.status_code == 400

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

    def test_update_nonexistent_expense(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.put(
            "/api/v1/expenses/9999",
            json={"amount": 50},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_delete_nonexistent_expense(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.delete("/api/v1/expenses/9999", headers=headers)
        assert resp.status_code == 404

    def test_unauthorized_access(self, client):
        """无 Token 访问返回 403（HTTPBearer 拒绝）"""
        resp = client.get("/api/v1/expenses/")
        assert resp.status_code in (401, 403)

    def test_categories_unauthenticated(self, client):
        """无 Token 访问分类接口"""
        resp = client.get("/api/v1/expenses/categories")
        assert resp.status_code in (401, 403)

    def test_stats_unauthenticated(self, client):
        """无 Token 访问统计接口"""
        resp = client.get("/api/v1/expenses/stats")
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

    def test_expense_stats_weekly(self, client):
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
            "/api/v1/expenses/stats?start_date=2026-07-01&end_date=2026-07-31&group_by=week",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "week"
        assert len(data["items"]) > 0

    def test_expense_stats_with_category_filter(self, client):
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
            "/api/v1/expenses/stats?start_date=2026-07-01&end_date=2026-07-31"
            "&group_by=none&category_l1=餐饮&category_l2=午餐",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "none"

    # ── IE-002: 支出列表筛选 ──

    def test_get_expenses_pagination(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        for i in range(5):
            client.post(
                "/api/v1/expenses/",
                json={"amount": 10 + i, "category_l1": "餐饮", "category_l2": "午餐",
                      "category_l3": "外卖", "expense_date": f"2026-07-{10+i:02d}"},
                headers=headers,
            )

        resp = client.get("/api/v1/expenses/?page=1&page_size=2", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    def test_get_expenses_date_filter(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )
        client.post(
            "/api/v1/expenses/",
            json={"amount": 50, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-08-15"},
            headers=headers,
        )

        resp = client.get(
            "/api/v1/expenses/?start_date=2026-07-01&end_date=2026-07-31",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_get_expenses_category_filter(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        # 创建另一个 L1 分类
        r = client.post("/api/v1/expenses/categories", json={"name": "交通"}, headers=headers)
        l1_id = r.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "公交", "parent_id": l1_id}, headers=headers)
        client.post("/api/v1/expenses/categories", json={"name": "地铁", "parent_id": l1_id}, headers=headers)

        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )
        client.post(
            "/api/v1/expenses/",
            json={"amount": 10, "category_l1": "交通", "category_l2": "公交",
                  "category_l3": "地铁", "expense_date": "2026-07-15"},
            headers=headers,
        )

        resp = client.get("/api/v1/expenses/?category_l1=餐饮", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_get_expenses_category_l2_filter(self, client):
        token = _register_and_login(client, "l2filter")
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)

        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )

        resp = client.get("/api/v1/expenses/?category_l2=午餐", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_get_expenses_category_l3_filter(self, client):
        token = _register_and_login(client, "l3filter")
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)

        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )

        resp = client.get("/api/v1/expenses/?category_l3=外卖", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    # ── IE-003: 修改支出 ──

    def test_update_expense_note(self, client):
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
            json={"note": "同事聚餐"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["note"] == "同事聚餐"

    # ── IE-005: 支出统计 ──

    def test_expense_stats_yearly(self, client):
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
            "/api/v1/expenses/stats?start_date=2026-01-01&end_date=2026-12-31&group_by=year",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_by"] == "year"
        assert len(data["items"]) == 1

    # ── IE-006: 六区间统计 ──

    def test_multi_summary_with_data(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 100, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers,
        )
        resp = client.get("/api/v1/expenses/multi_summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "current_year" in data
        assert "current_month" in data
        assert "current_week" in data
        assert "recent_year" in data
        assert "recent_month" in data
        assert "recent_week" in data

    def test_multi_summary_empty(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/api/v1/expenses/multi_summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_year"] == "0"
        assert data["current_month"] == "0"

    # ── IE-008: 支出查询边界 ──

    def test_expense_pagination_normal(self, client):
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        self._setup_categories(client, headers)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers,
        )
        resp = client.get("/api/v1/expenses/?page=1&page_size=10", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1


# ══════════════════════════════════════════════════════════════════
# 数据隔离 & 跨用户写保护（支出模块）
# ══════════════════════════════════════════════════════════════════

class TestExpenseDataIsolation:
    """ID-001 / ID-002: 支出模块数据隔离与跨用户写保护"""

    def _setup_categories(self, client, headers):
        r1 = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers)
        l1_id = r1.json()["id"]
        r2 = client.post("/api/v1/expenses/categories", json={"name": "午餐", "parent_id": l1_id}, headers=headers)
        l2_id = r2.json()["id"]
        client.post("/api/v1/expenses/categories", json={"name": "外卖", "parent_id": l2_id}, headers=headers)

    def test_category_isolation(self, client):
        """用户 A 的分类树对用户 B 不可见"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "isol_cat_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "isol_cat_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        self._setup_categories(client, headers_a)

        # B 获取分类树 → 空
        resp = client.get("/api/v1/expenses/categories", headers=headers_b)
        assert resp.status_code == 200
        assert resp.json()["categories"] == []

    def test_stats_isolation(self, client):
        """用户 A 的统计数据对用户 B 不可见"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "isol_stat_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "isol_stat_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        self._setup_categories(client, headers_a)
        client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-15"},
            headers=headers_a,
        )

        # B 获取统计 → 空
        resp = client.get(
            "/api/v1/expenses/stats?start_date=2026-07-01&end_date=2026-07-31&group_by=none",
            headers=headers_b,
        )
        assert resp.status_code == 200
        assert resp.json()["record_count"] == 0

    def test_cannot_update_other_user_category(self, client):
        """用户 B 修改用户 A 的分类 → 404"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "cross_cat_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "cross_cat_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        r = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers_a)
        cat_id = r.json()["id"]

        resp = client.put(
            f"/api/v1/expenses/categories/{cat_id}",
            json={"name": "hacked"},
            headers=headers_b,
        )
        assert resp.status_code == 404

    def test_cannot_delete_other_user_category(self, client):
        """用户 B 删除用户 A 的分类 → 404"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "cross_delcat_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "cross_delcat_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        r = client.post("/api/v1/expenses/categories", json={"name": "餐饮"}, headers=headers_a)
        cat_id = r.json()["id"]

        resp = client.delete(f"/api/v1/expenses/categories/{cat_id}", headers=headers_b)
        assert resp.status_code == 404

    def test_cannot_update_other_user_expense(self, client):
        """用户 B 修改用户 A 的支出 → 403"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "cross_exp_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "cross_exp_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        self._setup_categories(client, headers_a)
        r = client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers_a,
        )
        exp_id = r.json()["id"]

        resp = client.put(
            f"/api/v1/expenses/{exp_id}",
            json={"amount": 999},
            headers=headers_b,
        )
        assert resp.status_code == 403

    def test_cannot_delete_other_user_expense(self, client):
        """用户 B 删除用户 A 的支出 → 403"""
        t_a = client.post("/api/v1/auth/register", json={
            "username": "cross_delexp_a", "password": "test123",
        }).json()["access_token"]
        t_b = client.post("/api/v1/auth/register", json={
            "username": "cross_delexp_b", "password": "test123",
        }).json()["access_token"]
        headers_a = {"Authorization": f"Bearer {t_a}"}
        headers_b = {"Authorization": f"Bearer {t_b}"}

        self._setup_categories(client, headers_a)
        r = client.post(
            "/api/v1/expenses/",
            json={"amount": 35, "category_l1": "餐饮", "category_l2": "午餐",
                  "category_l3": "外卖", "expense_date": "2026-07-31"},
            headers=headers_a,
        )
        exp_id = r.json()["id"]

        resp = client.delete(f"/api/v1/expenses/{exp_id}", headers=headers_b)
        assert resp.status_code == 403


# ── 辅助函数 ──

def _register_and_login(client, username: str = "testuser") -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "test123"},
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]
