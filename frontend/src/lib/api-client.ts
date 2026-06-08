/**
 * API Client Configuration - Updated for media & social posting
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = 'v1';

export const API_ENDPOINTS = {
  // Health
  HEALTH: `${API_BASE_URL}/api/${API_VERSION}/health`,

  // Content
  CONTENT_GENERATE: `${API_BASE_URL}/api/${API_VERSION}/content/generate`,
  CONTENT_GENERATE_WITH_MEDIA: `${API_BASE_URL}/api/${API_VERSION}/content/generate-with-media`,
  CONTENT_HISTORY: `${API_BASE_URL}/api/${API_VERSION}/content/history`,
  CONTENT_DETAIL: (id: number) => `${API_BASE_URL}/api/${API_VERSION}/content/${id}`,

  // Media
  MEDIA_UPLOAD: `${API_BASE_URL}/api/${API_VERSION}/content/media/upload`,

  // Social Posting
  SOCIAL_POST: (id: number) => `${API_BASE_URL}/api/${API_VERSION}/content/${id}/post`,
  LINKEDIN_ACCOUNTS: `${API_BASE_URL}/api/${API_VERSION}/social/linkedin/accounts`,
  PLATFORM_CONFIG: `${API_BASE_URL}/api/${API_VERSION}/social/platforms/config`,

  // Calendar / Scheduling
  CALENDAR_EVENTS: `${API_BASE_URL}/api/${API_VERSION}/calendar/events`,
  CALENDAR_EVENT: (id: number) =>
    `${API_BASE_URL}/api/${API_VERSION}/calendar/events/${id}`,
  CALENDAR_PUBLISH_NOW: (id: number) =>
    `${API_BASE_URL}/api/${API_VERSION}/calendar/events/${id}/publish-now`,

  // Analytics
  ANALYTICS_OVERVIEW: `${API_BASE_URL}/api/${API_VERSION}/analytics/overview`,
  ANALYTICS_SUMMARY: (range: string = '30d') =>
    `${API_BASE_URL}/api/${API_VERSION}/analytics/summary?range=${range}`,
  ANALYTICS_PLATFORM: (platform: string, range: string = '30d') =>
    `${API_BASE_URL}/api/${API_VERSION}/analytics/${platform}?range=${range}`,
  ANALYTICS_TRENDS: `${API_BASE_URL}/api/${API_VERSION}/analytics/trends`,

  // QA
  QA_CHECK: `${API_BASE_URL}/api/${API_VERSION}/qa/check`,

  // Rival Review (competitor intelligence)
  RIVALS: `${API_BASE_URL}/api/${API_VERSION}/rivals`,
  RIVAL_DETAIL: (id: number) => `${API_BASE_URL}/api/${API_VERSION}/rivals/${id}`,
  RIVAL_REFRESH: (id: number) =>
    `${API_BASE_URL}/api/${API_VERSION}/rivals/${id}/refresh`,
  RIVALS_REFRESH_ALL: `${API_BASE_URL}/api/${API_VERSION}/rivals/refresh-all`,
  RIVAL_SNAPSHOTS: (id: number) =>
    `${API_BASE_URL}/api/${API_VERSION}/rivals/${id}/snapshots`,
  RIVALS_INSIGHTS: `${API_BASE_URL}/api/${API_VERSION}/rivals/insights`,

  // Uploads
  UPLOADS: `${API_BASE_URL}/uploads`,
};

export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 min timeout for generation
  headers: {
    'Content-Type': 'application/json',
  },
};
