"""数据库连接：SQLAlchemy engine + session 管理"""

from sqlalchemy.orm.session import Session


from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

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


def _migrate_add_column():
    """安全添加列：如果列已存在则跳过"""
    try:
        with engine.connect() as conn:
            # PostgreSQL: ADD COLUMN IF NOT EXISTS
            conn.exec_driver_sql(
                "ALTER TABLE fuel_records ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(id)"
            )
            conn.commit()
            logger.info("迁移检查：vehicle_id 列已就绪")
    except Exception as e:
        # SQLite 不支持 IF NOT EXISTS，用另一种方式
        logger.debug(f"IF NOT EXISTS 方式失败，尝试 SQLite 兼容方式: {e}")
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql(
                    "ALTER TABLE fuel_records ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id)"
                )
                conn.commit()
                logger.info("迁移检查：vehicle_id 列已添加")
        except Exception as e2:
            # 列已存在或表不存在，都是可接受的
            logger.debug(f"迁移跳过（列可能已存在）: {e2}")


def init_db():
    """创建所有表（生产环境应使用 Alembic 迁移，开发阶段自动建表）"""
    # 延迟导入，避免循环依赖，因为 models/fuel_record.py 里会 from database import Base
    # noqa: F401 是给代码检查工具看的，意思是："我知道这个导入看起来没用（F401 警告），但它是故意这样写的，别报警告"。
    from models.fuel_record import FuelRecord  # noqa: F401
    from models.user import User  # noqa: F401
    from models.vehicle import Vehicle  # noqa: F401

    # Base.metadata 是 SQLAlchemy 自动收集的 所有表的元数据 ——每当有类继承 Base ，它就会被自动注册到 Base.metadata 里。
    # create_all() 的意思是： 检查数据库里有没有这些表，没有就自动创建 。
    Base.metadata.create_all(bind=engine)

    # Phase 5 迁移：为已有 fuel_records 表添加 vehicle_id 列（create_all 不改已有表结构）
    _migrate_add_column()

    logger.info("数据库表结构已创建/验证完成")
