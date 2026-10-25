import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTicket } from '../api/ticket'
import { useTicketConfig } from '../hooks/useTicketConfig'
import StatusBadge, { PriorityBadge } from '../components/ticket/StatusBadge'
import FlowTimeline from '../components/ticket/FlowTimeline'
import TransitionModal from '../components/ticket/TransitionModal'
import { DynamicForm } from '../components/ticket/FieldRenderer'
import type { ActionSpec } from '../api/type'

// 动作 key → 中文（事件流里展示；未知动作回退原 key）
const ACTION_LABEL: Record<string, string> = {
    create: '创建',
    accept: '接单/受理',
    resolve: '提交解决',
    close: '关闭',
    reopen: '重新打开',
}

function fmtTime(iso: string): string {
    return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

// 工单详情页：状态机配置驱动操作按钮 + Schema 只读回填 + 流程时间线 + 脱敏字段展示。
// 可执行动作由后端按「当前状态 + 当前角色」下发（available_actions），前端只渲染按钮，
// 非法流转由后端状态层兜底拦截。
export default function TicketDetailPage() {
    const { id } = useParams<{ id: string }>()
    const queryClient = useQueryClient()
    const config = useTicketConfig()

    const query = useQuery({
        queryKey: ['ticket', id],
        queryFn: () => getTicket(id!),
        enabled: !!id,
    })

    // 当前选中的待执行动作（打开流转弹窗）
    const [pendingAction, setPendingAction] = useState<{ key: string; spec: ActionSpec } | null>(null)

    if (query.isLoading || config.isLoading) {
        return <div className="flex h-full items-center justify-center text-sm text-gray-400">加载中…</div>
    }
    if (query.isError || !query.data) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-400">
                <span>工单不存在或无权访问</span>
                <Link to="/tickets" className="text-blue-600 hover:underline">
                    返回列表
                </Link>
            </div>
        )
    }

    const { ticket, events, available_actions, flow, status_labels } = query.data
    const typeCfg = config.data?.ticket_types[ticket.ticket_type]
    const actions = Object.entries(available_actions)

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['ticket', id] })

    return (
        <div className="flex h-full flex-col">
            {/* 顶栏：返回 + 工单号 + 标题 + 状态 + 优先级 + 操作按钮 */}
            <header className="border-b border-gray-200 bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <Link
                            to="/tickets"
                            className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                        >
                            ← 返回列表
                        </Link>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-gray-400">{ticket.ticket_no}</span>
                            <StatusBadge status={ticket.status} label={status_labels[ticket.status]} />
                            <PriorityBadge priority={ticket.priority} />
                            <span className="text-xs text-gray-400">{typeCfg?.name ?? ticket.ticket_type}</span>
                        </div>
                        <h1 className="mt-1.5 truncate text-lg font-semibold text-gray-900">{ticket.title}</h1>
                    </div>

                    {/* 状态机动作按钮：后端已按角色+状态过滤，前端零硬编码流转分支 */}
                    <div className="flex shrink-0 gap-2">
                        {actions.map(([key, spec]) => (
                            <button
                                key={key}
                                onClick={() => setPendingAction({ key, spec })}
                                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                            >
                                {spec.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid grid-cols-3 gap-6 p-6">
                    {/* 左 2/3：流程时间线 + 字段只读回填 */}
                    <div className="col-span-2 space-y-6">
                        <Card title="处理流程">
                            <FlowTimeline flow={flow} current={ticket.status} labels={status_labels} />
                        </Card>

                        <Card title="工单详情">
                            {/* Schema 驱动只读回填：字段值来自后端（敏感字段已按角色/本人脱敏） */}
                            <DynamicForm
                                fields={typeCfg?.fields ?? []}
                                values={ticket.fields}
                                onChange={() => {}}
                                disabled
                            />
                        </Card>
                    </div>

                    {/* 右 1/3：流转记录 */}
                    <Card title="流转记录">
                        {events.length === 0 ? (
                            <div className="py-6 text-center text-xs text-gray-400">暂无记录</div>
                        ) : (
                            <ol className="space-y-4">
                                {events.map((e) => (
                                    <li key={e.id} className="relative pl-5">
                                        {/* 时间线竖线 + 圆点 */}
                                        <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-400 ring-4 ring-blue-50" />
                                        {e.id !== events[events.length - 1].id && (
                                            <span className="absolute left-[4.5px] top-4 h-full w-px bg-gray-100" />
                                        )}
                                        <div className="text-xs text-gray-400">{fmtTime(e.created_at)}</div>
                                        <div className="mt-0.5 text-sm text-gray-700">
                                            <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                                            {e.from_status && (
                                                <span className="text-gray-500">
                                                    {' '}
                                                    · {status_labels[e.from_status] ?? e.from_status} →{' '}
                                                    {status_labels[e.to_status] ?? e.to_status}
                                                </span>
                                            )}
                                        </div>
                                        {e.extra && Object.keys(e.extra).length > 0 && (
                                            <div className="mt-1 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500">
                                                {Object.entries(e.extra).map(([k, v]) => (
                                                    <div key={k}>
                                                        {k}: {String(v)}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Card>
                </div>
            </div>

            {/* 流转弹窗：动作附加表单由后端 spec.form 驱动 */}
            {pendingAction && (
                <TransitionModal
                    ticketId={ticket.id}
                    actionKey={pendingAction.key}
                    spec={pendingAction.spec}
                    onClose={() => setPendingAction(null)}
                    onDone={() => {
                        setPendingAction(null)
                        refresh()
                    }}
                />
            )}
        </div>
    )
}

// 卡片容器：标题 + 内容
function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{title}</h2>
            {children}
        </section>
    )
}