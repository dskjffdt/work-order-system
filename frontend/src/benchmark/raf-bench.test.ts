// rAF 合批 vs 每 token 直写 的 commit 次数对比基准
// 模拟高吞吐模型输出：每 4ms 一个 chunk（250 chunk/s，帧 16ms → 每帧约 4 个 chunk）
// 统计两种模式下每秒 commit 总数与单帧内最高 commit 数
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, Profiler, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const FRAME_MS = 16
const CHUNK_INTERVAL_MS = 4
const DURATION_MS = 1000

function StreamText({ mode, registerPush }: {
    mode: 'direct' | 'batch'
    registerPush: (fn: (chunk: string) => void) => void
}) {
    const [text, setText] = useState('')
    const bufRef = useRef('')
    const scheduledRef = useRef(false)

    registerPush((chunk: string) => {
        if (mode === 'direct') {
            setText(t => t + chunk)
        } else {
            bufRef.current += chunk
            if (!scheduledRef.current) {
                scheduledRef.current = true
                requestAnimationFrame(() => {
                    setText(t => t + bufRef.current)
                    bufRef.current = ''
                    scheduledRef.current = false
                })
            }
        }
    })

    return createElement('div', null, text)
}

async function runBenchmark(mode: 'direct' | 'batch') {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
            'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })

    const commits: number[] = [] // 每次 commit 时的虚拟时间戳
    let pushFn: (chunk: string) => void = () => { }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
        root.render(
            createElement(Profiler, {
                id: 'bench',
                onRender: () => commits.push(performance.now()),
            }, createElement(StreamText, { mode, registerPush: (fn) => { pushFn = fn } }))
        )
    })

    const commitsBefore = commits.length

    // 每个 chunk 是独立的网络事件（独立宏任务），React 18 跨宏任务不批处理；
    // 因此每次 push 与时间推进各自独立 act，模拟真实事件流
    for (let t = 0; t < DURATION_MS; t += CHUNK_INTERVAL_MS) {
        await act(async () => { pushFn('字') })
        await act(async () => { vi.advanceTimersByTime(CHUNK_INTERVAL_MS) })
    }

    const commitsInWindow = commits.length - commitsBefore - 1 // 减去初始 mount

    // 按 16ms 帧分桶，取单帧内最高 commit 数
    const frameStart = commitsBefore + 1
    const buckets = new Map<number, number>()
    for (let i = frameStart; i < commits.length; i++) {
        const frame = Math.floor(commits[i] / FRAME_MS)
        buckets.set(frame, (buckets.get(frame) ?? 0) + 1)
    }
    const maxPerFrame = Math.max(...buckets.values())

    root.unmount()
    container.remove()
    vi.useRealTimers()

    return { commitsInWindow, maxPerFrame }
}

describe('rAF 合批 vs 直写 渲染次数对比', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('每 token 直写', async () => {
        const { commitsInWindow, maxPerFrame } = await runBenchmark('direct')
        console.log(`[直写] 每秒 commit 总数: ${commitsInWindow}, 单帧最高: ${maxPerFrame}`)
        expect(commitsInWindow).toBeGreaterThan(200)
    })

    it('rAF 合批', async () => {
        const { commitsInWindow, maxPerFrame } = await runBenchmark('batch')
        console.log(`[合批] 每秒 commit 总数: ${commitsInWindow}, 单帧最高: ${maxPerFrame}`)
        expect(maxPerFrame).toBe(1)
    })
})
