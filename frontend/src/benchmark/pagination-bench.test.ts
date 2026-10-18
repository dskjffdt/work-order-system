// 游标分页 vs 全量加载 首屏渲染耗时对比基准
// 用项目真实渲染链路（MarkdownBlock → stream-md）mount 不同规模的消息列表，
// React Profiler 记录 mount 阶段 actualDuration（纯 JS 渲染耗时，不含布局绘制）
import { describe, it, expect } from 'vitest'
import { createElement, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import MarkdownBlock from '../components/Content/MarkdownBlock'

const FULL_COUNT = 200   // 全量加载的长会话消息数
const FIRST_PAGE = 20    // 游标分页首屏消息数

// 模拟一条 AI 回复的典型 Markdown（标题 + 段落 + 代码块 + 收尾段）
function makeMessage(i: number) {
    return [
        `### 问题 ${i}：实现防抖函数`,
        '',
        '以下是基于 `setTimeout` 的防抖实现，支持 `leading` 与 `trailing` 两种触发模式：',
        '',
        '```ts',
        'function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {',
        '  let timer: ReturnType<typeof setTimeout>',
        '  return (...args: Parameters<T>) => {',
        '    clearTimeout(timer)',
        '    timer = setTimeout(() => fn(...args), wait)',
        '  }',
        '}',
        '```',
        '',
        '使用时注意 `this` 指向与参数透传，配合 `useRef` 保存实例避免闭包陷阱。',
    ].join('\n')
}

async function benchMount(count: number) {
    const messages = Array.from({ length: count }, (_, i) => makeMessage(i + 1))
    let mountDuration = 0

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
        root.render(
            createElement(Profiler, {
                id: 'bench',
                onRender: (_id: string, phase: string, actualDuration: number) => {
                    if (phase === 'mount') mountDuration += actualDuration
                },
            }, createElement('div', null,
                messages.map((text, i) =>
                    createElement(MarkdownBlock, { key: i, text })
                )
            ))
        )
    })

    // 等待 stream-md 可能存在的分帧渲染全部完成，避免低估 mount 成本
    await act(async () => {
        await new Promise(r => setTimeout(r, 500))
    })

    root.unmount()
    container.remove()
    return mountDuration
}

describe('游标分页首屏 vs 全量加载 渲染耗时对比', () => {
    it('全量加载 200 条', async () => {
        const ms = await benchMount(FULL_COUNT)
        console.log(`[全量 ${FULL_COUNT} 条] 首屏 mount 渲染耗时: ${ms.toFixed(0)}ms`)
        expect(ms).toBeGreaterThan(0)
    }, 60000)

    it('游标分页首屏 20 条', async () => {
        const ms = await benchMount(FIRST_PAGE)
        console.log(`[分页 ${FIRST_PAGE} 条] 首屏 mount 渲染耗时: ${ms.toFixed(0)}ms`)
        expect(ms).toBeGreaterThan(0)
    }, 60000)
})
