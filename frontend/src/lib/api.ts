// Central API & WebSocket configuration for production and local environments

export const API_BASE_URL = 
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:8000";

export const WS_BASE_URL = 
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/+$/, "") ||
  API_BASE_URL.replace(/^http/, "ws");
