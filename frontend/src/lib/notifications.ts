/** In-app notifications inbox. */

import { api } from './api';

export interface NotificationView {
  id: string;
  event_type: string;
  channel: 'email' | 'whatsapp' | 'in_app';
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  payload: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface InboxResponse {
  items: NotificationView[];
  unread_count: number;
  page: number;
  page_size: number;
  total: number;
}

export const notifications = {
  list: (params: { unread_only?: boolean; page?: number; page_size?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.unread_only) qs.append('unread_only', 'true');
    if (params.page) qs.append('page', String(params.page));
    if (params.page_size) qs.append('page_size', String(params.page_size));
    const path = qs.toString() ? `/notifications?${qs.toString()}` : '/notifications';
    return api.get<InboxResponse>(path, { auth: true });
  },
  markRead: (notificationId: string) =>
    api.post(`/notifications/${notificationId}/read`, undefined, { auth: true }),
  markAllRead: () => api.post('/notifications/read-all', undefined, { auth: true }),
};
