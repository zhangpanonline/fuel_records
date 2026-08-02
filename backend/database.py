"""数据库连接：SQLAlchemy engine + session 管理

支持运行时通过 X-Database-Env 请求头切换正式/测试数据库：
  - 正式库：DB_PG_URL（生产 Supabase）
  - 测试库：DB_PG_URL_TEST（测试 Supabase）
  - 未配置测试库时，退化为单一引擎
"""

from pathlib import Path
from sqlalchemy.orm.session import Session

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig

from config import settings
from logger import setup_logger

logger = setup_logger()


# ── 引擎构建工具函数 ───────────────────────────────

def _build_engine_kwargs() -> dict:
    """根据 DB_TYPE 返回 create_engine 的额外参数"""
    kwargs: dict = {"echo": settings.APP_DEBUG}

    if settings.DB_TYPE == "mysql":
        kwargs.update({
            "pool_size": 5,
            "max_overflow": 10,
            "pool_pre_ping": True,
        })
    elif settings.DB_TYPE == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    elif settings.DB_TYPE in ("postgresql", "postgresql_test") and "pooler.supabase.com" in (settings.DB_PG_URL or ""):
        kwargs["connect_args"] = {"options": "-c pgbouncer=true"}

    return kwargs


def _create_engine_for_url(url: str) -> tuple:
    """为指定 URL 创建 engine + SessionLocal，返回 (engine, SessionLocal)"""
    eng = create_engine(url, **_build_engine_kwargs())
    sess = sessionmaker[Session](autocommit=False, autoflush=False, bind=eng)
    return eng, sess


# ── 双引擎 ────────────────────────────────────────

_engine_kwargs = _build_engine_kwargs()

# 正式库引擎（必须）
if settings.DB_PG_URL:
    prod_engine = create_engine(settings.DB_PG_URL, **_engine_kwargs)
else:
    # SQLite / 开发模式：无 PG_URL 时使用 DATABASE_URL 作为正式库
    prod_engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

ProdSessionLocal = sessionmaker[Session](autocommit=False, autoflush=False, bind=prod_engine)

# 测试库引擎（可选）
test_engine = None
TestSessionLocal = None

if settings.DB_PG_URL_TEST:
    test_engine = create_engine(settings.DB_PG_URL_TEST, **_engine_kwargs)
    # 同样处理 Supabase Pooler
    if "pooler.supabase.com" in settings.DB_PG_URL_TEST:
        test_engine = create_engine(
            settings.DB_PG_URL_TEST,
            connect_args={"options": "-c pgbouncer=true"},
            echo=settings.APP_DEBUG,
        )
    TestSessionLocal = sessionmaker[Session](autocommit=False, autoflush=False, bind=test_engine)
    logger.info("双数据库模式：正式库 + 测试库均已就绪")
else:
    logger.info("单数据库模式：仅正式库可用（未配置 DB_PG_URL_TEST）")


# ── ORM 基类 ──────────────────────────────────────

class Base(DeclarativeBase):
    """所有 ORM 模型的基类"""
    pass


# ── 依赖注入：请求级 Session ─────────────────────

def get_db(request: Request):
    """FastAPI 依赖注入：根据 X-Database-Env 请求头返回对应数据库的 session

    - X-Database-Env: test → 使用测试库（如果已配置）
    - 其他/缺失 → 使用正式库
    """
    db_env = request.headers.get("X-Database-Env", "prod")
    if db_env == "test" and TestSessionLocal is not None:
        db = TestSessionLocal()
    else:
        db = ProdSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── 数据库迁移 ────────────────────────────────────

def _run_alembic_upgrade(engine):
    """对指定 engine 运行 Alembic 迁移到最新版本"""
    # 确保模型类被导入，让 Base.metadata 完整
    from models.fuel_record import FuelRecord      # noqa: F401
    from models.user import User                    # noqa: F401
    from models.vehicle import Vehicle              # noqa: F401
    from models.expense import Expense              # noqa: F401
    from models.expense_category import ExpenseCategory  # noqa: F401

    alembic_ini = Path(__file__).resolve().parent / "alembic.ini"
    alembic_cfg = AlembicConfig(str(alembic_ini))
    alembic_cfg.attributes["configure_logger"] = False

    # 将 engine 的 URL 注入 Alembic 配置，覆盖 alembic.ini 中的默认值
    alembic_cfg.set_main_option("sqlalchemy.url", str(engine.url))

    alembic_command.upgrade(alembic_cfg, "head")


def init_db():
    """应用启动时自动对正式库和测试库运行 Alembic 迁移"""
    logger.info("正在运行数据库迁移（正式库）...")
    _run_alembic_upgrade(prod_engine)
    logger.info("正式库迁移完成")

    if test_engine is not None:
        logger.info("正在运行数据库迁移（测试库）...")
        _run_alembic_upgrade(test_engine)
        logger.info("测试库迁移完成")
