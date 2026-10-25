"""工单 / 流转事件 / 角色 / 消息中心 / 看板 的数据库访问层。

全部走 asyncpg 连接池（db.pool），JSONB 列统一手动 json.loads（asyncpg 默认返回 str）。
"""

from __future__ import annotations

import json
from typing import Any

import db

# 工单号前缀：类型 key -> 展示前缀（工单号 = 前缀 + 6 位零填充 id）
_TICKET_NO_PREFIX = {"incident": "INC", "inquiry": "INQ"}


def _parse_fields(row: dict | None) -> dict | None:
    """把 tickets 行里的 fields(JSONB) 从 str 解析成 dict，返回处理后的 dict 副本。"""
    if row is None:
        return None
    data = dict(row)
    fields = data.get("fields")
    if isinstance(fields, str):
        data["fields"] = json.loads(fields)
    return data


# ---- 角色 ----


async def get_username(user_id: int) -> str | None:
    row = await db.pool.fetchrow("SELECT username FROM users WHERE id = $1", user_id)
    return row["username"] if row else None


async def get_user_role(user_id: int) -> str:
    """当前用户角色（无映射时兜底 user）。"""
    row = await db.pool.fetchrow(
        "SELECT role FROM user_roles WHERE user_id = $1", user_id
    )
    return row["role"] if row else "user"


async def set_user_role(user_id: int, role: str) -> None:
    await db.pool.execute(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, $2)"
        " ON CONFLICT (user_id) DO UPDATE SET role = $2",
        user_id,
        role,
    )


# ---- 工单 ----


async def create_ticket(
    user_id: int,
    ticket_type: str,
    title: str,
    priority: str | None,
    fields: dict[str, Any],
) -> dict:
    """创建工单：先插占位工单号取 id，再回填正式工单号（前缀 + 6 位零填充 id）。"""
    prefix = _TICKET_NO_PREFIX.get(ticket_type, "TKT")
    row = await db.pool.fetchrow(
        "INSERT INTO tickets (ticket_no, ticket_type, status, title, priority, creator_id, fields)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)"
        " RETURNING id, ticket_no, ticket_type, status, title, priority, creator_id, fields, created_at, updated_at",
        f"{prefix}-TMP",
        ticket_type,
        "open",
        title,
        priority,
        user_id,
        json.dumps(fields, ensure_ascii=False),
    )
    ticket_no = f"{prefix}-{row['id']:06d}"
    await db.pool.execute(
        "UPDATE tickets SET ticket_no = $2 WHERE id = $1", row["id"], ticket_no
    )
    data = _parse_fields(row)
    data["ticket_no"] = ticket_no
    return data


async def list_tickets(
    *,
    user_id: int,
    role: str,
    status: str | None = None,
    ticket_type: str | None = None,
    priority: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[int, list[dict]]:
    """工单列表（筛选 + 分页）。user 角色只能看自己创建的工单，其余角色看全部。

    返回 (匹配总数, 当前页行)。
    """
    where: list[str] = []
    args: list[Any] = []

    # 字段级/数据级权限：普通用户仅见自己的工单
    if role == "user":
        where.append("creator_id = $" + str(len(args) + 1))
        args.append(user_id)
    if status:
        where.append("status = $" + str(len(args) + 1))
        args.append(status)
    if ticket_type:
        where.append("ticket_type = $" + str(len(args) + 1))
        args.append(ticket_type)
    if priority:
        where.append("priority = $" + str(len(args) + 1))
        args.append(priority)
    if keyword:
        where.append("title ILIKE $" + str(len(args) + 1))
        args.append(f"%{keyword}%")

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = await db.pool.fetchval(
        f"SELECT count(*) FROM tickets{clause}", *args
    )
    rows = await db.pool.fetch(
        f"""SELECT id, ticket_no, ticket_type, status, title, priority, creator_id, assignee_id,
                   fields, created_at, updated_at
            FROM tickets{clause}
            ORDER BY updated_at DESC
            LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}""",
        *args,
        limit,
        offset,
    )
    return total, [_parse_fields(dict(r)) for r in rows]


async def get_ticket(ticket_id: int) -> dict | None:
    row = await db.pool.fetchrow(
        "SELECT id, ticket_no, ticket_type, status, title, priority, creator_id, assignee_id,"
        " fields, created_at, updated_at FROM tickets WHERE id = $1",
        ticket_id,
    )
    return _parse_fields(dict(row)) if row else None


async def list_events(ticket_id: int) -> list[dict]:
    rows = await db.pool.fetch(
        "SELECT id, ticket_id, action, from_status, to_status, operator_id, extra, created_at"
        " FROM ticket_events WHERE ticket_id = $1 ORDER BY id ASC",
        ticket_id,
    )
    out = []
    for r in rows:
        d = dict(r)
        extra = d.get("extra")
        if isinstance(extra, str):
            d["extra"] = json.loads(extra)
        out.append(d)
    return out


async def record_event(
    ticket_id: int,
    action: str,
    from_status: str | None,
    to_status: str,
    operator_id: int,
    extra: dict[str, Any] | None = None,
) -> None:
    await db.pool.execute(
        "INSERT INTO ticket_events (ticket_id, action, from_status, to_status, operator_id, extra)"
        " VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
        ticket_id,
        action,
        from_status,
        to_status,
        operator_id,
        json.dumps(extra or {}, ensure_ascii=False),
    )


async def transition_ticket(
    ticket_id: int,
    from_status: str,
    to_status: str,
    action: str,
    operator_id: int,
    extra: dict[str, Any] | None = None,
) -> bool:
    """原子流转：乐观锁（WHERE status = from_status）防并发重复流转。

    返回是否成功；失败 = 状态已被他人抢先修改，调用方需回读重试。
    """
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "UPDATE tickets SET status = $2, updated_at = now() WHERE id = $1 AND status = $3",
                ticket_id,
                to_status,
                from_status,
            )
            updated = int(result.split()[-1]) if result else 0
            if updated == 0:
                return False
            await conn.execute(
                "INSERT INTO ticket_events (ticket_id, action, from_status, to_status, operator_id, extra)"
                " VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
                ticket_id,
                action,
                from_status,
                to_status,
                operator_id,
                json.dumps(extra or {}, ensure_ascii=False),
            )
    return True


async def seed_tickets(n: int, creator_id: int) -> int:
    """批量造 N 条演示工单（万级虚拟滚动 / 看板数据来源），返回插入条数。

    只插入 incident 类型，标题带序号，状态按序号轮转，保证看板各状态都有分布。
    """
    statuses = ["open", "processing", "resolved", "closed"]
    priorities = ["P0", "P1", "P2", "P3"]
    rows = []
    for i in range(n):
        rows.append(
            (
                f"INC-SEED-{i:06d}",
                "incident",
                statuses[i % len(statuses)],
                f"演示故障工单 #{i}",
                priorities[i % len(priorities)],
                creator_id,
                json.dumps(
                    {"detail": f"第 {i} 条演示数据", "customer_phone": f"138{i:08d}"[:11]},
                    ensure_ascii=False,
                ),
            )
        )
    await db.pool.executemany(
        "INSERT INTO tickets (ticket_no, ticket_type, status, title, priority, creator_id, fields)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
        rows,
    )
    return n


# ---- 消息中心 ----


async def add_notification(
    user_id: int, ticket_id: int | None, kind: str, title: str, content: str
) -> dict:
    row = await db.pool.fetchrow(
        "INSERT INTO notifications (user_id, ticket_id, kind, title, content)"
        " VALUES ($1, $2, $3, $4, $5)"
        " RETURNING id, ticket_id, kind, title, content, read, created_at",
        user_id,
        ticket_id,
        kind,
        title,
        content,
    )
    return dict(row)


async def list_notifications_after(user_id: int, after_id: int) -> list[dict]:
    """断线重连补发：after_id 之后的通知（id 单调递增，天然有序）。"""
    rows = await db.pool.fetch(
        "SELECT id, ticket_id, kind, title, content, read, created_at"
        " FROM notifications WHERE user_id = $1 AND id > $2 ORDER BY id ASC",
        user_id,
        after_id,
    )
    return [dict(r) for r in rows]


async def list_notifications(user_id: int, limit: int = 50) -> list[dict]:
    rows = await db.pool.fetch(
        "SELECT id, ticket_id, kind, title, content, read, created_at"
        " FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2",
        user_id,
        limit,
    )
    return [dict(r) for r in rows]


async def unread_count(user_id: int) -> int:
    return await db.pool.fetchval(
        "SELECT count(*) FROM notifications WHERE user_id = $1 AND read = FALSE", user_id
    )


async def mark_read(user_id: int, ids: list[int]) -> None:
    await db.pool.execute(
        "UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2)",
        user_id,
        ids,
    )


async def mark_all_read(user_id: int) -> None:
    await db.pool.execute(
        "UPDATE notifications SET read = TRUE WHERE user_id = $1", user_id
    )


# ---- 看板 ----


async def dashboard_stats() -> dict[str, Any]:
    """运营看板聚合：总览 + 状态分布 + 类型分布 + 优先级分布 + 近 14 天创建趋势。"""
    total = await db.pool.fetchval("SELECT count(*) FROM tickets")

    async def _rows(sql: str) -> list[dict]:
        rows = await db.pool.fetch(sql)
        return [dict(r) for r in rows]

    status_dist = await _rows("SELECT status AS key, count(*) AS value FROM tickets GROUP BY status ORDER BY value DESC")
    type_dist = await _rows("SELECT ticket_type AS key, count(*) AS value FROM tickets GROUP BY ticket_type ORDER BY value DESC")
    priority_dist = await _rows("SELECT priority AS key, count(*) AS value FROM tickets GROUP BY priority ORDER BY value DESC")
    trend = await _rows(
        "SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD') AS day,"
        " count(*) AS value FROM tickets"
        " WHERE created_at >= now() - interval '14 days'"
        " GROUP BY day ORDER BY day"
    )
    return {
        "total": total,
        "status": status_dist,
        "type": type_dist,
        "priority": priority_dist,
        "trend": trend,
    }