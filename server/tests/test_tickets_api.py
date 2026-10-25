"""工单接口层测试：httpx ASGITransport 直打 app，monkeypatch mock ticket_db，不连真实数据库。

覆盖：路由级权限 403、数据级权限 404、字段脱敏、动态表单必填 422、状态机流转拦截 400 / 成功 200。
"""

import asyncio

from httpx import ASGITransport, AsyncClient

import ticket_db
from auth import SESSION_COOKIE, create_token
from main import app

TICKET = {
    "id": 1,
    "ticket_no": "INC-000001",
    "ticket_type": "incident",
    "status": "open",
    "title": "登录故障",
    "priority": "P1",
    "creator_id": 2,  # 提单人 ≠ 当前登录用户(1)，用于脱敏/数据级权限测试
    "assignee_id": None,
    "fields": {
        "title": "登录故障",
        "detail": "无法登录",
        "customer_phone": "13812345678",
        "priority": "P1",
    },
    "created_at": None,
    "updated_at": None,
}


def run(coro):
    return asyncio.run(coro)


def make_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def authed(client: AsyncClient, user_id: int = 1) -> AsyncClient:
    client.cookies.set(SESSION_COOKIE, create_token(user_id))
    return client


def _mock_role(monkeypatch, role: str):
    async def fake_role(uid):
        return role

    monkeypatch.setattr(ticket_db, "get_user_role", fake_role)


# ---------- 路由级权限 ----------


def test_dashboard_forbidden_for_user(monkeypatch):
    _mock_role(monkeypatch, "user")

    async def scenario():
        async with make_client() as c:
            return await authed(c).get("/api/dashboard")

    assert run(scenario()).status_code == 403


def test_tickets_requires_auth():
    async def scenario():
        async with make_client() as c:
            return await c.get("/api/tickets")

    assert run(scenario()).status_code == 401


# ---------- 数据级权限 ----------


def test_user_cannot_view_others_ticket(monkeypatch):
    _mock_role(monkeypatch, "user")

    async def fake_ticket(tid):
        return TICKET  # creator_id=2，当前 user_id=1

    monkeypatch.setattr(ticket_db, "get_ticket", fake_ticket)

    async def scenario():
        async with make_client() as c:
            return await authed(c).get("/api/tickets/1")

    assert run(scenario()).status_code == 404


# ---------- 字段脱敏 ----------


def test_detail_masks_sensitive_field(monkeypatch):
    _mock_role(monkeypatch, "agent")

    async def fake_ticket(tid):
        return TICKET

    async def fake_events(tid):
        return []

    monkeypatch.setattr(ticket_db, "get_ticket", fake_ticket)
    monkeypatch.setattr(ticket_db, "list_events", fake_events)

    async def scenario():
        async with make_client() as c:
            return await authed(c).get("/api/tickets/1")

    data = run(scenario()).json()
    # agent 看别人的工单：手机号脱敏
    assert data["ticket"]["fields"]["customer_phone"] == "138****5678"
    assert data["ticket"]["fields"]["title"] == "登录故障"


# ---------- 动态表单必填 ----------


def test_create_missing_required(monkeypatch):
    _mock_role(monkeypatch, "agent")

    async def scenario():
        async with make_client() as c:
            return await authed(c).post(
                "/api/tickets",
                json={"ticket_type": "incident", "fields": {"title": "", "detail": "x"}},
            )

    assert run(scenario()).status_code == 422


# ---------- 状态机流转 ----------


def test_transition_invalid_action(monkeypatch):
    _mock_role(monkeypatch, "agent")

    async def fake_ticket(tid):
        return TICKET

    monkeypatch.setattr(ticket_db, "get_ticket", fake_ticket)

    async def scenario():
        async with make_client() as c:
            return await authed(c).post(
                "/api/tickets/1/transition", json={"action": "resolve", "extra": {}}
            )

    # open 状态不允许 resolve：状态层拦截返回 400
    assert run(scenario()).status_code == 400


def test_transition_success(monkeypatch):
    _mock_role(monkeypatch, "agent")

    async def fake_ticket(tid):
        return TICKET

    async def fake_transition(tid, from_status, to_status, action, operator_id, extra):
        assert to_status == "processing"
        return True

    async def fake_notify(user_id, ticket_id, kind, title, content):
        return {"id": 1}

    monkeypatch.setattr(ticket_db, "get_ticket", fake_ticket)
    monkeypatch.setattr(ticket_db, "transition_ticket", fake_transition)
    monkeypatch.setattr(ticket_db, "add_notification", fake_notify)

    async def scenario():
        async with make_client() as c:
            return await authed(c).post(
                "/api/tickets/1/transition", json={"action": "accept", "extra": {}}
            )

    resp = run(scenario())
    assert resp.status_code == 200
    assert resp.json() == {"status": "processing"}