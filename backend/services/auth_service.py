"""用户认证业务逻辑"""

from sqlalchemy.orm import Session

from models.user import User
from schemas.auth import UserRegister, UserLogin
from core.security import hash_password, verify_password, generate_access_token


def register_user(db: Session, data: UserRegister) -> dict:
    """注册新用户：校验唯一性 → 密码哈希 → 写入数据库 → 返回 JWT

    参数：
    - db: 数据库会话
    - data: 包含 username + password 的 Pydantic 对象

    返回：{"access_token": "...", "token_type": "bearer"}
    """
    # 1. 检查用户名是否已被占用
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise ValueError(f"用户名 '{data.username}' 已被注册")

    # 2. 密码哈希
    hashed = hash_password(data.password)

    # 3. 创建用户
    user = User(
        username=data.username,
        hashed_password=hashed,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 4. 直接签发 token 返回（注册即登录）
    token = generate_access_token(user_id=user.id)
    return {"access_token": token, "token_type": "bearer"}


def login_user(db: Session, data: UserLogin) -> dict:
    """用户登录：验证用户名+密码 → 签发 JWT

    参数：
    - db: 数据库会话
    - data: 包含 username + password 的 Pydantic 对象

    返回：{"access_token": "...", "token_type": "bearer"}
    """
    # 1. 根据用户名找用户
    user = db.query(User).filter(User.username == data.username).first()
    if user is None:
        raise ValueError("用户名或密码错误")

    # 2. 验证密码
    if not verify_password(data.password, user.hashed_password):
        raise ValueError("用户名或密码错误")

    # 3. 签发 token
    token = generate_access_token(user_id=user.id)
    return {"access_token": token, "token_type": "bearer"}
