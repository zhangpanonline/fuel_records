"""核心层单元测试：deps 鉴权 / exceptions 状态码映射"""

import pytest
from fastapi import HTTPException

from core.exceptions import BusinessError, NotFoundError, ForbiddenError, BadRequestError, ConflictError, to_http_status
from models.user import User


class TestToHttpStatus:
    def test_default_status_code(self):
        exc = BusinessError("test")
        assert to_http_status(exc) == 400


class TestGetCurrentUserErrors:
    """测试 get_current_user 中的各种 401 分支"""

    def test_invalid_token(self, monkeypatch, db_session):
        from core.deps import get_current_user
        from core import security as sec_mod

        user = User(id=1, username="zp", hashed_password="x", is_active=True)
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr(sec_mod, "verify_access_token", lambda t: (_ for _ in ()).throw(Exception("bad token")))

        from fastapi.security import HTTPAuthorizationCredentials
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.token")

        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=creds, db=db_session)
        assert exc.value.status_code == 401

    def test_missing_sub_in_token(self, monkeypatch, db_session):
        from core.deps import get_current_user
        from core import security as sec_mod

        monkeypatch.setattr(sec_mod, "verify_access_token", lambda t: {"exp": 9999999999})

        from fastapi.security import HTTPAuthorizationCredentials
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="no.sub.token")

        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=creds, db=db_session)
        assert exc.value.status_code == 401

    def test_user_not_found_after_valid_token(self, monkeypatch, db_session):
        from core.deps import get_current_user
        from core import security as sec_mod

        monkeypatch.setattr(sec_mod, "verify_access_token", lambda t: {"sub": "999"})

        from fastapi.security import HTTPAuthorizationCredentials
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.but.user.deleted")

        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=creds, db=db_session)
        assert exc.value.status_code == 401
