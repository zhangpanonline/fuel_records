"""App 版本 Pydantic Schema"""

from datetime import datetime
from pydantic import BaseModel


class AppVersionResponse(BaseModel):
    """最新版本响应体

    apk_url 返回相对路径（/api/v1/app/apk），由前端拼自己的 API 基址，
    这样 APK 下载也走自家域名，不依赖 supabase.co 是否可达。
    """
    version_code: int
    version_name: str
    release_notes: str | None = None
    apk_url: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True
