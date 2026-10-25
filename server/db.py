import asyncpg
from auth import hash_password
from config import AUTH_PASSWORD, AUTH_USERNAME, DATABASE_URL

# 连接池（应用 lifespan 中初始化）
pool: asyncpg.Pool | None = None


async def init() -> None:
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        # 工单：自定义字段存 fields JSONB；title/priority/status 冗余成列，列表筛选排序直接走列
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id BIGSERIAL PRIMARY KEY,
                ticket_no TEXT NOT NULL UNIQUE,
                ticket_type TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL,
                priority TEXT,
                creator_id INTEGER NOT NULL REFERENCES users(id),
                assignee_id INTEGER REFERENCES users(id),
                fields JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        # 流转事件（状态机时间线，含创建事件）；extra 存流转附加表单值（note/solution）
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ticket_events (
                id BIGSERIAL PRIMARY KEY,
                ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                action TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT NOT NULL,
                operator_id INTEGER REFERENCES users(id),
                extra JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        # 用户角色映射：演示多角色切换，一个用户一个当前角色
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL
            )
        """)
        # 消息中心：工单流转时投递通知，read 标记已读
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)

        # 内置账号：首次启动 seed，已存在则跳过（不覆盖用户改过的密码）
        await conn.execute(
            "INSERT INTO users (username, password_hash) VALUES ($1, $2)"
            " ON CONFLICT (username) DO NOTHING",
            AUTH_USERNAME,
            hash_password(AUTH_PASSWORD),
        )
        # 内置账号默认角色 admin；其余用户缺省 user（get_user_role 兜底）
        admin_id = await conn.fetchval(
            "SELECT id FROM users WHERE username = $1", AUTH_USERNAME
        )
        if admin_id is not None:
            await conn.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')"
                " ON CONFLICT (user_id) DO NOTHING",
                admin_id,
            )


async def close() -> None:
    if pool:
        await pool.close()


async def get_user_by_username(username: str) -> dict | None:
    assert pool is not None, "数据库连接池未初始化"
    row = await pool.fetchrow(
        "SELECT id, username, password_hash FROM users WHERE username = $1", username
    )
    return dict(row) if row else None