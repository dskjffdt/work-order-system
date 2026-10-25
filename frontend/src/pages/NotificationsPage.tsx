import { useNotificationStore } from '../stores/useNotificationStore'

function fmtTime(iso: string): string {
    return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

// 消息通知类型 → 中文标签
const KIND_LABEL: Record<string, string> = {
    transition: '工单流转',
}

// 消息中心：SSE 已在 AppShell 顶层建立并去重聚合，这里纯展示 store + 标记已读。
export default function NotificationsPage() {
    const items = useNotificationStore((s) => s.items)
    const unread = useNotificationStore((s) => s.unread)
    const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">消息中心</h1>
                    <p className="mt-0.5 text-xs text-gray-400">
                        SSE 实时推送 · 断线重连 · 未读 {unread} 条
                    </p>
                </div>
                {unread > 0 && (
                    <button
                        onClick={markAllAsRead}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
                    >
                        全部标为已读
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {items.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        暂无消息
                    </div>
                ) : (
                    <ul className="mx-auto max-w-3xl space-y-3">
                        {items.map((n) => (
                            <li
                                key={n.id}
                                className={`flex items-start gap-4 rounded-2xl border bg-white p-4 transition-colors ${
                                    n.read ? 'border-gray-100' : 'border-blue-200 shadow-sm shadow-blue-50'
                                }`}
                            >
                                {/* 未读圆点 */}
                                <span
                                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                                        n.read ? 'bg-gray-200' : 'bg-blue-500'
                                    }`}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                                            {KIND_LABEL[n.kind] ?? n.kind}
                                        </span>
                                        {!n.read && (
                                            <span className="text-xs font-medium text-blue-500">未读</span>
                                        )}
                                    </div>
                                    <div className="mt-1 text-sm font-medium text-gray-800">{n.title}</div>
                                    <div className="mt-0.5 text-sm text-gray-500">{n.content}</div>
                                    <div className="mt-1 text-xs text-gray-400">{fmtTime(n.created_at)}</div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}