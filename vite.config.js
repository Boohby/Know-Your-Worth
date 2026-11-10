import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: '/know-your-worth/',
  plugins: [react()],
})
