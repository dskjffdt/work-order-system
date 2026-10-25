"""状态机 + 权限 + 动态表单 + 字段脱敏 的纯逻辑用例（不碰 DB）。

覆盖简历亮点：
- 状态机配置驱动流转（合法/非法动作、角色拦截）
- Schema 驱动动态表单（显隐、必填联动校验）
- 权限矩阵 + 字段脱敏
"""

import pytest

from ticketing import (
    TICKET_TYPES,
    InvalidTransition,
    check_action,
    compute_visible_fields,
    get_available_actions,
    get_state_label,
    has_permission,
    mask_value,
    next_status,
    serialize_ticket_fields,
    validate_fields,
)


# ---------- 权限矩阵 ----------


def test_has_permission():
    assert has_permission("admin", "ticket:close")
    assert has_permission("agent", "ticket:accept")
    # 普通用户无权进看板、关单
    assert not has_permission("user", "dashboard:view")
    assert not has_permission("user", "ticket:close")
    # 未知角色按无权限处理（白名单模型）
    assert not has_permission("boss", "ticket:view")


# ---------- 状态机流转 ----------


def test_valid_transitions():
    assert next_status("incident", "open", "accept", "agent") == "processing"
    assert next_status("incident", "processing", "resolve", "agent") == "resolved"
    assert next_status("incident", "resolved", "close", "admin") == "closed"


def test_invalid_action_rejected():
    # closed 终态无任何动作
    with pytest.raises(InvalidTransition):
        check_action("incident", "closed", "accept", "agent")
    # 待接单不允许直接 resolve
    with pytest.raises(InvalidTransition):
        check_action("incident", "open", "resolve", "agent")


def test_role_guard_on_action():
    # open 的关闭只允许 admin/agent，user 无权（状态层拦截，而非仅 UI 隐藏）
    with pytest.raises(InvalidTransition):
        check_action("incident", "open", "close", "user")
    # agent 在处理中不能关闭（配置里只授权 admin）
    with pytest.raises(InvalidTransition):
        check_action("incident", "processing", "close", "agent")


def test_available_actions_derived_from_config():
    open_actions = get_available_actions("incident", "open")
    assert set(open_actions) == {"accept", "close"}
    # 咨询工单状态机是另一套配置，动作集不同
    inquiry_actions = get_available_actions("inquiry", "processing")
    assert set(inquiry_actions) == {"resolve"}


def test_state_label_fallback():
    assert get_state_label("incident", "open") == "待接单"
    assert get_state_label("incident", "不存在的状态") == "不存在的状态"


# ---------- 动态表单：显隐 + 联动校验 ----------


def test_visible_fields_high_priority():
    fields = TICKET_TYPES["incident"]["fields"]
    visible = compute_visible_fields(fields, {"priority": "P0"})
    keys = [f["key"] for f in visible]
    assert "impact" in keys  # 高优先级才显示影响范围


def test_visible_fields_low_priority():
    fields = TICKET_TYPES["incident"]["fields"]
    visible = compute_visible_fields(fields, {"priority": "P2"})
    keys = [f["key"] for f in visible]
    assert "impact" not in keys  # 低优先级不显示，配置驱动显隐


def test_validate_required():
    fields = TICKET_TYPES["incident"]["fields"]
    errors = validate_fields(fields, {"title": "", "detail": "x"})
    assert any("标题" in e for e in errors)
    assert any("客户手机号" in e for e in errors)


def test_validate_hidden_field_not_required():
    fields = TICKET_TYPES["incident"]["fields"]
    # 低优先级下 impact 不可见，即便缺失也不计入必填
    errors = validate_fields(
        fields, {"title": "t", "detail": "d", "customer_phone": "13800138000"}
    )
    assert not any("影响范围" in e for e in errors)


# ---------- 字段脱敏 ----------


def test_mask_owner_and_admin_see_raw():
    assert mask_value("13812345678", True, "admin", False) == "13812345678"
    assert mask_value("13812345678", True, "user", True) == "13812345678"


def test_mask_other_role_masked():
    assert mask_value("13812345678", True, "agent", False) == "138****5678"
    # 非敏感字段不脱敏
    assert mask_value("13812345678", False, "agent", False) == "13812345678"


def test_serialize_ticket_fields():
    fields = TICKET_TYPES["incident"]["fields"]
    values = {"title": "x", "customer_phone": "13812345678", "detail": "d"}
    out = serialize_ticket_fields(fields, values, "agent", False)
    assert out["customer_phone"] == "138****5678"
    assert out["title"] == "x"
    admin = serialize_ticket_fields(fields, values, "admin", False)
    assert admin["customer_phone"] == "13812345678"