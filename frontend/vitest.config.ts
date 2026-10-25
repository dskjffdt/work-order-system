import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [
        react({
            compiler: { target: '19' },
        }),
    ],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test-setup.ts'],
        // 单测仅覆盖 src/；e2e 是 Playwright 用例（@playwright/test），不能交给 vitest 收集
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
})
