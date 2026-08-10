"""API 接口测试：鉴权 / CRUD / 数据隔离 / 筛选"""

from decimal import Decimal

from tests.conftest import register_user, auth_headers


# ══════════════════════════════════════════════════════════════════
# 鉴权
# ══════════════════════════════════════════════════════════════════

class TestAuthAPI:
    def test_register_and_login(self, client):
        resp = client.post("/api/v1/auth/register", json={"username": "alice", "password": "pass123"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

        resp = client.post("/api/v1/auth/register", json={"username": "alice", "password": "pass123"})
        assert resp.status_code == 409
        assert "已被注册" in resp.json()["detail"]

    def test_login_success(self, client):
        register_user(client, "bob", "pass123")
        resp = client.post("/api/v1/auth/login", json={"username": "bob", "password": "pass123"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/v1/auth/login", json={"username": "nobody", "password": "x"})
        assert resp.status_code == 400
        assert "用户名或密码错误" in resp.json()["detail"]

    def test_login_wrong_password(self, client):
        register_user(client, "bob", "pass123")
        resp = client.post("/api/v1/auth/login", json={"username": "bob", "password": "wrong"})
        assert resp.status_code == 400
        assert "用户名或密码错误" in resp.json()["detail"]

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/v1/records/")
        assert resp.status_code == 401

    def test_vehicles_unauthenticated_returns_401(self, client):
        resp = client.get("/api/v1/vehicles/")
        assert resp.status_code == 401

    def test_health_check(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


# ══════════════════════════════════════════════════════════════════
# 车辆 API
# ══════════════════════════════════════════════════════════════════

class TestVehicleAPI:
    def test_create_and_list_vehicles(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)

        resp = client.post("/api/v1/vehicles/", json={"name": "KPT400", "initial_mileage": 50000}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["name"] == "KPT400"

        resp = client.get("/api/v1/vehicles/", headers=h)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_update_vehicle(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "old", "initial_mileage": 100}, headers=h).json()

        resp = client.put(f"/api/v1/vehicles/{v['id']}", json={"name": "new"}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["name"] == "new"

    def test_delete_vehicle(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "to-delete", "initial_mileage": 100}, headers=h).json()

        resp = client.delete(f"/api/v1/vehicles/{v['id']}", headers=h)
        assert resp.status_code == 200

        resp = client.get("/api/v1/vehicles/", headers=h)
        assert resp.json() == []

    def test_cannot_access_other_user_vehicle(self, client):
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        v_a = client.post("/api/v1/vehicles/", json={"name": "A", "initial_mileage": 100}, headers=auth_headers(t_a)).json()

        resp = client.put(f"/api/v1/vehicles/{v_a['id']}", json={"name": "hack"}, headers=auth_headers(t_b))
        assert resp.status_code == 403
        assert "无权" in resp.json()["detail"]

    def test_delete_vehicle_with_records(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.delete(f"/api/v1/vehicles/{v['id']}", headers=h)
        assert resp.status_code == 400

    def test_cannot_delete_other_user_vehicle(self, client):
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        v_a = client.post("/api/v1/vehicles/", json={"name": "A", "initial_mileage": 100}, headers=auth_headers(t_a)).json()

        resp = client.delete(f"/api/v1/vehicles/{v_a['id']}", headers=auth_headers(t_b))
        assert resp.status_code == 403

    def test_update_vehicle_plate(self, client):
        token = register_user(client, "plate_user")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100, "plate": "京A12345"}, headers=h).json()

        resp = client.put(f"/api/v1/vehicles/{v['id']}", json={"plate": "京B67890"}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["plate"] == "京B67890"

    def test_update_vehicle_is_active(self, client):
        token = register_user(client, "active_user")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.put(f"/api/v1/vehicles/{v['id']}", json={"is_active": False}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_update_vehicle_initial_mileage(self, client):
        token = register_user(client, "mileage_user")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.put(f"/api/v1/vehicles/{v['id']}", json={"initial_mileage": 1000}, headers=h)
        assert resp.status_code == 200
        # initial_mileage 不在 VehicleUpdate schema 中，不会被更新
        assert Decimal(resp.json()["initial_mileage"]) == Decimal("100.0")


# ══════════════════════════════════════════════════════════════════
# 记录 API
# ══════════════════════════════════════════════════════════════════

class TestRecordAPI:
    def test_create_record(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_baseline"] is True
        # mileage=10000 > initial_mileage=100 → 可计算油耗
        assert data["fuel_consumption"] is not None
        assert Decimal(data["fuel_consumption"]) == Decimal("0.15")

    def test_list_own_records(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/records/?vehicle_id={v['id']}", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["records"]) == 2

    def test_update_record(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        r = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h).json()

        resp = client.put(f"/api/v1/records/{r['id']}", json={"note": "updated"}, headers=h)
        assert resp.status_code == 200
        assert resp.json()["note"] == "updated"

    def test_delete_record(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        r1 = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)

        resp = client.delete(f"/api/v1/records/{r1['id']}", headers=h)
        assert resp.status_code == 200
        assert "删除成功" in resp.json()["detail"]

    def test_cannot_modify_other_user_record(self, client):
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        v_a = client.post("/api/v1/vehicles/", json={"name": "A", "initial_mileage": 100}, headers=auth_headers(t_a)).json()

        r = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=auth_headers(t_a)).json()

        resp = client.put(f"/api/v1/records/{r['id']}", json={"note": "hack"}, headers=auth_headers(t_b))
        assert resp.status_code == 403
        assert "无权" in resp.json()["detail"]

    def test_create_record_missing_vehicle_id_422(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        resp = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        assert resp.status_code == 422

    def test_create_record_mileage_too_low(self, client):
        """里程低于前一条记录 → 400"""
        token = register_user(client, "milo")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={
            "name": "V", "initial_mileage": 10000,
        }, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        resp = client.post("/api/v1/records/", json={
            "mileage": 9000, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-02T00:00:00",
        }, headers=h)
        assert resp.status_code == 400

    def test_update_nonexistent_record(self, client):
        """修改不存在的记录 → 404"""
        token = register_user(client, "updno")["access_token"]
        h = auth_headers(token)
        resp = client.put("/api/v1/records/9999", json={"note": "x"}, headers=h)
        assert resp.status_code == 404

    def test_delete_nonexistent_record(self, client):
        """删除不存在的记录 → 404"""
        token = register_user(client, "delno")["access_token"]
        h = auth_headers(token)
        resp = client.delete("/api/v1/records/9999", headers=h)
        assert resp.status_code == 404

    # ── IR-001: 创建记录 ──

    def test_create_second_record_with_consumption(self, client):
        """第二条满箱记录会计算油耗"""
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        # 第一条
        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        # 第二条
        resp = client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_baseline"] is False
        assert data["fuel_consumption"] is not None

    def test_create_record_other_user_vehicle(self, client):
        """使用他人的 vehicle_id 创建记录 → 403"""
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        v_a = client.post("/api/v1/vehicles/", json={"name": "A", "initial_mileage": 100}, headers=auth_headers(t_a)).json()

        resp = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=auth_headers(t_b))
        assert resp.status_code == 403

    def test_create_non_full_tank_record(self, client):
        """is_full_tank=false → fuel_consumption=null"""
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": False, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        assert resp.status_code == 200
        assert resp.json()["fuel_consumption"] is None

    # ── IR-002: 记录列表筛选 ──

    def test_filter_by_full_tank(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": False, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/records/?vehicle_id={v['id']}&is_full_tank=true", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_filter_by_full_tank_false(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": False, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/records/?vehicle_id={v['id']}&is_full_tank=false", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_filter_by_note(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "中石化", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "中石油", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/records/?vehicle_id={v['id']}&note=中石化", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_filter_by_date_range(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-15T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-03-15T00:00:00",
        }, headers=h)

        resp = client.get(
            f"/api/v1/records/?vehicle_id={v['id']}&start_date=2025-01-01&end_date=2025-02-01",
            headers=h,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_list_without_vehicle_id(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)

        resp = client.get("/api/v1/records/", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["records"] == []

    def test_list_pagination(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        # 创建 5 条记录
        for i in range(5):
            client.post("/api/v1/records/", json={
                "mileage": 10000 + i * 100, "fuel_volume": 10, "fuel_cost": 80,
                "is_full_tank": True, "note": "", "vehicle_id": v["id"],
                "record_date": f"2025-0{i+1}-01T00:00:00",
            }, headers=h)

        resp = client.get(f"/api/v1/records/?vehicle_id={v['id']}&page=1&page_size=2", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["records"]) == 2

    # ── IR-003: 修改记录（里程级联） ──

    def test_update_record_mileage_triggers_recalc(self, client):
        """修改第一条记录的里程 → 后续记录油耗级联重算"""
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        r1 = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h).json()
        r2 = client.post("/api/v1/records/", json={
            "mileage": 10200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-02-01T00:00:00",
        }, headers=h).json()
        old_consumption = Decimal(r2["fuel_consumption"])

        # 修改第一条记录的里程（在合法范围内：>initial_mileage 且 < r2.mileage）
        resp = client.put(f"/api/v1/records/{r1['id']}", json={"mileage": 10100}, headers=h)
        assert resp.status_code == 200

        # 查看第二条记录的油耗是否变化
        resp2 = client.get(f"/api/v1/records/?vehicle_id={v['id']}", headers=h)
        records = resp2.json()["records"]
        r2_new = [r for r in records if r["id"] == r2["id"]][0]
        assert Decimal(r2_new["fuel_consumption"]) != old_consumption

    # ── IR-004: 删除记录 ──

    def test_delete_only_record(self, client):
        """删除车辆唯一记录 → 200"""
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        r = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h).json()

        resp = client.delete(f"/api/v1/records/{r['id']}", headers=h)
        assert resp.status_code == 200
        assert "删除成功" in resp.json()["detail"]

    def test_delete_other_user_record(self, client):
        """删除他人的记录 → 403"""
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        v_a = client.post("/api/v1/vehicles/", json={"name": "A", "initial_mileage": 100}, headers=auth_headers(t_a)).json()

        r = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v_a["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=auth_headers(t_a)).json()

        resp = client.delete(f"/api/v1/records/{r['id']}", headers=auth_headers(t_b))
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════
# 统计 API
# ══════════════════════════════════════════════════════════════════

class TestStatsAPI:
    def test_summary_requires_auth(self, client):
        resp = client.get("/api/v1/stats/summary?vehicle_id=1")
        assert resp.status_code == 401

    def test_summary_returns_data(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/stats/summary?vehicle_id={v['id']}", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 1

    def test_timeline_returns_data(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/stats/timeline?vehicle_id={v['id']}&group_by=month", headers=h)
        assert resp.status_code == 200
        assert "items" in resp.json()

    def test_monthly_compat(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.get(f"/api/v1/stats/monthly?vehicle_id={v['id']}", headers=h)
        assert resp.status_code == 200
        assert "months" in resp.json()

    def test_empty_stats(self, client):
        """无记录 → record_count=0, 各项为 null/0"""
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        resp = client.get(f"/api/v1/stats/summary?vehicle_id={v['id']}", headers=h)
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 0
        assert data["avg_consumption"] is None
        assert data["avg_unit_price"] is None

    def test_timeline_group_by_day(self, client):
        token = register_user(client, "timeline_day")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/stats/timeline?vehicle_id={v['id']}&group_by=day", headers=h)
        assert resp.status_code == 200
        assert "items" in resp.json()
        assert len(resp.json()["items"]) > 0

    def test_timeline_group_by_week(self, client):
        token = register_user(client, "timeline_week")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={"name": "V", "initial_mileage": 100}, headers=h).json()

        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get(f"/api/v1/stats/timeline?vehicle_id={v['id']}&group_by=week", headers=h)
        assert resp.status_code == 200
        assert "items" in resp.json()
        assert len(resp.json()["items"]) > 0


# ══════════════════════════════════════════════════════════════════
# 数据隔离
# ══════════════════════════════════════════════════════════════════

class TestDataIsolation:
    def test_vehicle_isolation(self, client):
        """用户 A 的车辆和记录对用户 B 不可见"""
        t_a = register_user(client, "alice")["access_token"]
        t_b = register_user(client, "bob")["access_token"]
        h_a = auth_headers(t_a)
        h_b = auth_headers(t_b)

        v = client.post("/api/v1/vehicles/", json={"name": "A_V", "initial_mileage": 100}, headers=h_a).json()
        client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h_a)

        # B 获取车辆列表 → 空
        resp = client.get("/api/v1/vehicles/", headers=h_b)
        assert resp.status_code == 200
        assert resp.json() == []

        # B 获取记录列表 → 空
        resp = client.get("/api/v1/records/", headers=h_b)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestAuthMe:
    def test_get_me(self, client):
        token = register_user(client, "bob")["access_token"]
        h = auth_headers(token)
        resp = client.get("/api/v1/auth/me", headers=h)
        assert resp.status_code == 200
        assert resp.json()["username"] == "bob"

    def test_get_me_requires_auth(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_delete_nonexistent_record(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        resp = client.delete("/api/v1/records/9999", headers=h)
        assert resp.status_code == 404

    def test_update_nonexistent_vehicle(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        resp = client.put("/api/v1/vehicles/9999", json={"name": "x"}, headers=h)
        assert resp.status_code == 404

    def test_delete_nonexistent_vehicle(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        resp = client.delete("/api/v1/vehicles/9999", headers=h)
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════
# API 层边缘情况：空字符串 / 空格 / 异常参数
# ══════════════════════════════════════════════════════════════════

class TestAPIEdgeCases:
    def test_records_filter_empty_start_date_handled(self, client):
        """start_date 为空字符串 → _parse_date 返回 None，忽略过滤"""
        token = register_user(client, "edgeuser")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={
            "name": "V", "initial_mileage": 100,
        }, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 100, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get("/api/v1/records/?start_date=", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1  # 空字符串被忽略，返回全部

    def test_records_filter_end_date_only(self, client):
        """end_date 有值但无 start_date → 按结束日期过滤"""
        token = register_user(client, "edgeuser1")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={
            "name": "V", "initial_mileage": 100,
        }, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 100, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        client.post("/api/v1/records/", json={
            "mileage": 200, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-06-01T00:00:00",
        }, headers=h)

        resp = client.get("/api/v1/records/?end_date=2025-03-01", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1  # 仅 1 月的记录

    def test_records_filter_empty_is_full_tank_rejected(self, client):
        """is_full_tank 为空字符串时 FastAPI 返回 422"""
        token = register_user(client, "edgeuser2")["access_token"]
        h = auth_headers(token)

        resp = client.get("/api/v1/records/?is_full_tank=", headers=h)
        assert resp.status_code == 422

    def test_records_filter_whitespace_note(self, client):
        """note 值为纯空格时不参与筛选，返回全部记录"""
        token = register_user(client, "edgeuser3")["access_token"]
        h = auth_headers(token)
        v = client.post("/api/v1/vehicles/", json={
            "name": "V", "initial_mileage": 100,
        }, headers=h).json()
        client.post("/api/v1/records/", json={
            "mileage": 100, "fuel_volume": 10, "fuel_cost": 80,
            "is_full_tank": True, "note": "", "vehicle_id": v["id"],
            "record_date": "2025-01-01T00:00:00",
        }, headers=h)

        resp = client.get("/api/v1/records/?note=   ", headers=h)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_expense_empty_query_params(self, client):
        """支出列表不带任何过滤参数 → 正常返回"""
        token = client.post("/api/v1/auth/register", json={
            "username": "emptyparam", "password": "test123",
        }).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        resp = client.get("/api/v1/expenses/?page=1&page_size=10", headers=h)
        assert resp.status_code == 200
        assert resp.json()["items"] == []
