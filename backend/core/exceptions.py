"""业务异常：Service 层使用，Router 层转换为 HTTPException"""


class BusinessError(Exception):
    """业务逻辑异常基类。Router 层统一 catch → HTTPException"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFoundError(BusinessError):
    """资源不存在 → 404"""


class ConflictError(BusinessError):
    """数据冲突（重复名称等）→ 409"""


class BadRequestError(BusinessError):
    """请求参数不合法 → 400"""


class ForbiddenError(BusinessError):
    """无权访问 → 403"""


# ── 异常 → HTTP 状态码映射 ──

_STATUS_MAP: dict[type, int] = {}
for _cls, _code in [
    (NotFoundError, 404),
    (ConflictError, 409),
    (BadRequestError, 400),
    (ForbiddenError, 403),
]:
    _STATUS_MAP[_cls] = _code


def to_http_status(exc: BusinessError) -> int:
    """业务异常 → HTTP 状态码。遍历映射表按继承链匹配。"""
    for cls, code in _STATUS_MAP.items():
        if isinstance(exc, cls):
            return code
    return 400
