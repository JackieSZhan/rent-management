import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  // In Docker dev, localhost points to the client container.
  // Use VITE_API_TARGET=http://server:3000 to reach the server container.
  const target = process.env.VITE_API_TARGET || "http://localhost:3000";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
