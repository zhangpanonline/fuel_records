"""FastAPI 依赖注入：从请求中提取当前用户"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from core.security import verify_access_token

# HTTPBearer = 从 Authorization: Bearer <token> 头中提取 token 的 FastAPI 工具
# auto_error=False: 手动处理 401，避免框架默认返回 403
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """从请求的 Authorization 头中提取 JWT，验证后返回当前用户

    流程：
    1. HTTPBearer 自动从请求头中提取 "Bearer xxx" 格式的 token
    2. 验证 JWT 签名 + 过期时间
    3. 从 payload 的 "sub" 取 user_id
    4. 查数据库找到对应的用户
    5. 返回 User ORM 对象（注入到路由函数中）

    如果任何一步失败 → 返回 401 Unauthorized
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证 Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials  # 去掉 "Bearer " 前缀后的纯 token 字符串

    try:
        payload = verify_access_token(token)
    except Exception:
        # jwt.ExpiredSignatureError / jwt.InvalidTokenError 等全部统一返回 401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str: str = payload.get("sub", "")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 中缺少用户标识",
        )

    user = db.get(User, int(user_id_str))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    return user
