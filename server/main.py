from contextlib import asynccontextmanager

import db
import ticket_routes
from auth import (
    clear_session_cookie,
    create_token,
    set_session_cookie,
    verify_password,
)
from fastapi import FastAPI, HTTPException, Response
from schemas import LoginRequest


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.init()
    yield
    await db.close()


app = FastAPI(lifespan=lifespan)
app.include_router(ticket_routes.router)


# 安全响应头：nosniff 防 MIME 嗅探、DENY 防点击劫持、Referrer 收敛防信息泄漏
# CSP 对纯 API 响应收紧为 default-src 'none'（前端文档的安全头由 nginx 配置）
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'"
    )
    return response


@app.post("/login")
async def login(body: LoginRequest, response: Response):
    user = await db.get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    # token 写入 HttpOnly cookie，响应体不再返回 token
    set_session_cookie(response, create_token(user["id"]))
    return {"username": user["username"]}


@app.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}