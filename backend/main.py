"""入口文件：FastAPI 应用初始化"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from logger import setup_logger

logger = setup_logger()


#@asynccontextmanager 让下面的函数变成一个 异步上下文管理器 ，可以在 yield 前后分别执行启动和关闭的逻辑
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库表"""
    logger.info("应用启动中...")
    init_db()
    logger.info("应用启动完成")
    yield
    logger.info("应用关闭")


app = FastAPI(
    title="Fuel Records API",
    description="摩托车油耗记录系统后端 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置（允许 Flutter 跨域请求）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发阶段全放通，生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 健康检查 ────────────────────────────────────────────
@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
    }


# ─── 路由注册 ────────────────────────────────────────────
from routers.records import router as records_router
from routers.auth import router as auth_router
app.include_router(records_router)
app.include_router(auth_router)


if __name__ == "__main__":
    import uvicorn
    # uvicorn 是一个 ASGI 服务器——它的工作就是 启动一个 HTTP 服务器 ，监听端口，把收到的请求转发给 FastAPI 处理。
    # Uvicorn（ASGI 服务器） 负责的是 通信协议层面 的事情，而 FastAPI 负责的是 业务逻辑层面 的事情。
    uvicorn.run(
        "main:app",
        host=settings.APP_HOST,  # 监听所有 IP 地址
        port=settings.APP_PORT,  # 监听端口
        reload=settings.APP_DEBUG,  # 开发阶段开启热重载
    )
