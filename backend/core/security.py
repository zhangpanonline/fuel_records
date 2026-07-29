"""安全工具：密码哈希 + JWT"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from config import settings


# ─── 密码哈希 ──────────────────────────────────────────


def hash_password(password: str) -> str:
    """将明文密码哈希后返回 bcrypt 哈希串（自动加盐）

    参数：
    - password: 用户注册时输入的明文密码

    返回：bcrypt 格式的哈希串。salt 自动生成并嵌入哈希串中，不需要手动管理。
    """
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码是否匹配已存储的哈希串

    参数：
    - plain_password: 用户登录时输入的明文密码
    - hashed_password: 数据库中存储的 bcrypt 哈希串

    返回：密码匹配 → True，不匹配 → False

    bcrypt 的盐是嵌入在哈希串里的，
    checkpw 会自动从 hashed_password 中提取盐来验证。
    """
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


# ─── JWT ──────────────────────────────────────────────


def generate_access_token(user_id: int) -> str:
    """生成 JWT access token

    参数：
    - user_id: 用户 ID，会嵌入到 token 的 payload 中

    返回：JWT 字符串，有效期由 JWT_EXPIRE_MINUTES 配置决定（默认 24 小时）

    生成的 token 结构（解码后）：
    {
        "sub": "1",              # sub = subject（主体），即用户 ID
        "exp": 1234567890,       # exp = expiration，过期时间戳
        "iat": 1234567800,       # iat = issued at，签发时间
        "type": "access"         # token 类型标记
    }
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),                            # 谁
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),  # 什么时候过期
        "iat": now,                                      # 什么时候签发的
        "type": "access",                                # 类型标记
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_access_token(token: str) -> dict:
    """验证 JWT access token 并返回 payload

    参数：
    - token: JWT 字符串

    返回：token 的 payload（dict 类型），包含 sub、exp、iat、type 等字段

    可能抛出：
    - jwt.ExpiredSignatureError: token 已过期
    - jwt.InvalidTokenError: token 无效（篡改、格式错误等）
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])