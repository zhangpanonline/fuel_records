"""数据库连接：SQLAlchemy engine + session 管理"""

from pathlib import Path
from sqlalchemy.orm.session import Session


from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig

from config import settings
from logger import setup_logger

logger = setup_logger()

# engine_kwargs 是一个字典，用来存所有要传给 create_engine 的额外参数
engine_kwargs = {"echo": settings.APP_DEBUG}

if settings.DB_TYPE == "mysql":
    engine_kwargs.update({
        # 连接池 ：数据库连接是有限的。如果每次请求都创建新连接、用完关闭，频繁重复这个过程很慢。连接池就是 维护一批"随时可用"的连接 ，用完了不关闭，放回去下次再用，节省开销。
        "pool_size": 5,        # 连接池里保持 5 个连接
        "max_overflow": 10,    # 高峰期最多再多创建 10 个
        "pool_pre_ping": True, # 每次用连接前先测试是否还活着
    })
elif settings.DB_TYPE == "sqlite":
    # SQLite 默认只允许创建它的那个线程访问。但 FastAPI 是 多线程 处理请求的，所以要加这个参数告诉 SQLite："允许多个线程访问这个数据库文件"。
    engine_kwargs["connect_args"] = {"check_same_thread": False}
# PostgreSQL 不需要额外参数

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# sessionmaker 是一个 工厂函数 ——你可以把它想象成一个"会话生成器"。sessionmaker 是一个 工厂函数 ——你可以把它想象成一个"会话生成器"。
# autocommit=False 不自动提交——我们手动控制什么时候提交（后面写 API 时会看到）
# autoflush=False 不自动刷新数据——我们手动控制什么时候刷新（后面写 API 时会看到）
# bind=engine 绑定到 engine，确保 sessionmaker 用的是这个 engine
SessionLocal = sessionmaker[Session](autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类"""
    pass


# - 创建 session
# - 交给调用的地方用
# - 无论结果如何，最后都关掉 session
def get_db():
    """FastAPI 依赖注入：获取数据库 session，请求结束后自动关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """应用启动时自动运行 Alembic 迁移到最新版本"""
    # 确保模型类被导入，让 Base.metadata 完整（env.py 中 autogenerate 依赖此导入）
    from models.fuel_record import FuelRecord  # noqa: F401
    from models.user import User  # noqa: F401
    from models.vehicle import Vehicle  # noqa: F401

    # 定位 alembic.ini 配置文件（backend/ 目录下）
    alembic_ini = Path(__file__).resolve().parent / "alembic.ini"
    alembic_cfg = AlembicConfig(str(alembic_ini))
    # 禁止 alembic 自身的 logging 配置覆盖项目 loguru 日志
    alembic_cfg.attributes["configure_logger"] = False

    # 运行迁移到最新版本（alembic upgrade head）
    # 每个 migration 脚本记录了"当前状态 → 下一个状态"的变更
    alembic_command.upgrade(alembic_cfg, "head")

    logger.info("数据库迁移已完成（Alembic upgrade head）")
