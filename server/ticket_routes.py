"""工单系统 API：配置、工单 CRUD、状态流转、RBAC、消息中心 SSE、看板。

权限分层：
- 路由级：端点入口按 has_permission 拒绝（403）
- 数据级：user 角色只能访问自己创建的工单
- 字段级：返回字段经 serialize_ticket_fields 脱敏
- 状态层：流转经 ticketing.check_action 拦截（非法操作后端必达，前端按钮只是遮罩）
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

import ticket_db
import ticketing
from auth import get_current_user_id
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from schemas import (
    RoleSwitchRequest,
    SeedRequest,
    TicketCreateRequest,
    TicketTransitionRequest,
)

router = APIRouter(prefix="/api")

# 消息中心 SSE 心跳间隔（秒）：空闲时下发注释行保活，防网关按静默超时掐断
SSE_HEARTBEAT = 15

# 进程内通知队列：user_id -> 待推送通知（SSE 订阅者在连接期间从此消费实时通知）
NOTIFY_QUEUES: dict[int, asyncio.Queue] = {}


def _require(role: str, permission: str) -> None:
    """路由级权限校验：无权限抛 403。"""
    if not ticketing.has_permission(role, permission):
        raise HTTPException(status_code=403, detail="无权访问该资源")


async def _publish(
    user_id: int, ticket_id: int | None, kind: str, title: str, content: str
) -> None:
    """写库 + 推实时队列：SSE 订阅者立即收到，未订阅者落库待拉取。"""
    notif = await ticket_db.add_notification(user_id, ticket_id, kind, title, content)
    q = NOTIFY_QUEUES.get(user_id)
    if q is not None:
        await q.put(notif)


def _json_bytes(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


@router.get("/me")
async def me(user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    username = await ticket_db.get_username(user_id)
    return {
        "user_id": user_id,
        "username": username,
        "role": role,
        # 当前角色拥有的权限点列表，前端据此做路由/按钮级判断
        "permissions": sorted(ticketing.PERMISSIONS.get(role, set())),
    }


@router.post("/me/role")
async def switch_role(body: RoleSwitchRequest, user_id: int = Depends(get_current_user_id)):
    """多角色切换（演示用）：实时切换当前用户角色。"""
    if body.role not in ticketing.ROLES:
        raise HTTPException(status_code=400, detail="未知角色")
    await ticket_db.set_user_role(user_id, body.role)
    return {"role": body.role, "permissions": sorted(ticketing.PERMISSIONS[body.role])}


@router.get("/ticket-config")
async def ticket_config(user_id: int = Depends(get_current_user_id)):
    """前端渲染状态机 / 动态表单 / 权限矩阵所需的全部配置。

    新增工单类型只需在 ticketing.TICKET_TYPES 加配置，前端零改动。
    """
    return {
        "roles": ticketing.ROLES,
        "permissions": ticketing.PERMISSIONS,
        "ticket_types": ticketing.TICKET_TYPES,
    }


# ---- 工单 ----


@router.get("/tickets")
async def list_tickets(
    status: str | None = None,
    ticket_type: str | None = None,
    priority: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "ticket:view")
    total, rows = await ticket_db.list_tickets(
        user_id=user_id,
        role=role,
        status=status,
        ticket_type=ticket_type,
        priority=priority,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return {"total": total, "items": rows}


@router.post("/tickets")
async def create_ticket(
    body: TicketCreateRequest, user_id: int = Depends(get_current_user_id)
):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "ticket:create")
    cfg = ticketing.get_ticket_type(body.ticket_type)
    if cfg is None:
        raise HTTPException(status_code=400, detail="未知工单类型")
    # 动态表单必填校验（服务端兜底，前端只是第一道）
    errors = ticketing.validate_fields(cfg["fields"], body.fields)
    if errors:
        raise HTTPException(status_code=422, detail="；".join(errors))
    ticket = await ticket_db.create_ticket(
        user_id=user_id,
        ticket_type=body.ticket_type,
        title=body.fields.get("title", ""),
        priority=body.fields.get("priority"),
        fields=body.fields,
    )
    await ticket_db.record_event(
        ticket["id"], "create", None, "open", user_id
    )
    return ticket


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: int, user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "ticket:view")
    ticket = await ticket_db.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="工单不存在")
    # 数据级权限：user 只能看自己创建的工单
    if role == "user" and ticket["creator_id"] != user_id:
        raise HTTPException(status_code=404, detail="工单不存在")
    cfg = ticketing.get_ticket_type(ticket["ticket_type"])
    # 字段级权限：敏感字段按角色 + 是否本人脱敏
    ticket["fields"] = ticketing.serialize_ticket_fields(
        cfg["fields"], ticket["fields"], role, ticket["creator_id"] == user_id
    )
    events = await ticket_db.list_events(ticket_id)
    return {
        "ticket": ticket,
        "events": events,
        # 当前状态允许的操作（含角色过滤后的可用动作，前端据此渲染按钮）
        "available_actions": {
            k: v
            for k, v in ticketing.get_available_actions(
                ticket["ticket_type"], ticket["status"]
            ).items()
            if role in v.get("roles", [])
        },
        "flow": cfg["flow"],
        "status_labels": {s: d["label"] for s, d in cfg["states"].items()},
    }


@router.post("/tickets/{ticket_id}/transition")
async def transition_ticket(
    ticket_id: int,
    body: TicketTransitionRequest,
    user_id: int = Depends(get_current_user_id),
):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "ticket:view")
    ticket = await ticket_db.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="工单不存在")
    if role == "user" and ticket["creator_id"] != user_id:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 状态层拦截：动作是否在当前状态允许 + 当前角色是否有权（后端必达，非仅 UI 隐藏）
    try:
        spec = ticketing.check_action(
            ticket["ticket_type"], ticket["status"], body.action, role
        )
    except ticketing.InvalidTransition as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    # 流转附加表单的必填校验（如 close 的 note、resolve 的 solution）
    errors = ticketing.validate_fields(spec.get("form", []), body.extra)
    if errors:
        raise HTTPException(status_code=422, detail="；".join(errors))

    from_status = ticket["status"]
    ok = await ticket_db.transition_ticket(
        ticket_id,
        from_status=from_status,
        to_status=spec["to"],
        action=body.action,
        operator_id=user_id,
        extra=body.extra,
    )
    if not ok:
        # 乐观锁冲突：状态已被并发修改，让前端刷新重试
        raise HTTPException(status_code=409, detail="工单状态已变化，请刷新重试")

    # 流转通知：通知提单人（本人操作则不重复通知自己）
    from_label = ticketing.get_state_label(ticket["ticket_type"], from_status)
    to_label = ticketing.get_state_label(ticket["ticket_type"], spec["to"])
    recipients = {ticket["creator_id"]}
    if ticket.get("assignee_id"):
        recipients.add(ticket["assignee_id"])
    for r in recipients - {user_id}:
        await _publish(
            r,
            ticket_id,
            "transition",
            f"工单 {ticket['ticket_no']} 状态更新",
            f"{from_label} → {to_label}",
        )
    return {"status": spec["to"]}


# ---- 消息中心 ----


@router.get("/notifications")
async def list_notifications(user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "notification:view")
    items = await ticket_db.list_notifications(user_id)
    return {"items": items, "unread": await ticket_db.unread_count(user_id)}


@router.get("/notifications/unread")
async def notifications_unread(user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "notification:view")
    return {"unread": await ticket_db.unread_count(user_id)}


@router.post("/notifications/read")
async def mark_notifications_read(ids: list[int], user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "notification:view")
    await ticket_db.mark_read(user_id, ids)
    return {"unread": await ticket_db.unread_count(user_id)}


@router.get("/notifications/stream")
async def notifications_stream(
    after_id: int = 0, user_id: int = Depends(get_current_user_id)
) -> StreamingResponse:
    """消息中心 SSE：断线重连按 after_id 补发，实时通知走进程内队列。

    消息去重靠通知自增 id（单调递增），客户端按 id 幂等合并。
    """
    role = await ticket_db.get_user_role(user_id)
    _require(role, "notification:view")

    async def gen() -> AsyncGenerator[bytes, None]:
        # 断线重连补发：after_id 之后落库的通知
        for n in await ticket_db.list_notifications_after(user_id, after_id):
            yield b"data: " + _json_bytes(n)
        q = NOTIFY_QUEUES.setdefault(user_id, asyncio.Queue())
        while True:
            try:
                notif = await asyncio.wait_for(q.get(), timeout=SSE_HEARTBEAT)
            except asyncio.TimeoutError:
                yield b": ping\n\n"
                continue
            yield b"data: " + _json_bytes(notif)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ---- 看板 ----


@router.get("/dashboard")
async def dashboard(user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    _require(role, "dashboard:view")
    return await ticket_db.dashboard_stats()


# ---- 演示数据（虚拟滚动 / 看板造数，仅 admin） ----


@router.post("/seed")
async def seed_tickets(body: SeedRequest, user_id: int = Depends(get_current_user_id)):
    role = await ticket_db.get_user_role(user_id)
    if role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可造数")
    n = await ticket_db.seed_tickets(body.n, user_id)
    return {"seeded": n}