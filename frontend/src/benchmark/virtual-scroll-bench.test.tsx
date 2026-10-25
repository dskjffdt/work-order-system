// 虚拟滚动 vs 全量渲染：首屏渲染耗时与 DOM 节点数对比基准
// 复用真实 VirtualList 组件，同一批 1 万条数据下对比：
//   全量 = 一次性挂载 10000 行 DOM；虚拟 = 只挂载可视区行 + 上下占位
// React Profiler 记 mount 阶段 actualDuration（纯 JS 渲染耗时），DOM 节点数用 querySelectorAll('*') 统计
import { describe, it, expect } from 'vitest'
import { Profiler, act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import VirtualList from '../components/ticket/VirtualList'

const TOTAL = 10_000
const ROW_HEIGHT = 64

type Row = {
    id: number
    no: string
    title: string
    type: string
    priority: string
    status: string
    time: string
}

const items: Row[] = Array.from({ length: TOTAL }, (_, i) => ({
    id: i + 1,
    no: `INC-${String(i + 1).padStart(6, '0')}`,
    title: `工单标题 ${i + 1}`,
    type: '故障',
    priority: 'P2',
    status: 'open',
    time: '2026-10-25T14:30',
}))

// 行渲染：与真实列表一致的行结构（1 行容器 + 6 列），全量/虚拟共用保证对比公平
function RowView({ item }: { item: Row }) {
    return (
        <div style={{ height: ROW_HEIGHT }}>
            <span>{item.no}</span>
            <span>{item.title}</span>
            <span>{item.type}</span>
            <span>{item.priority}</span>
            <span>{item.status}</span>
            <span>{item.time}</span>
        </div>
    )
}

async function bench(node: ReactNode) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let duration = 0
    await act(async () => {
        root.render(
            <Profiler
                id="bench"
                onRender={(_id, phase, d) => {
                    if (phase === 'mount') duration += d
                }}
            >
                {node}
            </Profiler>,
        )
    })
    const count = container.querySelectorAll('*').length
    root.unmount()
    container.remove()
    return { duration, count }
}

describe('虚拟滚动 vs 全量渲染（1 万条数据）', () => {
    it('全量渲染：一次性挂载 10000 行', async () => {
        const { duration, count } = await bench(
            <div>{items.map((it) => <RowView key={it.id} item={it} />)}</div>,
        )
        console.log(`[全量 ${TOTAL} 行] mount 耗时 ${duration.toFixed(1)}ms，DOM 节点数 ${count}`)
        expect(count).toBeGreaterThanOrEqual(TOTAL * 6)
    }, 120_000)

    it('虚拟滚动：只挂载可视区行 + 上下占位', async () => {
        const { duration, count } = await bench(
            <VirtualList
                items={items}
                rowHeight={ROW_HEIGHT}
                renderRow={(it) => <RowView key={it.id} item={it} />}
            />,
        )
        console.log(`[虚拟滚动] mount 耗时 ${duration.toFixed(1)}ms，DOM 节点数 ${count}`)
        expect(count).toBeLessThan(1_000)
    }, 120_000)
})