"""配置管理：从 .env 文件读取所有环境变量"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库类型: sqlite | postgresql | mysql
    # - sqlite:     本地开发，无需安装数据库
    # - postgresql: Render + Supabase 部署
    # - mysql:      自建服务器/其他部署
    DB_TYPE: str = "sqlite"

    # Supabase / PostgreSQL 配置（DB_TYPE=postgresql 时生效）
    # 从 Supabase 项目 Settings → Database → Connection string 获取完整连接串
    DB_PG_URL: str = ""

    # MySQL 配置（DB_TYPE=mysql 时生效）
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "your_password_here"
    DB_NAME: str = "fuel_records"

    # 服务
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    APP_DEBUG: bool = True

    # 日志
    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str = "logs/fuel_records.log"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 小时

    @property
    def DATABASE_URL(self) -> str:
        """根据 DB_TYPE 返回对应的数据库连接字符串"""
        if self.DB_TYPE == "postgresql":
            return self.DB_PG_URL
        if self.DB_TYPE == "mysql":
            return (
                f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
            )
        # 默认 SQLite，文件存在 backend/ 目录下
        return "sqlite:///./fuel_records.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局单例
settings = Settings()
