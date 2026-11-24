import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // Der Interpreter und die Symbologie laufen ohne DOM; ELK und der Renderer
    // bleiben in diesen Tests außen vor.
    environment: 'node',
  },
})
