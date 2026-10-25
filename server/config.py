import os

import dotenv

dotenv.load_dotenv()

# PostgreSQL 连接串（docker compose 起 db 或本机 Postgres）
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/plagent",
)

# JWT 认证（生产环境务必通过环境变量覆盖默认密钥，HS256 要求密钥 ≥ 32 字节）
JWT_SECRET = os.getenv("JWT_SECRET", "I4MMBFNL3yGRD0JVG0tMNS1Ba3K4Uno151XQmXKIYTBcRVtNKkD7o03BcGs0FU9p")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))

# Cookie 安全属性：https 部署时设 COOKIE_SECURE=true（浏览器只在 https 下携带）
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# 内置账号：首次启动 seed 进 users 表（用户名/密码可用环境变量覆盖）
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "admin123")
