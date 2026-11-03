"""App 版本通道测试：/api/v1/app/version 与 /api/v1/app/apk

覆盖点：
1. 空表 → 404
2. 有记录 → 返回 version_code 最大的一条，且 apk_url 指向自家下载端点
3. 多条记录 → 按 version_code 取最大（同 code 时取 id 更大者）
4. APK 代理：上游不可用 → 502（且不能返回 200 + 空/截断文件）
"""

import httpx
import pytest

from models.app_version import AppVersion


def test_version_empty_returns_404(client, db_session):
    db_session.query(AppVersion).delete()
    db_session.flush()

    resp = client.get("/api/v1/app/version")
    assert resp.status_code == 404


def test_version_returns_latest_and_own_apk_path(client, db_session):
    db_session.query(AppVersion).delete()
    db_session.add(
        AppVersion(
            version_code=10108,
            version_name="1.1.8",
            apk_url="https://example.supabase.co/storage/v1/object/public/apk/fuel_records.apk",
            release_notes="测试说明",
        )
    )
    db_session.flush()

    resp = client.get("/api/v1/app/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_code"] == 10108
    assert data["version_name"] == "1.1.8"
    assert data["release_notes"] == "测试说明"
    # 关键：apk_url 必须是相对路径，让下载也走自家域名
    assert data["apk_url"] == "/api/v1/app/apk"


def test_version_picks_max_code(client, db_session):
    db_session.query(AppVersion).delete()
    db_session.add_all(
        [
            AppVersion(version_code=10107, version_name="1.1.7", apk_url="x"),
            AppVersion(version_code=10109, version_name="1.1.9", apk_url="y"),
            AppVersion(version_code=10108, version_name="1.1.8", apk_url="z"),
        ]
    )
    db_session.flush()

    data = client.get("/api/v1/app/version").json()
    assert data["version_code"] == 10109
    assert data["version_name"] == "1.1.9"


def test_apk_proxy_upstream_failure_returns_502(client, monkeypatch):
    """上游不可用时必须 502，绝不能返回 200 后给个断掉的流"""
    from config import settings

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")

    class BoomClient:
        """只替换 routers.app 里用的客户端，不能动 httpx.Client 本身
        （TestClient 也是 httpx.Client，一起 patch 会把测试请求自己打挂）"""

        def __init__(self, *args, **kwargs):
            pass

        def build_request(self, *args, **kwargs):
            return None

        def send(self, *args, **kwargs):
            raise httpx.ConnectError("connection reset")

        def close(self):
            pass

    monkeypatch.setattr("routers.app.HttpClient", BoomClient)

    resp = client.get("/api/v1/app/apk")
    assert resp.status_code == 502


def test_apk_proxy_missing_supabase_url_returns_500(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    resp = client.get("/api/v1/app/apk")
    assert resp.status_code == 500
