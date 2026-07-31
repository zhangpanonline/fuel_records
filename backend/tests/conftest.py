"""pytest 配置与共享 fixture"""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from core.security import generate_access_token, hash_password

# 确保新模型在 Base.metadata 中注册（test fixture 的 create_all 依赖此导入）
import models.expense  # noqa: F401
import models.expense_category  # noqa: F401

# ─── Test App（不用 main.py 的 lifespan，避免 Alembic / 真实库连接）───
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def db_session():
    """每个测试函数独立的 SQLite 内存数据库会话
    StaticPool 确保 :memory: 下所有连接共享同一个数据库"""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


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
