// 流程时间线：按配置的 flow 顺序渲染节点，标记「已完成 / 当前 / 未到达」。
// 节点顺序与名称都来自 /ticket-config，新增类型零改动

export default function FlowTimeline({
    flow,
    current,
    labels,
}: {
    flow: string[]
    current: string
    labels: Record<string, string>
}) {
    const currentIdx = flow.indexOf(current)

    return (
        <div className="flex items-center">
            {flow.map((status, i) => {
                const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
                const label = labels[status] ?? status
                return (
                    <div key={status} className="flex flex-1 items-center last:flex-none">
                        <div className="flex flex-col items-center">
                            <div
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-2 ${
                                    state === 'done'
                                        ? 'bg-emerald-500 text-white ring-emerald-500'
                                        : state === 'active'
                                          ? 'bg-blue-500 text-white ring-blue-500 ring-offset-2'
                                          : 'bg-white text-gray-400 ring-gray-200'
                                }`}
                            >
                                {state === 'done' ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </div>
                            <span
                                className={`mt-1.5 text-xs ${
                                    state === 'todo' ? 'text-gray-400' : 'font-medium text-gray-700'
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                        {/* 连接线：前一个节点到下一个 */}
                        {i < flow.length - 1 && (
                            <div
                                className={`mx-2 mb-6 h-0.5 flex-1 rounded ${
                                    i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'
                                }`}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}