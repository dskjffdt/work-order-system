import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import AppShell from './components/layout/AppShell.tsx'
import Toast from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import TicketListPage from './pages/TicketListPage.tsx'
import TicketDetailPage from './pages/TicketDetailPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import NotificationsPage from './pages/NotificationsPage.tsx'
import 'normalize.css'

// 全局兜底：JS 运行时错误（老浏览器不支持某 API、setTimeout 回调 throw 等）
window.addEventListener('error', (e) => {
    if (import.meta.env.DEV) console.error('[window.error]', e.error ?? e.message)
})

// Promise 链未 catch（fetch 漏 catch、SSE 异步回调 throw 等）
window.addEventListener('unhandledrejection', (e) => {
    if (import.meta.env.DEV) console.error('[unhandledrejection]', e.reason)
})

// React Query 默认：服务端状态统一缓存，列表/详情/看板按 queryKey 复用与失效
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
        },
    },
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Routes>
                        {/* 工单系统：AppShell 布局包裹（工单/看板/消息中心），内部 Outlet 渲染子路由 */}
                        <Route element={<AppShell />}>
                            <Route path="/tickets" element={<TicketListPage />} />
                            <Route path="/tickets/:id" element={<TicketDetailPage />} />
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/notifications" element={<NotificationsPage />} />
                        </Route>
                        {/* 根路径重定向到工单列表（登录态由 AppShell 内部守卫） */}
                        <Route path="/" element={<Navigate to="/tickets" replace />} />
                    </Routes>
                    <Toast />
                </BrowserRouter>
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>,
)