import { useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'

// 自研虚拟滚动：固定行高，只渲染可视区 + overscan 缓冲行，其余用上下占位撑起总高度。
// 万级数据下 DOM 节点数从 N 降到 ~视口行数 + 2×overscan，滚动流畅度与首屏渲染时间大幅改善。
// （不引 react-window：指标可测、面试可讲清滚动窗口的定位与复用逻辑）

type VirtualListProps<T> = {
    items: T[]
    rowHeight: number
    // 容器高度（由父布局决定，通常占满剩余空间）
    className?: string
    overscan?: number
    renderRow: (item: T, index: number) => ReactNode
    // 滚动接近底部时回调（父层据此分页加载更多），配合后端 limit/offset 分批拉取
    onEndReached?: () => void
}

export default function VirtualList<T>({
    items,
    rowHeight,
    className,
    overscan = 6,
    renderRow,
    onEndReached,
}: VirtualListProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [scrollTop, setScrollTop] = useState(0)
    // 初始给一个合理视口估算，挂载后 ref 回调读到真实 clientHeight 再校正，
    // 避免首映 flash（初始 0 会只渲染 overscan 行、余下靠占位撑起）
    const [viewportHeight, setViewportHeight] = useState(600)

    // 已触发加载更多的 scrollTop 快照：向上滚动回到阈值内可再次触发
    const lastFiredAt = useRef<number>(0)
    const isFiring = useRef(false)

    const onScroll = (e: UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget
        setScrollTop(el.scrollTop)
        // 底部触发加载：距底不足 3 行时回调（由父层决定是否 hasNextPage）
        if (onEndReached) {
            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - rowHeight * 3
            if (nearBottom && !isFiring.current && el.scrollTop !== lastFiredAt.current) {
                isFiring.current = true
                lastFiredAt.current = el.scrollTop
                onEndReached()
                // 父层返回后允许下次触发（分页请求完成与否由父层的 hasNextPage 控制节流）
                isFiring.current = false
            }
        }
    }

    // 容器挂载时量一次视口高度（列表高度随内容区变化）
    const containerRefCb = (el: HTMLDivElement | null) => {
        containerRef.current = el
        if (el && viewportHeight === 0) setViewportHeight(el.clientHeight)
    }

    const total = items.length
    const totalHeight = total * rowHeight
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
    const visible = items.slice(start, end)

    return (
        <div
            ref={containerRefCb}
            onScroll={onScroll}
            className={`thin-scrollbar overflow-y-auto ${className ?? ''}`}
        >
            {/* 上层占位：把可视行推到正确的滚动位置 */}
            <div style={{ height: start * rowHeight, width: '100%' }} />
            {visible.map((item, i) => renderRow(item, start + i))}
            {/* 下层占位：撑满剩余总高度（totalHeight 已含上行高度，注意不重复累加 start*rowHeight） */}
            <div style={{ height: totalHeight - end * rowHeight, width: '100%' }} />
        </div>
    )
}