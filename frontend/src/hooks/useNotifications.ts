'use client';

import * as React from 'react';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export interface MessageItem {
  id: string;
  senderName: string;
  senderAvatar?: string;
  preview: string;
  href: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsState {
  notifications: NotificationItem[];
  messages: MessageItem[];
  notificationCount: number;
  messageCount: number;
  markNotificationsRead: () => void;
  markMessagesRead: () => void;
}

/**
 * useNotifications
 *
 * Stub hook - counts default to 0 and item lists are empty.
 * Wire `notifications` and `messages` to a real API / WebSocket feed
 * by replacing the useState initialisers below.
 */
export function useNotifications(): NotificationsState {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);

  const notificationCount = notifications.filter((n) => !n.read).length;
  const messageCount = messages.filter((m) => !m.read).length;

  const markNotificationsRead = React.useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markMessagesRead = React.useCallback(() => {
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
  }, []);

  return {
    notifications,
    messages,
    notificationCount,
    messageCount,
    markNotificationsRead,
    markMessagesRead,
  };
}
