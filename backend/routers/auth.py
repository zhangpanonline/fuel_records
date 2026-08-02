"""用户认证 API 路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas.auth import UserRegister, UserLogin, TokenResponse, UserResponse
from services.auth_service import register_user, login_user
from models.user import User
from core.deps import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["用户认证"])


@router.post("/register", response_model=TokenResponse)
def api_register(
    data: UserRegister,
    db: Session = Depends(get_db),
):
    """注册新用户，成功后直接返回 JWT token"""
    try:
        result = register_user(db=db, data=data)
        return TokenResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
def api_login(
    data: UserLogin,
    db: Session = Depends(get_db),
):
    """用户登录，验证成功后返回 JWT token"""
    try:
        result = login_user(db=db, data=data)
        return TokenResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me", response_model=UserResponse)
def api_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user
