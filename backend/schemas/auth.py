"""用户认证 Pydantic Schema"""

from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    """注册请求体"""
    username: str = Field(..., min_length=2, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, max_length=128, description="密码")


class UserLogin(BaseModel):
    """登录请求体"""
    username: str = Field(..., min_length=1, description="用户名")
    password: str = Field(..., min_length=1, description="密码")


class TokenResponse(BaseModel):
    """认证成功响应体"""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """用户信息响应体"""
    id: int
    username: str
    email: str | None = None
    is_active: bool

    class Config:
        from_attributes = True
