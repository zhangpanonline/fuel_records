"""服务层单元测试：油耗计算 / 认证 / 车辆 / 统计"""

from decimal import Decimal
from datetime import datetime, date

import pytest

from models.vehicle import Vehicle
from models.user import User
from models.fuel_record import FuelRecord
from models.expense_category import ExpenseCategory
from schemas.record import FuelRecordCreate, FuelRecordUpdate
from schemas.vehicle import VehicleCreate, VehicleUpdate
from schemas.expense import ExpenseCreate, ExpenseUpdate
from core.security import hash_password, verify_password, generate_access_token, verify_access_token
from core.exceptions import NotFoundError, BadRequestError, ForbiddenError, ConflictError
from services.record_service import create_record, update_record, delete_record, get_records, recalculate_consumption
from services.auth_service import register_user, login_user, DuplicateUserError
from services.vehicle_service import create_vehicle, get_vehicles, update_vehicle, delete_vehicle
from services.stats_service import get_summary, get_timeline
from services.expense_category_service import create_category, list_categories, update_category, delete_category, _count_linked_expenses
from services.expense_service import _validate_category_chain, create_expense, get_expenses, get_expense_by_id, update_expense, delete_expense
from services.expense_stats_service import get_stats, get_multi_summary


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
        with pytest.raises(ForbiddenError, match="无权修改"):
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
        with pytest.raises(BadRequestError, match="无法删除"):
            delete_vehicle(db_session, v.id, user_id=1)


# ══════════════════════════════════════════════════════════════════
# 油耗计算核心逻辑
# ══════════════════════════════════════════════════════════════════

def _make_vehicle(db_session, user_id=1):
    _create_user(db_session, user_id=user_id)
    return create_vehicle(db_session, VehicleCreate(name="Test", initial_mileage=100), user_id=user_id)


class TestRecordService:
    def test_create_baseline_record(self, db_session):
        """首次加油 → 基线记录，使用 initial_mileage(100) 计算油耗"""
        v = _make_vehicle(db_session)
        rec = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        assert rec.is_baseline is True
        # 油耗 = 15 / (10000 - 100) * 100 = 1.515... ≈ 1.52
        assert rec.fuel_consumption is not None
        assert float(rec.fuel_consumption) == pytest.approx(0.15, 0.01)

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

    def test_full_after_partial_uses_last_full(self, db_session):
        """ADR-001：加满 → 未加满 → 加满，第三条油耗参考"上次加满"记录，跳过未加满"""
        v = _make_vehicle(db_session)
        # 基线：10000 加满 15L
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        # 未加满：10200 5L
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200.0"), fuel_volume=Decimal("5.0"), fuel_cost=Decimal("40.0"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        # 加满：10400 10L → 参考 10000 → 10/(10400-10000)*100 = 2.5
        rec3 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10400.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)
        assert float(rec3.fuel_consumption) == pytest.approx(2.5, 0.01)

    def test_first_full_after_partial_falls_back_to_initial(self, db_session):
        """ADR-001：无任何加满历史时，加满记录回退参考 initial_mileage"""
        v = _make_vehicle(db_session)  # initial_mileage=100
        # 首条未加满：10100 5L
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10100.0"), fuel_volume=Decimal("5.0"), fuel_cost=Decimal("40.0"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        # 第二条加满：10300 10L → 参考 initial=100 → 10/(10300-100)*100 ≈ 0.10（保留 2 位小数）
        rec2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10300.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        assert float(rec2.fuel_consumption) == pytest.approx(10 / 102, abs=0.01)

    def test_mileage_must_increase(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000.0"), fuel_volume=Decimal("15.0"), fuel_cost=Decimal("120.0"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        with pytest.raises(BadRequestError, match="不能低于"):
            create_record(db_session, FuelRecordCreate(
                mileage=Decimal("9999.0"), fuel_volume=Decimal("10.0"), fuel_cost=Decimal("80.0"),
                is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
            ), user_id=1)

    def test_vehicle_must_belong_to_user(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        v = create_vehicle(db_session, VehicleCreate(name="Other", initial_mileage=100), user_id=2)
        with pytest.raises(ForbiddenError, match="无权"):
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

    def test_recalc_skips_partial_for_full_reference(self, db_session):
        """ADR-001：删除中间未加满记录后，后继加满记录参考更早的加满记录"""
        v = _make_vehicle(db_session)
        # 10000 满 15L / 10200 未满 5L / 10400 满 10L / 10600 满 8L
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r_partial = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("5"), fuel_cost=Decimal("40"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        r3 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10400"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)
        r4 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10600"), fuel_volume=Decimal("8"), fuel_cost=Decimal("64"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 4, 1),
        ), user_id=1)

        # 删除未加满记录 → r3 参考 10000 → 10/(10400-10000)*100=2.5；r4 参考 r3 → 8/200*100=4.0
        delete_record(db_session, r_partial.id, user_id=1)

        db_session.refresh(r3)
        db_session.refresh(r4)
        assert float(r3.fuel_consumption) == pytest.approx(2.5, 0.01)
        assert float(r4.fuel_consumption) == pytest.approx(4.0, 0.01)

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

    def test_delete_only_record_succeeds(self, db_session):
        """删除车辆的唯一记录 — 现在允许（initial_mileage 作为永久基线）"""
        v = _make_vehicle(db_session)
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        deleted = delete_record(db_session, r.id, user_id=1)
        assert deleted.id == r.id
        recs, _ = get_records(db_session, user_id=1, vehicle_id=v.id)
        assert len(recs) == 0


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


# ══════════════════════════════════════════════════════════════════
# 时间线统计
# ══════════════════════════════════════════════════════════════════

class TestTimelineStats:
    def test_timeline_empty(self, db_session):
        result = get_timeline(db_session, user_id=1, vehicle_id=999)
        assert result == []

    def test_timeline_by_day(self, db_session):
        v = _make_vehicle(db_session)
        r1 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 2),
        ), user_id=1)

        result = get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="day")
        assert len(result) == 2
        assert result[0]["period"] == "2025-01-01"

    def test_timeline_by_month(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        result = get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="month")
        assert len(result) == 2
        assert result[0]["period"] == "2025-01"

    def test_timeline_by_week(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 8),
        ), user_id=1)

        result = get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="week",
                             start_date="2025-01-01", end_date="2025-01-31")
        assert len(result) == 2

    def test_timeline_with_date_filter(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        result = get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="month",
                             start_date="2025-01-01", end_date="2025-01-31")
        assert len(result) == 1
        assert result[0]["period"] == "2025-01"


# ══════════════════════════════════════════════════════════════════
# 记录服务边缘分支
# ══════════════════════════════════════════════════════════════════

class TestRecordServiceEdges:
    def test_update_nonexistent_record(self, db_session):
        v = _make_vehicle(db_session)
        with pytest.raises(NotFoundError, match="记录不存在"):
            update_record(db_session, 9999, FuelRecordUpdate(note="x"), user_id=1)

    def test_update_empty_payload(self, db_session):
        v = _make_vehicle(db_session)
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="orig", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        # 空更新返回原记录
        updated = update_record(db_session, r.id, FuelRecordUpdate(), user_id=1)
        assert updated.note == "orig"

    def test_delete_record_wrong_user(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=100), user_id=1)
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        with pytest.raises(ForbiddenError, match="无权删除"):
            delete_record(db_session, r.id, user_id=2)

    def test_recalculate_mileage_violation(self, db_session):
        v = _make_vehicle(db_session)
        r1 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10500"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("11000"), fuel_volume=Decimal("8"), fuel_cost=Decimal("64"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        # 将 r3 里程改为低于 r1 → 删除 r2 后 r3 里程 < r1 里程触发 violation
        db_session.query(FuelRecord).filter(
            FuelRecord.mileage == Decimal("11000")
        ).update({"mileage": Decimal("9000")})

        # 删除 r2 → recalculate 从 2025-02-01 开始
        # 剩余记录：r3(date=2025-03-01, mileage=9000), previous=r1(mileage=10000)
        # 9000 <= 10000 → 触发 violation
        with pytest.raises(BadRequestError, match="不能低于"):
            delete_record(db_session, r2.id, user_id=1)


# ══════════════════════════════════════════════════════════════════
# 支出分类服务边缘分支
# ══════════════════════════════════════════════════════════════════

class TestExpenseCategoryEdges:
    def test_delete_category_without_children(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        # 无子分类、无关联记录 → 应成功删除
        delete_category(db_session, cat.id, user_id=1)
        tree = list_categories(db_session, user_id=1)
        assert tree == []

    def test_update_nonexistent_category(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="分类不存在"):
            update_category(db_session, 9999, user_id=1, name="new")

    def test_count_linked_expenses_empty(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        count = _count_linked_expenses(db_session, 1, cat)
        assert count == 0

    def test_count_linked_expenses_with_data(self, db_session):
        _create_user(db_session, user_id=1)
        cat_l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        cat_l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat_l1.id)
        cat_l3 = create_category(db_session, user_id=1, name="外卖", parent_id=cat_l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 1),
        ))

        assert _count_linked_expenses(db_session, 1, cat_l1) == 1
        assert _count_linked_expenses(db_session, 1, cat_l2) == 1
        assert _count_linked_expenses(db_session, 1, cat_l3) == 1


# ══════════════════════════════════════════════════════════════════
# 支出记录服务边缘分支
# ══════════════════════════════════════════════════════════════════

class TestExpenseServiceEdges:
    def test_validate_category_chain_l2_mismatch(self, db_session):
        _create_user(db_session, user_id=1)
        cat_l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        # 创建另一个 L1 下的 L2
        cat_other_l1 = create_category(db_session, user_id=1, name="交通", parent_id=None)
        cat_l2 = create_category(db_session, user_id=1, name="公交", parent_id=cat_other_l1.id)

        with pytest.raises(BadRequestError, match="不属于一级分类"):
            _validate_category_chain(db_session, 1, "餐饮", "公交", "地铁")

    def test_validate_category_chain_l3_mismatch(self, db_session):
        _create_user(db_session, user_id=1)
        cat_l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        cat_l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat_l1.id)
        # L3 挂到错误的 L2
        cat_other_l2 = create_category(db_session, user_id=1, name="晚餐", parent_id=cat_l1.id)
        cat_l3 = create_category(db_session, user_id=1, name="外卖", parent_id=cat_other_l2.id)

        with pytest.raises(BadRequestError, match="不属于二级分类"):
            _validate_category_chain(db_session, 1, "餐饮", "午餐", "外卖")

    def test_update_nonexistent_expense(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="支出记录不存在"):
            update_expense(db_session, 9999, 1, ExpenseUpdate(amount=Decimal("50")))


# ══════════════════════════════════════════════════════════════════
# 支出统计服务
# ══════════════════════════════════════════════════════════════════

class TestExpenseStatsService:
    def test_multi_summary_empty(self, db_session):
        _create_user(db_session, user_id=1)
        result = get_multi_summary(db_session, user_id=1, today=date(2025, 7, 15))
        assert result.current_year == 0
        assert result.current_month == 0

    def test_multi_summary_with_data(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))

        result = get_multi_summary(db_session, user_id=1, today=date(2025, 7, 15))
        assert result.current_year == 100
        assert result.current_month == 100

    def test_get_stats_weekly(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="week")
        assert result.group_by == "week"

    def test_get_stats_invalid_group(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(BadRequestError, match="group_by"):
            get_stats(db_session, user_id=1,
                     start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                     group_by="invalid")

    def test_get_stats_with_category_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="none", category_l1="餐饮", category_l2="午餐")
        assert result.group_by == "none"

    def test_get_stats_yearly(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
                          group_by="year")
        assert result.group_by == "year"

    def test_get_stats_with_category_l3_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="none", category_l1="餐饮", category_l2="午餐", category_l3="外卖")
        assert result.group_by == "none"

    def test_get_multi_summary_today_none(self, db_session):
        _create_user(db_session, user_id=1)
        # today=None 走 date.today() 路径
        result = get_multi_summary(db_session, user_id=1)
        assert result.current_year >= 0

    def test_multi_summary_recent_year_excludes_start_day(self, db_session):
        """近一年不含起始日：12 个月前当天 + 1 天的数据不算入 recent_year"""
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        today = date(2026, 8, 7)
        exactly_year_ago = date(2025, 8, 7)
        # 记录在 12 个月前当天（应被排除）
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=exactly_year_ago,
        ))

        result = get_multi_summary(db_session, user_id=1, today=today)
        # 12 个月前当天被排除，recent_year 应为 0
        assert result.recent_year == Decimal("0")

    def test_multi_summary_current_week_starts_monday(self, db_session):
        """当周从周一开始（Python weekday() = 0 为周一）"""
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        # 2026-08-07 是周五，当周周一是 2026-08-03
        today = date(2026, 8, 7)  # Friday
        monday = date(2026, 8, 3)  # Monday
        sunday_before = date(2026, 8, 2)  # Sunday (previous week)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=monday,
        ))
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=sunday_before,
        ))

        result = get_multi_summary(db_session, user_id=1, today=today)
        # current_week 仅包含周一及之后，不含上周日
        assert result.current_week == Decimal("100")


# ══════════════════════════════════════════════════════════════════
# 支出记录服务更多边缘分支
# ══════════════════════════════════════════════════════════════════

class TestExpenseServiceMoreEdges:
    def test_validate_category_chain_l1_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="一级分类"):
            _validate_category_chain(db_session, 1, "不存在", "午餐", "外卖")

    def test_get_expenses_with_date_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        items, total = get_expenses(db_session, user_id=1, start_date=date(2025, 7, 1),
                                   end_date=date(2025, 7, 31))
        assert total == 1

    def test_get_expenses_end_date_includes_time_part(self, db_session):
        """结束日当天带时分的记录必须被包含（end_date 需按当日 23:59:59 比较）"""
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=datetime(2025, 7, 31, 18, 45),
        ))
        # 结束日 = 记录当天，必须命中
        _, total_in = get_expenses(db_session, user_id=1, end_date=date(2025, 7, 31))
        assert total_in == 1
        # 结束日提前一天，不应命中
        _, total_out = get_expenses(db_session, user_id=1, end_date=date(2025, 7, 30))
        assert total_out == 0

    def test_get_expenses_with_category_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        items, total = get_expenses(db_session, user_id=1, category_l1="餐饮")
        assert total == 1

    def test_get_expenses_with_category_l2_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        items, total = get_expenses(db_session, user_id=1,
                                   category_l1="餐饮", category_l2="午餐")
        assert total == 1

    def test_get_expenses_with_category_l3_filter(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        items, total = get_expenses(db_session, user_id=1,
                                   category_l1="餐饮", category_l2="午餐", category_l3="外卖")
        assert total == 1

    def test_get_expense_by_id_forbidden(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=cat.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        with pytest.raises(ForbiddenError):
            get_expense_by_id(db_session, exp.id, user_id=2)

    def test_update_expense_with_category_change(self, db_session):
        _create_user(db_session, user_id=1)
        cat1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2a = create_category(db_session, user_id=1, name="午餐", parent_id=cat1.id)
        l3a = create_category(db_session, user_id=1, name="外卖", parent_id=l2a.id)
        l2b = create_category(db_session, user_id=1, name="晚餐", parent_id=cat1.id)
        l3b = create_category(db_session, user_id=1, name="堂食", parent_id=l2b.id)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        # 修改分类到同一 L1 下的另一条链
        updated = update_expense(db_session, exp.id, 1, ExpenseUpdate(
            category_l2="晚餐", category_l3="堂食"
        ))
        assert updated.category_l2 == "晚餐"


# ══════════════════════════════════════════════════════════════════
# 车辆 / 记录服务更多边缘分支
# ══════════════════════════════════════════════════════════════════

class TestVehicleServiceEdges:
    def test_update_vehicle_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="车辆不存在"):
            update_vehicle(db_session, 9999, VehicleUpdate(name="x"), user_id=1)

    def test_delete_vehicle_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="车辆不存在"):
            delete_vehicle(db_session, 9999, user_id=1)

    def test_delete_vehicle_wrong_user(self, db_session):
        _create_user(db_session, user_id=1)
        _create_user(db_session, user_id=2)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=100), user_id=1)
        with pytest.raises(ForbiddenError, match="无权删除"):
            delete_vehicle(db_session, v.id, user_id=2)


class TestRecordServiceMoreEdges:
    def test_create_record_vehicle_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="车辆不存在"):
            create_record(db_session, FuelRecordCreate(
                mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
                is_full_tank=True, note="", vehicle_id=9999, record_date=datetime(2025, 1, 1),
            ), user_id=1)

    def test_get_records_with_date_filter(self, db_session):
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10500"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        items, total = get_records(db_session, user_id=1, vehicle_id=v.id,
                                  start_date="2025-01-01", end_date="2025-01-31")
        assert total == 1


# ══════════════════════════════════════════════════════════════════
# 支出分类更多边缘
# ══════════════════════════════════════════════════════════════════

class TestExpenseCategoryMoreEdges:
    def test_update_category_sort_order(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        updated = update_category(db_session, cat.id, user_id=1, sort_order=5)
        assert updated.sort_order == 5

    def test_delete_category_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="分类不存在"):
            delete_category(db_session, 9999, user_id=1)

    def test_update_category_duplicate_name(self, db_session):
        """同一父分类下重命名到已存在的名称 → ConflictError"""
        _create_user(db_session, user_id=1)
        create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        cat2 = create_category(db_session, user_id=1, name="交通", parent_id=None)
        with pytest.raises(ConflictError, match="已存在"):
            update_category(db_session, cat2.id, user_id=1, name="餐饮")


# ══════════════════════════════════════════════════════════════════
# 边缘情况：时区、空值、异常输入
# ══════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """时区 / record_date 默认值 / _parse_date / 非加满重算"""

    def test_record_date_defaults_to_now(self, db_session):
        """不传 record_date 时自动使用当前时间"""
        v = _make_vehicle(db_session)
        before = datetime.now()
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id,
        ), user_id=1)
        after = datetime.now()
        delta = (r.record_date - before).total_seconds()
        assert -10 <= delta <= (after - before).total_seconds() + 10  # 在创建前后 10 秒内

    def test_parse_date_invalid_format(self, db_session):
        """_parse_date 对非法格式静默返回 None"""
        from services.stats_service import _parse_date
        assert _parse_date("2025/01/01") is None  # 非 %Y-%m-%d
        assert _parse_date("not-a-date") is None
        assert _parse_date("") is None

    def test_parse_date_non_string_returns_none(self, db_session):
        """_parse_date 对非字符串类型返回 None"""
        from services.stats_service import _parse_date
        assert _parse_date(None) is None
        # 整数等非 str 类型 → TypeError 被捕获 → None
        assert _parse_date(12345678) is None  # type: ignore

    def test_get_summary_start_date_only(self, db_session):
        """start_date 有值但 end_date=None → 仅过滤起始日期"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 3, 1),
        ), user_id=1)

        from services.stats_service import get_summary
        result = get_summary(db_session, user_id=1, vehicle_id=v.id,
                            start_date="2025-02-01")  # 无 end_date
        assert result["record_count"] == 1  # 仅 3 月的记录

    def test_recalculate_non_full_tank_sets_consumption_none(self, db_session):
        """recalculate_consumption: 后继非加满记录 → fuel_consumption = None"""
        v = _make_vehicle(db_session)
        r1 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10500"), fuel_volume=Decimal("5"), fuel_cost=Decimal("40"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        # 修改基线，触发重算
        from services.record_service import recalculate_consumption
        db_session.refresh(r1)
        r1.mileage = Decimal("10100")
        db_session.commit()
        recalculate_consumption(db_session, datetime(2025, 1, 1), user_id=1, vehicle_id=v.id)
        db_session.commit()

        # 非加满记录的 consumption 应为 None
        records = db_session.query(FuelRecord).order_by(FuelRecord.record_date).all()
        assert records[1].fuel_consumption is None

    def test_get_records_note_whitespace_ignored(self, db_session):
        """note 为纯空格时不参与筛选"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="test", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)

        _, total = get_records(db_session, user_id=1, vehicle_id=v.id, note="   ")
        assert total == 1  # 空格被忽略，返回全部


# ══════════════════════════════════════════════════════════════════
# UR-001 边界：首条记录 mileage == initial_mileage / mileage < initial_mileage
# ══════════════════════════════════════════════════════════════════

class TestRecordServiceBoundary:
    def test_first_record_mileage_equals_initial(self, db_session):
        """mileage == initial_mileage → is_baseline=True, fuel_consumption=None（无行驶距离）"""
        v = _make_vehicle(db_session, user_id=1)  # initial_mileage=100
        rec = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("100"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        assert rec.is_baseline is True
        assert rec.fuel_consumption is None

    def test_first_record_mileage_below_initial(self, db_session):
        """mileage < initial_mileage → BadRequestError"""
        v = _make_vehicle(db_session, user_id=1)  # initial_mileage=100
        with pytest.raises(BadRequestError, match="不能低于车辆初始里程"):
            create_record(db_session, FuelRecordCreate(
                mileage=Decimal("50"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
                is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
            ), user_id=1)


# ══════════════════════════════════════════════════════════════════
# UC-001 Create Category
# ══════════════════════════════════════════════════════════════════

class TestExpenseCategoryCreation:
    def test_create_l1_category(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        assert cat.level == 1
        assert cat.parent_id is None
        assert cat.user_id == 1
        assert cat.name == "餐饮"

    def test_create_l2_category(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        assert l2.level == 2
        assert l2.parent_id == l1.id
        assert l2.name == "午餐"

    def test_create_l3_category(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        assert l3.level == 3
        assert l3.parent_id == l2.id

    def test_create_category_parent_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="父分类不存在"):
            create_category(db_session, user_id=1, name="午餐", parent_id=9999)

    def test_create_category_duplicate_name(self, db_session):
        _create_user(db_session, user_id=1)
        create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        with pytest.raises(ConflictError, match="已存在"):
            create_category(db_session, user_id=1, name="餐饮", parent_id=None)

    def test_create_category_level_4_rejected(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        with pytest.raises(BadRequestError, match="最多支持 3 层"):
            create_category(db_session, user_id=1, name="川菜", parent_id=l3.id)


# ══════════════════════════════════════════════════════════════════
# UC-002/UC-003/UC-004 Category tree / rename / delete
# ══════════════════════════════════════════════════════════════════

class TestExpenseCategoryTreeAndUpdate:
    def test_list_categories_tree(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        tree = list_categories(db_session, user_id=1)
        assert len(tree) == 1
        assert tree[0]["name"] == "餐饮"
        assert tree[0]["level"] == 1
        assert len(tree[0]["children"]) == 1
        assert tree[0]["children"][0]["name"] == "午餐"
        assert tree[0]["children"][0]["level"] == 2
        assert len(tree[0]["children"][0]["children"]) == 1
        assert tree[0]["children"][0]["children"][0]["name"] == "外卖"
        assert tree[0]["children"][0]["children"][0]["level"] == 3

    def test_update_category_name(self, db_session):
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        updated = update_category(db_session, cat.id, user_id=1, name="食品")
        assert updated.name == "食品"

    def test_delete_category_with_children(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        with pytest.raises(BadRequestError, match="请先删除子分类"):
            delete_category(db_session, l1.id, user_id=1)

    def test_delete_category_with_expenses(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        with pytest.raises(BadRequestError, match="无法删除"):
            delete_category(db_session, l3.id, user_id=1)


# ══════════════════════════════════════════════════════════════════
# UE-001/UE-002/UE-003/UE-004/UE-005 Expense Service
# ══════════════════════════════════════════════════════════════════

class TestExpenseServiceFull:
    def test_validate_category_chain_valid(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        # 合法链应无异常
        _validate_category_chain(db_session, 1, "餐饮", "午餐", "外卖")

    def test_create_expense_success(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=datetime(2025, 7, 15, 14, 30),
        ))
        assert exp.amount == Decimal("35.5")
        assert exp.category_l1 == "餐饮"
        assert exp.category_l2 == "午餐"
        assert exp.category_l3 == "外卖"
        # expense_date 为 DateTime，时分必须被保留
        assert exp.expense_date == datetime(2025, 7, 15, 14, 30)
        assert exp.user_id == 1

    def test_create_expense_amount_zero_rejected(self, db_session):
        """amount=0 → Pydantic ValidationError (gt=0)"""
        _create_user(db_session, user_id=1)
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ExpenseCreate(
                amount=Decimal("0"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
                expense_date=date(2025, 7, 15),
            )

    def test_create_expense_amount_negative_rejected(self, db_session):
        """amount < 0 → Pydantic ValidationError (gt=0)"""
        _create_user(db_session, user_id=1)
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ExpenseCreate(
                amount=Decimal("-5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
                expense_date=date(2025, 7, 15),
            )

    def test_get_expenses_pagination(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        # 创建 3 条记录
        for i in range(3):
            create_expense(db_session, 1, ExpenseCreate(
                amount=Decimal("10"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
                expense_date=date(2025, 7, i + 1),
            ))

        items, total = get_expenses(db_session, user_id=1, page=1, page_size=2)
        assert total == 3
        assert len(items) == 2

        items2, _ = get_expenses(db_session, user_id=1, page=2, page_size=2)
        assert len(items2) == 1

    def test_update_expense_amount(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        updated = update_expense(db_session, exp.id, 1, ExpenseUpdate(amount=Decimal("50")))
        assert updated.amount == Decimal("50")

    def test_update_expense_note(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15), note="original",
        ))
        updated = update_expense(db_session, exp.id, 1, ExpenseUpdate(note="updated note"))
        assert updated.note == "updated note"

    def test_delete_expense_success(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        delete_expense(db_session, exp.id, user_id=1)
        with pytest.raises(NotFoundError, match="支出记录不存在"):
            get_expense_by_id(db_session, exp.id, user_id=1)

    def test_delete_expense_not_found(self, db_session):
        _create_user(db_session, user_id=1)
        with pytest.raises(NotFoundError, match="支出记录不存在"):
            delete_expense(db_session, 9999, user_id=1)


# ══════════════════════════════════════════════════════════════════
# US-201/US-202 Expense Stats Service
# ══════════════════════════════════════════════════════════════════

class TestExpenseStatsServiceFull:
    def test_stats_category_breakdown_with_data(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("35.5"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="none")
        assert result.group_by == "none"
        assert result.total_amount == Decimal("35.5")
        assert result.record_count == 1
        # ROLLUP 返回 L1+L2+L3 / L1+L2 / L1 / grand total 四层
        assert len(result.category_breakdown) == 4

    def test_stats_category_breakdown_empty(self, db_session):
        _create_user(db_session, user_id=1)
        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="none")
        assert result.total_amount == 0
        assert result.record_count == 0
        assert result.category_breakdown == []

    def test_stats_monthly_grouping(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("200"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 20),
        ))

        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 7, 1), end_date=date(2025, 7, 31),
                          group_by="month")
        assert result.group_by == "month"
        assert len(result.items) == 1
        assert result.items[0].period == "2025-07"
        assert result.items[0].total == Decimal("300")
        assert result.items[0].count == 2

    def test_stats_cross_month_grouping(self, db_session):
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 1, 15),
        ))
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("200"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 3, 10),
        ))

        result = get_stats(db_session, user_id=1,
                          start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
                          group_by="month")
        assert result.group_by == "month"
        assert len(result.items) == 2
        assert result.items[0].period == "2025-01"
        assert result.items[0].total == Decimal("100")
        assert result.items[1].period == "2025-03"
        assert result.items[1].total == Decimal("200")


# ══════════════════════════════════════════════════════════════════
# 车辆服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestVehicleServiceGaps:
    def test_update_vehicle_initial_mileage(self, db_session):
        """更新车辆 initial_mileage 不影响已有记录的 fuel_consumption"""
        v = _make_vehicle(db_session, user_id=1)  # initial_mileage=100
        r = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        orig_consumption = r.fuel_consumption

        # 直接修改 DB 中车辆 initial_mileage（VehicleUpdate schema 不支持此字段）
        v.initial_mileage = Decimal("1000.0")
        db_session.commit()

        # 记录油耗不受影响
        db_session.refresh(r)
        assert r.fuel_consumption == orig_consumption

    def test_update_vehicle_is_active_switch(self, db_session):
        """切换车辆 is_active 状态，get_vehicles 仍返回（非活跃排后面）"""
        v = _make_vehicle(db_session, user_id=1)
        assert v.is_active is True

        updated = update_vehicle(db_session, v.id, VehicleUpdate(is_active=False), user_id=1)
        assert updated.is_active is False

        vehicles = get_vehicles(db_session, user_id=1)
        assert len(vehicles) == 1
        assert vehicles[0].is_active is False

    def test_update_vehicle_empty_payload(self, db_session):
        """VehicleUpdate() 无字段时不影响车辆"""
        v = _make_vehicle(db_session, user_id=1)
        updated = update_vehicle(db_session, v.id, VehicleUpdate(), user_id=1)
        assert updated.name == v.name
        assert updated.is_active == v.is_active


# ══════════════════════════════════════════════════════════════════
# 加油记录服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestRecordServiceGaps:
    def test_create_record_fuel_volume_zero_raises(self, db_session):
        """fuel_volume <= 0 → BadRequestError（服务层防御性检查）"""
        v = _make_vehicle(db_session, user_id=1)
        # 绕过 Pydantic gt=0 校验直接构造对象
        data = FuelRecordCreate.model_construct(
            vehicle_id=v.id, mileage=Decimal("10000"), fuel_volume=Decimal("0.0"),
            fuel_cost=Decimal("120"), is_full_tank=True, note="",
            record_date=datetime(2025, 1, 1),
        )
        with pytest.raises(BadRequestError, match="大于 0"):
            create_record(db_session, data, user_id=1)

    def test_update_record_date_triggers_recalc_correctly(self, db_session):
        """修改记录触发级联重算：只改 note 也走 recalculate"""
        v = _make_vehicle(db_session)
        # 基线记录
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        # 第二条记录
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        orig_consumption = r2.fuel_consumption
        assert orig_consumption is not None

        # 修改 r1 的 note 触发 recalc（不影响里程/日期）
        recs, _ = get_records(db_session, user_id=1, vehicle_id=v.id)
        r1 = [r for r in recs if float(r.mileage) == 10000][0]
        update_record(db_session, r1.id, FuelRecordUpdate(note="changed"), user_id=1)

        # r2 油耗保持原值
        db_session.refresh(r2)
        assert r2.fuel_consumption == orig_consumption

    def test_update_record_record_date(self, db_session):
        """编辑加油记录时可修改记录时间，且时间被持久化"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        updated = update_record(
            db_session, r2.id, FuelRecordUpdate(record_date=datetime(2025, 2, 5, 14, 30)),
            user_id=1,
        )
        assert updated.record_date == datetime(2025, 2, 5, 14, 30)
        # 里程未变，油耗参考仍是上一条加满记录，结果不变
        assert updated.fuel_consumption == r2.fuel_consumption

    def test_update_record_is_full_tank_toggle(self, db_session):
        """非加满→加满：toogle 后应重新计算 fuel_consumption"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        r2 = create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=False, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)
        assert r2.fuel_consumption is None

        updated = update_record(db_session, r2.id, FuelRecordUpdate(is_full_tank=True), user_id=1)
        assert updated.fuel_consumption is not None
        assert float(updated.fuel_consumption) == 5.0

    def test_get_records_sort_order(self, db_session):
        """get_records 按 record_date 降序返回（最新在前）"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 2, 1),
        ), user_id=1)

        recs, _ = get_records(db_session, user_id=1, vehicle_id=v.id)
        assert recs[0].record_date > recs[1].record_date


# ══════════════════════════════════════════════════════════════════
# 统计服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestStatsServiceGaps:
    def test_get_timeline_invalid_group_by(self, db_session):
        """非法 group_by → BadRequestError"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        with pytest.raises(BadRequestError, match="group_by 仅支持"):
            get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="quarter")

    def test_get_timeline_week_without_start_date(self, db_session):
        """group_by="week" 无 start_date 时不崩溃，从首条记录日期起算"""
        v = _make_vehicle(db_session)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10200"), fuel_volume=Decimal("10"), fuel_cost=Decimal("80"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 10),
        ), user_id=1)

        result = get_timeline(db_session, user_id=1, vehicle_id=v.id, group_by="week")
        assert len(result) > 0  # 不应崩溃

    def test_get_summary_other_user_vehicle_returns_empty(self, db_session):
        """查询其他用户的车辆 → 空统计（无权限过滤但数据隔离生效）"""
        _create_user(db_session, user_id=1)
        v = create_vehicle(db_session, VehicleCreate(name="v", initial_mileage=100), user_id=1)
        create_record(db_session, FuelRecordCreate(
            mileage=Decimal("10000"), fuel_volume=Decimal("15"), fuel_cost=Decimal("120"),
            is_full_tank=True, note="", vehicle_id=v.id, record_date=datetime(2025, 1, 1),
        ), user_id=1)
        _create_user(db_session, user_id=2)

        result = get_summary(db_session, user_id=2, vehicle_id=v.id)
        assert result["record_count"] == 0


# ══════════════════════════════════════════════════════════════════
# 支出记录服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestExpenseServiceGaps:
    def test_get_expenses_l2_with_date_filter(self, db_session):
        """按 L2 分类 + 日期范围筛选"""
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)

        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 1),
        ))
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("100"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 8, 1),
        ))

        items, total = get_expenses(db_session, user_id=1,
                                    category_l1="餐饮", category_l2="午餐",
                                    start_date=date(2025, 7, 1), end_date=date(2025, 7, 31))
        assert total == 1

    def test_update_expense_only_l1_change(self, db_session):
        """仅修改 L1 但 L2 不属于新 L1 → BadRequestError"""
        _create_user(db_session, user_id=1)
        l1_food = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1_food.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_category(db_session, user_id=1, name="交通", parent_id=None)

        exp = create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2025, 7, 15),
        ))

        with pytest.raises(BadRequestError, match="不属于一级分类"):
            update_expense(db_session, exp.id, 1, ExpenseUpdate(category_l1="交通"))


# ══════════════════════════════════════════════════════════════════
# 支出分类服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestExpenseCategoryServiceGaps:
    def test_create_category_cross_user_parent_id(self, db_session):
        """用户 B 使用用户 A 的分类 ID 作为 parent_id → NotFoundError"""
        _create_user(db_session, user_id=1)
        cat_a = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        _create_user(db_session, user_id=2)

        with pytest.raises(NotFoundError, match="父分类不存在"):
            create_category(db_session, user_id=2, name="午餐", parent_id=cat_a.id)

    def test_list_categories_empty_tree(self, db_session):
        """无分类用户 → 返回空列表"""
        _create_user(db_session, user_id=1)
        tree = list_categories(db_session, user_id=1)
        assert tree == []

    def test_update_category_sort_order_only(self, db_session):
        """仅修改 sort_order，name 不受影响"""
        _create_user(db_session, user_id=1)
        cat = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        updated = update_category(db_session, cat.id, user_id=1, sort_order=10)
        assert updated.sort_order == 10
        assert updated.name == "餐饮"


# ══════════════════════════════════════════════════════════════════
# 支出统计服务补充测试
# ══════════════════════════════════════════════════════════════════

class TestExpenseStatsServiceGaps:
    def test_get_stats_start_date_after_end_date_returns_zero(self, db_session):
        """start_date > end_date → 空结果不报错"""
        _create_user(db_session, user_id=1)
        l1 = create_category(db_session, user_id=1, name="餐饮", parent_id=None)
        l2 = create_category(db_session, user_id=1, name="午餐", parent_id=l1.id)
        l3 = create_category(db_session, user_id=1, name="外卖", parent_id=l2.id)
        create_expense(db_session, 1, ExpenseCreate(
            amount=Decimal("50"), category_l1="餐饮", category_l2="午餐", category_l3="外卖",
            expense_date=date(2026, 7, 15),
        ))

        result = get_stats(db_session, user_id=1,
                           start_date=date(2026, 7, 31), end_date=date(2026, 7, 1),
                           group_by="none")
        assert result.record_count == 0
        assert result.total_amount == Decimal("0")
