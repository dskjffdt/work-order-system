"""工单系统的配置与纯逻辑：状态机、动态表单 schema、RBAC 权限矩阵、字段脱敏。

这一层不碰数据库，输入输出都是纯数据，岗位核心用例（状态流转 / 权限）可单测覆盖。
新增工单类型 = 在 TICKET_TYPES 里加一段配置，前后端渲染代码零改动。
"""

from __future__ import annotations

from typing import Any

# ---- 角色与权限矩阵（路由级 / 按钮级共用） ----

ROLES = ("admin", "agent", "user")

# 权限点：字符串即权限标识，前端路由守卫与按钮渲染、后端接口都按它判断
PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "ticket:create",
        "ticket:view",
        "ticket:update",
        "ticket:transfer",
        "ticket:accept",
        "ticket:resolve",
        "ticket:close",
        "ticket:export",
        "dashboard:view",
        "notification:view",
        "ai:use",
    },
    "agent": {
        "ticket:create",
        "ticket:view",
        "ticket:update",
        "ticket:accept",
        "ticket:resolve",
        "ticket:close",
        "ticket:export",
        "dashboard:view",
        "notification:view",
        "ai:use",
    },
    # 普通用户只能提单、看自己的工单、改自己未关闭的工单，无权进看板
    "user": {
        "ticket:create",
        "ticket:view",
        "ticket:update",
        "notification:view",
    },
}


def has_permission(role: str, permission: str) -> bool:
    """角色是否持有某权限点。未知角色按无权限处理（权限白名单模型）。"""
    return permission in PERMISSIONS.get(role, set())


# ---- 动态表单字段 schema ----

# type 支持：text / textarea / number / select / radio / date
# visible：字段显隐条件，{"<字段key>": [可选值...]} 语义 = 该字段值命中列表时本字段可见
# sensitive：敏感字段，非本人且非 admin 查看时脱敏（见 mask_value）
# readonly：创建后不可改（详情页只读展示）

# ---- 工单类型配置（状态机 + 表单 + 流程时间线） ----

TICKET_TYPES: dict[str, dict[str, Any]] = {
    "incident": {
        "name": "故障工单",
        "fields": [
            {"key": "title", "label": "标题", "type": "text", "required": True},
            {
                "key": "priority",
                "label": "优先级",
                "type": "radio",
                "options": ["P0", "P1", "P2", "P3"],
                "default": "P2",
            },
            {
                "key": "source",
                "label": "来源",
                "type": "select",
                "options": ["电话", "邮件", "自助平台"],
                "default": "自助平台",
            },
            {
                "key": "customer_phone",
                "label": "客户手机号",
                "type": "text",
                "required": True,
                "sensitive": True,
            },
            {"key": "detail", "label": "问题描述", "type": "textarea", "required": True},
            # 显隐示例：仅高优先级故障才要求填影响范围，低优先级表单里不出现
            {
                "key": "impact",
                "label": "影响范围",
                "type": "textarea",
                "visible": {"priority": ["P0", "P1"]},
            },
        ],
        # 状态机：每个状态 -> 允许的 action 列表；action 定义目标状态、可执行角色、执行时需填的附加表单
        "states": {
            "open": {
                "label": "待接单",
                "actions": {
                    "accept": {"label": "接单", "to": "processing", "roles": ["agent"]},
                    "close": {"label": "关闭", "to": "closed", "roles": ["admin", "agent"],
                              "form": [{"key": "note", "label": "关闭原因", "type": "textarea", "required": True}]},
                },
            },
            "processing": {
                "label": "处理中",
                "actions": {
                    "resolve": {"label": "提交解决", "to": "resolved", "roles": ["agent"],
                                "form": [{"key": "solution", "label": "解决方案", "type": "textarea", "required": True}]},
                    "close": {"label": "关闭", "to": "closed", "roles": ["admin"],
                              "form": [{"key": "note", "label": "关闭原因", "type": "textarea", "required": True}]},
                },
            },
            "resolved": {
                "label": "待确认",
                "actions": {
                    "close": {"label": "确认关闭", "to": "closed", "roles": ["admin", "user"]},
                    "reopen": {"label": "重新打开", "to": "processing", "roles": ["admin", "agent", "user"],
                               "form": [{"key": "note", "label": "重开原因", "type": "textarea", "required": True}]},
                },
            },
            "closed": {"label": "已关闭", "actions": {}},
        },
        # 流程时间线：详情页按此顺序渲染节点，标记已完成 / 当前 / 未到达
        "flow": ["open", "processing", "resolved", "closed"],
        "initial": "open",
    },
    "inquiry": {
        "name": "咨询工单",
        "fields": [
            {"key": "title", "label": "咨询主题", "type": "text", "required": True},
            {
                "key": "category",
                "label": "咨询分类",
                "type": "select",
                "options": ["产品咨询", "计费问题", "使用帮助"],
                "default": "使用帮助",
            },
            {"key": "detail", "label": "咨询内容", "type": "textarea", "required": True},
        ],
        "states": {
            "open": {
                "label": "待回复",
                "actions": {
                    "accept": {"label": "受理", "to": "processing", "roles": ["agent"]},
                    "close": {"label": "关闭", "to": "closed", "roles": ["admin", "agent"],
                              "form": [{"key": "note", "label": "关闭原因", "type": "textarea", "required": True}]},
                },
            },
            "processing": {
                "label": "回复中",
                "actions": {
                    "resolve": {"label": "完成回复", "to": "resolved", "roles": ["agent"]},
                },
            },
            "resolved": {
                "label": "已完成",
                "actions": {
                    "close": {"label": "确认关闭", "to": "closed", "roles": ["admin", "user"]},
                },
            },
            "closed": {"label": "已关闭", "actions": {}},
        },
        "flow": ["open", "processing", "resolved", "closed"],
        "initial": "open",
    },
}


def get_ticket_type(key: str) -> dict[str, Any] | None:
    return TICKET_TYPES.get(key)


def get_state_label(ticket_type: str, status: str) -> str:
    cfg = TICKET_TYPES.get(ticket_type)
    if cfg is None:
        return status
    return cfg["states"].get(status, {}).get("label", status)


# ---- 状态机：可用操作推导 + 流转合法性（状态层拦截，而非仅 UI 隐藏） ----


def get_available_actions(ticket_type: str, status: str) -> dict[str, dict]:
    """从配置推导当前状态允许的操作（供前端渲染按钮，未列出的操作一律不出现）。"""
    cfg = TICKET_TYPES.get(ticket_type)
    if cfg is None:
        return {}
    return cfg["states"].get(status, {}).get("actions", {})


class InvalidTransition(Exception):
    """非法状态流转：状态机层拦截（后端必达，前端按钮只是第一道遮罩）。"""


def check_action(ticket_type: str, status: str, action: str, role: str) -> dict:
    """校验一次流转是否合法，合法返回 action 定义以便取目标状态/附加表单。

    非法时抛 InvalidTransition，语义区分「动作不存在」与「角色无权」供前端提示。
    """
    actions = get_available_actions(ticket_type, status)
    if action not in actions:
        raise InvalidTransition(f"当前状态不允许执行「{action}」")
    spec = actions[action]
    if role not in spec.get("roles", []):
        raise InvalidTransition(f"当前角色无权执行「{spec['label']}」")
    return spec


def next_status(ticket_type: str, status: str, action: str, role: str) -> str:
    """合法流转的目标状态（先 check_action 再取 to，保证不绕过校验）。"""
    return check_action(ticket_type, status, action, role)["to"]


# ---- 动态表单：字段显隐 / 回填只读 ----

# 状态流转时的附加表单字段 key（不进主表单，只出现在流转弹窗里）
_ACTION_EXTRA_KEYS = ("note", "solution")


def compute_visible_fields(fields: list[dict], values: dict[str, Any]) -> list[dict]:
    """按 visible 条件过滤出应显示的字段（配置驱动显隐，前端渲染器直接消费）。

    visible 形如 {"impact": {"priority": ["P0", "P1"]}}，命中才保留。
    """
    result = []
    for f in fields:
        cond = f.get("visible")
        if not cond:
            result.append(f)
            continue
        visible = True
        for field_key, allowed in cond.items():
            if values.get(field_key) not in allowed:
                visible = False
                break
        if visible:
            result.append(f)
    return result


def is_readonly_field(field: dict, ticket_type: str, status: str) -> bool:
    """字段在非初始状态下只读：工单一进入流转（非 initial）即锁主表单，只走状态流转。"""
    if ticket_type not in TICKET_TYPES:
        return True
    return status != TICKET_TYPES[ticket_type]["initial"]


def validate_fields(fields: list[dict], values: dict[str, Any]) -> list[str]:
    """动态表单的必填校验（联动校验的最小实现：required + 可见时必填）。

    返回非法字段的中文提示列表，空列表 = 通过。
    """
    errors: list[str] = []
    for f in compute_visible_fields(fields, values):
        val = values.get(f["key"])
        empty = val is None or (isinstance(val, str) and not val.strip())
        if f.get("required") and empty:
            errors.append(f"「{f['label']}」为必填项")
    return errors


# ---- 字段脱敏（字段级权限） ----


def mask_value(value: str | None, sensitive: bool, role: str, is_owner: bool) -> str | None:
    """敏感字段脱敏：本人或 admin 可见原文，其余角色掩码。

    手机号类掩码保留首 3 尾 4（138****5678）。
    """
    if not sensitive or value is None:
        return value
    if role == "admin" or is_owner:
        return value
    if len(value) >= 7:
        return value[:3] + "****" + value[-4:]
    return "****"


def serialize_ticket_fields(
    fields: list[dict], values: dict[str, Any], role: str, is_owner: bool
) -> dict[str, Any]:
    """按字段配置输出：把敏感字段脱敏，返回给前端的字段 map。"""
    out: dict[str, Any] = {}
    for f in fields:
        key = f["key"]
        val = values.get(key)
        out[key] = mask_value(val, bool(f.get("sensitive")), role, is_owner)
    return out