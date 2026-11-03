"""App 版本查询 / APK 下载代理路由

为什么需要这条通道：
    App 原本直接请求 https://<ref>.supabase.co/rest/v1/app_versions 查版本。
    但 supabase.co 在部分网络（家用宽带、部分移动网络）会在 TLS 握手阶段被重置，
    导致版本检测静默失败——用户永远看不到"有新版本"。
    这里提供一条走自家域名的等价通道：后端本身连着同一个 Supabase 数据库，
    版本直接查库，APK 由后端代理回源，整条链路不出现 supabase.co。

接口：
    GET /api/v1/app/version   → 最新版本信息（apk_url 指向本服务的下载端点）
    GET /api/v1/app/apk       → 流式代理 APK 下载
"""

from httpx import Client as HttpClient, Timeout
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.app_version import AppVersion
from schemas.app_version import AppVersionResponse

router = APIRouter(prefix="/api/v1/app", tags=["App 版本"])

# 相对路径：让 APK 下载也经由本服务，避免客户端直连 supabase.co
APK_DOWNLOAD_PATH = "/api/v1/app/apk"

CHUNK_SIZE = 64 * 1024


def _apk_upstream_url(version_code: int | None = None) -> str:
    """APK 在 Supabase Storage 上的公开地址（后端回源用，后端出网不受影响）

    带 version_code 作为 cache key：发版是覆盖同名对象，而 Storage 的 CDN
    各边缘节点失效时间不一致——不加参数会出现"版本表已是新版、下载到的还是旧包"。
    """
    if not settings.SUPABASE_URL:
        raise HTTPException(status_code=500, detail="未配置 SUPABASE_URL")
    url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/apk/fuel_records.apk"
    if version_code is not None:
        url = f"{url}?v={version_code}"
    return url


@router.get("/version", response_model=AppVersionResponse)
def api_latest_version(db: Session = Depends(get_db)):
    """返回当前已发布的最新版本（无需登录）

    取 version_code 最大的一条；一张记录都没有时返回 404。
    """
    row = (
        db.query(AppVersion)
        .order_by(AppVersion.version_code.desc(), AppVersion.id.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="暂无已发布版本")

    return AppVersionResponse(
        version_code=row.version_code,
        version_name=row.version_name,
        release_notes=row.release_notes,
        apk_url=APK_DOWNLOAD_PATH,
        created_at=row.created_at,
    )


@router.get("/apk")
def api_download_apk(db: Session = Depends(get_db)):
    """流式代理下载最新 APK

    先把上游连接建立好并校验状态码，再开始流式返回——
    否则上游失败时客户端会拿到一个 200 + 截断的文件。
    """
    latest = (
        db.query(AppVersion)
        .order_by(AppVersion.version_code.desc(), AppVersion.id.desc())
        .first()
    )
    url = _apk_upstream_url(latest.version_code if latest else None)
    client = HttpClient(timeout=Timeout(30.0, read=120.0), follow_redirects=True)
    try:
        upstream = client.send(client.build_request("GET", url), stream=True)
        upstream.raise_for_status()
    except Exception as e:
        client.close()
        raise HTTPException(status_code=502, detail=f"APK 上游不可用：{e}")

    def cleanup():
        upstream.close()
        client.close()

    return StreamingResponse(
        upstream.iter_bytes(chunk_size=CHUNK_SIZE),
        media_type="application/vnd.android.package-archive",
        headers={
            "Content-Disposition": 'attachment; filename="fuel_records.apk"',
            "Cache-Control": "no-cache",
        },
        background=BackgroundTask(cleanup),
    )
