"""用户认证 API 路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas.auth import UserRegister, UserLogin, TokenResponse
from services.auth_service import register_user, login_user

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
