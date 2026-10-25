import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useQuery } from '@tanstack/react-query'
import { dashboardStats } from '../api/ticket'
import { useTicketConfig } from '../hooks/useTicketConfig'
import type { DashboardStats } from '../api/type'

// 通用状态标签（看板聚合不区分工单类型，用主演示类型的文案）
const STATUS_LABEL: Record<string, string> = {
    open: '待接单',
    processing: '处理中',
    resolved: '待确认',
    closed: '已关闭',
}

// ECharts 初始化 hook：容器挂载时 init，卸载 dispose，option 变化 setOption
function useECharts(option: echarts.EChartsOption) {
    const ref = useRef<HTMLDivElement>(null)
    const chartRef = useRef<echarts.ECharts | null>(null)

    useEffect(() => {
        if (!ref.current) return
        const chart = echarts.init(ref.current)
        chartRef.current = chart
        return () => {
            chart.dispose()
            chartRef.current = null
        }
    }, [])

    useEffect(() => {
        chartRef.current?.setOption(option)
    }, [option])

    return ref
}

// 运营看板：ECharts 渲染状态/类型/优先级分布 + 近 14 天趋势（数据来自 /dashboard 聚合）
export default function DashboardPage() {
    const query = useQuery({ queryKey: ['dashboard'], queryFn: dashboardStats })

    if (query.isLoading) {
        return <div className="flex h-full items-center justify-center text-sm text-gray-400">加载中…</div>
    }
    if (query.isError || !query.data) {
        return <div className="flex h-full items-center justify-center text-sm text-red-400">看板加载失败</div>
    }

    return (
        <div className="h-full overflow-y-auto p-6">
            <h1 className="text-lg font-semibold text-gray-900">运营看板</h1>
            <p className="mt-0.5 text-xs text-gray-400">工单状态 / 类型 / 优先级 / 近 14 天趋势</p>
            <DashboardContent stats={query.data} />
        </div>
    )
}

// 数据就绪后的图表区（独立组件，保证 useECharts 的 hook 调用顺序稳定，不跨越早期返回）
function DashboardContent({ stats }: { stats: DashboardStats }) {
    const config = useTicketConfig()

    const typeName = (key: string) => config.data?.ticket_types[key]?.name ?? key
    const statusLabel = (key: string) => STATUS_LABEL[key] ?? key

    const statusChartRef = useECharts({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
            {
                type: 'pie',
                radius: ['42%', '70%'],
                data: stats.status.map((s) => ({ name: statusLabel(s.key), value: s.value })),
                label: { show: true, formatter: '{b}: {c}' },
            },
        ],
    })

    const typeChartRef = useECharts({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
            {
                type: 'pie',
                radius: '65%',
                data: stats.type.map((t) => ({ name: typeName(t.key), value: t.value })),
                label: { show: true, formatter: '{b}: {c}' },
            },
        ],
    })

    const priorityChartRef = useECharts({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: stats.priority.map((p) => p.key) },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                data: stats.priority.map((p) => p.value),
                barMaxWidth: 40,
                itemStyle: { color: '#3b82f6' },
            },
        ],
    })

    const trendChartRef = useECharts({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: stats.trend.map((t) => t.day) },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'line',
                smooth: true,
                data: stats.trend.map((t) => t.value),
                areaStyle: { opacity: 0.12 },
                itemStyle: { color: '#3b82f6' },
            },
        ],
    })

    return (
        <>
            {/* 总览统计卡 */}
            <div className="mt-5 grid grid-cols-4 gap-4">
                <StatCard label="工单总数" value={stats.total} accent="text-blue-600" />
                {stats.status.map((s) => (
                    <StatCard key={s.key} label={statusLabel(s.key)} value={s.value} accent="text-gray-800" />
                ))}
            </div>

            {/* 图表区 */}
            <div className="mt-5 grid grid-cols-2 gap-4">
                <ChartCard title="状态分布">
                    <div ref={statusChartRef} className="h-64" />
                </ChartCard>
                <ChartCard title="类型分布">
                    <div ref={typeChartRef} className="h-64" />
                </ChartCard>
                <ChartCard title="优先级分布">
                    <div ref={priorityChartRef} className="h-64" />
                </ChartCard>
                <ChartCard title="近 14 天创建趋势">
                    <div ref={trendChartRef} className="h-64" />
                </ChartCard>
            </div>
        </>
    )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-400">{label}</div>
            <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
        </div>
    )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
            {children}
        </div>
    )
}