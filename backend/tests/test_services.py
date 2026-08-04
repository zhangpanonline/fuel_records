"""服务层单元测试：油耗计算 / 认证 / 车辆 / 统计"""

from decimal import Decimal
from datetime import datetime

import pytest

from models.vehicle import Vehicle
from models.user import User
from schemas.record import FuelRecordCreate, FuelRecordUpdate
from schemas.vehicle import VehicleCreate, VehicleUpdate
from core.security import hash_password, verify_password, generate_access_token, verify_access_token
from services.record_service import create_record, update_record, delete_record, get_records, recalculate_consumption
from services.auth_service import register_user, login_user, DuplicateUserError
from services.vehicle_service import create_vehicle, get_vehicles, update_vehicle, delete_vehicle
from services.stats_service import get_summary, get_timeline


def _create_user(db_session, user_id=None):
    """创建测试用户并返回 user_id（PostgreSQL 强制外键约束需要）"""
    if user_id is not None:
        u = User(id=user_id, username=f"test{user_id}", hashed_password=hash_password("pass123"), is_active=True)
        db_session.add(u)
        db_session.commit()
        return user_id
    u = User(username="testuser", hashed_password=hash_password("pass123"), is_active=True)
    db_session.add(u)
    db_session.commit()
    return u.id


# ══════════════════════════════════════════════════════════════════
# 安全工具（bcrypt + JWT）
# ══════════════════════════════════════════════════════════════════

class TestSecurity:
    def test_hash_and_verify(self):
        pwd = "my-secret-password"
        hashed = hash_password(pwd)
        assert hashed != pwd
        assert verify_password(pwd, hashed) is True
        assert verify_password("wrong", hashed) is False

    def test_hash_is_random_each_time(self):
        h1 = hash_password("abc")
        h2 = hash_password("abc")
        assert h1 != h2

    def test_jwt_roundtrip(self):
        token = generate_access_token(user_id=42)
        payload = verify_access_token(token)
        assert payload["sub"] == "42"
        assert payload["type"] == "access"

    def test_jwt_tampered(self):
        token = generate_access_token(user_id=1)
        with pytest.raises(Exception):
            verify_access_token(token[:-3] + "xxx")


# ══════════════════════════════════════════════════════════════════
# 认证服务
# ══════════════════════════════════════════════════════════════════

class TestAuthService:
    def test_register_user(self, db_session):
        data = type("D", (), {"username": "alice", "password": "pass123"})()
        result = register_user(db_session, data)
        assert "access_token" in result
        assert result["token_type"] == "bearer"
        payload = verify_access_token(result["access_token"])
        assert int(payload["sub"]) > 0

    def test_register_duplicate(self, db_session):
        data = type("D", (), {"username": "alice", "password": "pass123"})()
        register_user(db_session, data)
        with pytest.raises(DuplicateUserError, match="已被注册"):
            register_user(db_session, data)

    def test_login_success(self, db_session):
        data = type("D", (), {"username": "bob", "password": "pass123"})()
        register_user(db_session, data)
        login_data = type("D", (), {"username": "bob", "password": "pass123"})()
        result = login_user(db_session, login_data)
        assert "access_token" in result

    def test_login_wrong_password(self, db_session):
        data = type("D", (), {"username": "bob", "password": "pass123"})()
        register_user(db_session, data)
        login_data = type("D", (), {"username": "bob", "password": "wrong"})()
        with pytest.raises(ValueError, match="用户名或密码错误"):
            login_user(db_session, login_data)

    def test_login_nonexistent_user(self, db_session):
        login_data = type("D", (), {"username": "ghost", "password": "x"})()
        with pytest.raises(ValueError, match="用户名或密码错误"):
            login_user(db_session, login_data)


# ══════════════════════════════════════════════════════════════════
# 车辆服务
# ══════════════════════════════════════════════════════════════════

class TestVehicleService:
    def test_create_vehicle(self, db_session):
        _create_user(db_session, user_id=1)
        v = create_vehicle(db_session, VehicleCreate(name="KPT400", plate="京A12345", initial_mileage=10000), user_id=1)
        assert v.name == "KPT400"
        assert v.user_id == 1
        assert v.plate == "京A12345"
        assert v.is_active is True

    def test_get_vehicles(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        create_vehicle(db_session, VehicleCreate(name="A", initial_mileage=100), user_id=1)
        create_vehicle(db_session, VehicleCreate(name="B", initial_mileage=200), user_id=1)
        create_vehicle(db_session, VehicleCreate(name="C", initial_mileage=300), user_id=2)
        v_list = get_vehicles(db_session, user_id=1)
        assert len(v_list) == 2

    def test_update_vehicle(self, db_session):
        _create_user(db_session, user_id=1)
        v = create_vehicle(db_session, VehicleCreate(name="old", initial_mileage=100), user_id=1)
        updated = update_vehicle(db_session, v.id, VehicleUpdate(name="new"), user_id=1)
        assert updated.name == "new"

    def test_update_vehicle_not_owned(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=100), user_id=1)
        with pytest.raises(ValueError, match="无权修改"):
            update_vehicle(db_session, v.id, VehicleUpdate(name="x"), user_id=2)

    def test_delete_vehicle(self, db_session):
        _create_user(db_session, user_id=1)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=100), user_id=1)
        deleted = delete_vehicle(db_session, v.id, user_id=1)
        assert deleted.id == v.id
        assert get_vehicles(db_session, user_id=1) == []

    def test_delete_vehicle_with_records(self, db_session):
        _create_user(db_session, user_id=1)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=50), user_id=1)
        rec = FuelRecordCreate(mileage=Decimal("100.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
                               is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1))
        create_record(db_session, rec, user_id=1)
        with pytest.raises(ValueError, match="无法删除"):
            delete_vehicle(db_session, v.id, user_id=1)


# ══════════════════════════════════════════════════════════════════
# 油耗计算核心逻辑
# ══════════════════════════════════════════════════════════════════

def _make_vehicle(db_session, user_id=1):
    _create_user(db_session, user_id=user_id)
    return create_vehicle(db_session, VehicleCreate(name="Test", initial_mileage=100), user_id=user_id)


class TestRecordService:
    def test_create_baseline_record(self, db_session):
        """首次加油无上一条记录 → 基线记录，不计算油耗"""
        v = _make_vehicle(db_session)
        rec = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        assert rec.is_baseline is True
        assert rec.fuel_consumption is None

    def test_create_non_baseline_with_consumption(self, db_session):
        """第二次加油（加满）→ 计算油耗"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        rec2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        assert rec2.is_baseline is False
        assert float(rec2.fuel_consumption) == 5.0

    def test_not_full_tank_skips_consumption(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        rec2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        assert rec2.fuel_consumption is None

    def test_mileage_must_increase(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        with pytest.raises(ValueError, match="不能低于"):
            create_record(db_session, FuelRecordCreate(
                mileage=Decimal("9999.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
                is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
            ), user_id=1)

    def test_vehicle_must_belong_to_user(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        v = create_vehicle(db_session, VehicleCreate(name="Other", initial_mileage=100), user_id=2)
        with pytest.raises(ValueError, match="无权"):
            create_record(db_session, FuelRecordCreate(
                mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
                is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
            ), user_id=1)

    def test_unit_price_calculation(self, db_session):
        v = _make_vehicle(db_session)
        rec = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        assert float(rec.unit_price) == 8.0


class TestRecalculateConsumption:
    """级联重算：修改/删除后重新计算后续记录油耗"""

    def test_update_middle_record_triggers_recalc(self, db_session):
        v = _make_vehicle(db_session)
        # 基线
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        # 中间
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("11000"), fuel_volume=Decimal("12"), fuel_cost=Decimal("96"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        # 末尾
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("12000"), fuel_volume=Decimal("8"), fuel_cost=Decimal("64"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        # 修改中间记录里程为10800 → 中间油耗=12/(10800-10000)*100=1.5, 末尾油耗=8/(12000-10800)*100≈0.67
        update_record(db_session, r2.id, FuelRecordUpdate(mileage=Decimal("10800")), user_id=1)

        recs, _ = get_records(db_session, user_id=1, vehicle_id=v.id)
        # 按 mileage 排序找中间和末尾
        recs_sorted = sorted(recs, key=lambda r: float(r.mileage))
        mid = recs_sorted[1]   # mileage=10800
        last = recs_sorted[2]  # mileage=12000
        assert float(mid.fuel_consumption) == pytest.approx(1.5, 0.01)
        assert float(last.fuel_consumption) == pytest.approx(0.67, 0.01)

    def test_delete_record_then_recalc(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("11000"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        r3 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("12000"), fuel_volume=Decimal("8"), fuel_cost=Decimal("64"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        # 删除中间记录 → r3 变成新基线
        delete_record(db_session, r2.id, user_id=1)
        recs, _ = get_records(db_session, user_id=1, vehicle_id=v.id)
        assert len(recs) == 2
        # 剩下的两条中，r3 的 mileage 更大（12000 > 10000），它是第二条 → 非基线
        last = [r for r in recs if r.id == r3.id][0]
        assert last.is_baseline is False

    def test_delete_only_baseline_blocked(self, db_session):
        v = _make_vehicle(db_session)
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        with pytest.raises(ValueError, match="唯一的基线记录"):
            delete_record(db_session, r.id, user_id=1)


class TestRecordFiltering:
    def test_filter_by_full_tank(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        _, total_full = get_records(db_session, user_id=1, vehicle_id=v.id, is_full_tank=True)
        _, total_partial = get_records(db_session, user_id=1, vehicle_id=v.id, is_full_tank=False)
        assert total_full == 1
        assert total_partial == 1

    def test_filter_by_note(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="中石化加油", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="中石油加油", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        _, total = get_records(db_session, user_id=1, vehicle_id=v.id, note="中石化")
        assert total == 1
        _, total = get_records(db_session, user_id=1, vehicle_id=v.id, note="加油")
        assert total == 2


class TestStatsService:
    def test_summary_empty(self, db_session):
        result = get_summary(db_session, user_id=1, vehicle_id=999)
        assert result["record_count"] == 0

    def test_summary_basic(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10500"), fuel_volume=Decimal("10"), fuel_cost=Decimal("85"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        result = get_summary(db_session, user_id=1, vehicle_id=v.id)
        assert result["record_count"] == 2
        assert result["total_mileage"] == 500.0
        assert result["total_fuel_volume"] == 25.0
        assert result["total_fuel_cost"] == 205.0
