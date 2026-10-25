import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        // React Compiler：@vitejs/plugin-react v6 内置 compiler 选项，
        // 底层走 oxc-transform-react（需单独安装），自动 memoize 组件/值，
        // 编译不通过的组件自动 bail out，不影响运行
        react({
            compiler: { target: '19' },
        }),
    ],
    server: {
        proxy: {
            '/login': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            '/logout': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            // 工单系统 API：统一 /api 前缀（/api/me、/api/ticket-config、/api/tickets、/api/notifications、/api/dashboard）
            // 与前端路由 /tickets、/dashboard、/notifications 隔离，避免整页导航被代理成 API 请求
            '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        },
    },
})
