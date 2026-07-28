import { onRequestGet as __api_photo_js_onRequestGet } from "/workspaces/codespaces-blank/functions/api/photo.js"
import { onRequestGet as __api_restaurant_js_onRequestGet } from "/workspaces/codespaces-blank/functions/api/restaurant.js"

export const routes = [
    {
      routePath: "/api/photo",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_photo_js_onRequestGet],
    },
  {
      routePath: "/api/restaurant",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_restaurant_js_onRequestGet],
    },
  ]