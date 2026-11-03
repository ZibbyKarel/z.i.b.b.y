/** Ports the packaged app owns — deliberately different from the dev servers (3333 / 3000). */
export const API_PORT = 4333;
export const WEB_PORT = 4000;
export const API_BASE_URL = `http://localhost:${API_PORT}`;
export const API_HEALTH_URL = `${API_BASE_URL}/api/health`;
export const WEB_HEALTH_URL = `http://localhost:${WEB_PORT}/`;
export const APP_NAME = "ZibbyOS";
