import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: 'happy-dom',
  },
})
