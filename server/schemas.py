from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    # 长度上限：防大 payload 攻击（bcrypt 计算成本高，超长密码会拖慢登录接口）
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)


# ---- 工单系统请求模型 ----


class TicketCreateRequest(BaseModel):
    ticket_type: str
    # 自定义字段值：key 为表单 schema 里的字段 key（title/detail/priority/...）
    fields: dict = Field(default_factory=dict)


class TicketTransitionRequest(BaseModel):
    action: str
    # 流转附加表单值（如 close 的 note、resolve 的 solution）
    extra: dict = Field(default_factory=dict)


class RoleSwitchRequest(BaseModel):
    # 切换后的角色（演示多角色：admin / agent / user）
    role: str


class SeedRequest(BaseModel):
    # 造演示工单数量（虚拟滚动 / 看板数据来源），演示脚本用
    n: int = Field(default=10000, ge=0, le=50000)
