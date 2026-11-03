"""App 版本 ORM 模型

app_versions 表由发版脚本 scripts/upload-apk.js 写入（SDK/REST 方式），
后端只读取，用于给 App 提供"不走 supabase.co 域名"的版本查询通道。

背景：Supabase 域名在国内网络（含部分移动网络）会被重置连接，
App 直连 supabase.co 查版本会静默失败，因此补一条走自家域名的回退通道。
"""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from database import Base


class AppVersion(Base):
    """App 发版记录表"""
    __tablename__ = "app_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version_code = Column(Integer, nullable=False, comment="版本码：MAJOR×10000+MINOR×100+PATCH")
    version_name = Column(String(20), nullable=False, comment="版本名，如 1.1.8")
    apk_url = Column(String(500), nullable=False, comment="APK 下载地址")
    release_notes = Column(String(500), nullable=True, comment="更新说明")
    created_at = Column(DateTime, server_default=func.now(), comment="发版时间")
