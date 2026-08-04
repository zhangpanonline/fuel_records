"""pytest 配置与共享 fixture — 使用线上测试 PostgreSQL"""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config import settings
from database import Base, get_db

# 确保所有模型注册到 Base.metadata
import models.expense  # noqa: F401
import models.expense_category  # noqa: F401
import models.fuel_record  # noqa: F401
import models.user  # noqa: F401
import models.vehicle  # noqa: F401

# ─── Test App（不使用 main.py 的 lifespan，避免 Alembic 迁移）───

TEST_DB_URL = settings.DB_PG_URL_TEST
if not TEST_DB_URL:
    raise RuntimeError("DB_PG_URL_TEST 未配置，请在 .env 中设置测试数据库连接串")

test_engine = create_engine(TEST_DB_URL)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# 表名列表（按外键依赖排序，先删子表再删主表）
TABLE_NAMES = [
    "expenses",
    "expense_categories",
    "fuel_records",
    "vehicles",
    "users",
]

# 模块级创建表结构（TRUNCATE 不删表，无需每次重建）
Base.metadata.create_all(bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """每个测试函数独立的数据库会话，通过 TRUNCATE 清理"""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # 新建会话执行 TRUNCATE，避免使用已关闭的 session
        cleanup_db = TestSessionLocal()
        try:
            for table in TABLE_NAMES:
                cleanup_db.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
            cleanup_db.commit()
        finally:
            cleanup_db.close()


@pytest.fixture(scope="function")
def client(db_session):
    """每个测试函数独立的 TestClient，依赖注入指向测试数据库"""
    from routers.records import router as records_router
    from routers.auth import router as auth_router
    from routers.vehicles import router as vehicles_router
    from routers.stats import router as stats_router
    from routers.expenses import router as expenses_router
    from routers.expense_categories import router as expense_categories_router

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/v1/health")
    def health_check():
        return {"status": "ok", "version": "1.0.0"}

    app.include_router(records_router)
    app.include_router(auth_router)
    app.include_router(vehicles_router)
    app.include_router(stats_router)
    app.include_router(expenses_router)
    app.include_router(expense_categories_router)

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as c:
        yield c


# ─── Auth 工具函数（非 fixture，方便测试中动态创建用户）───

def register_user(client: TestClient, username: str, password: str = "test123") -> dict:
    """注册用户并返回 JWT token"""
    resp = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()


def auth_headers(token: str) -> dict:
    """返回带 Bearer token 的请求头"""
    return {"Authorization": f"Bearer {token}"}
