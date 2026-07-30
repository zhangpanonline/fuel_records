"""API 接口测试：鉴权 / CRUD / 数据隔离 / 筛选"""

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
        assert resp.status_code == 400
        assert "已被注册" in resp.json()["detail"]

    def test_login_wrong_password(self, client):
        register_user(client, "bob", "pass123")
        resp = client.post("/api/v1/auth/login", json={"username": "bob", "password": "wrong"})
        assert resp.status_code == 400
        assert "用户名或密码错误" in resp.json()["detail"]

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/v1/records/")
        assert resp.status_code == 401

    def test_health_check(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


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
        assert resp.status_code == 400
        assert "无权" in resp.json()["detail"]


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
        assert data["fuel_consumption"] is None

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
        assert resp.status_code == 400
        assert "无权" in resp.json()["detail"]

    def test_create_record_missing_vehicle_id_422(self, client):
        token = register_user(client, "alice")["access_token"]
        h = auth_headers(token)
        resp = client.post("/api/v1/records/", json={
            "mileage": 10000, "fuel_volume": 15, "fuel_cost": 120,
            "is_full_tank": True, "note": "", "record_date": "2025-01-01T00:00:00",
        }, headers=h)
        assert resp.status_code == 422


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
