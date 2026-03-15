'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Check, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';
import { User } from '@/lib/db/schema';

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const { data, mutate: revalidate } = useSWR<{
    notifications: Notification[];
    unreadCount: number;
  }>(user ? '/api/notifications' : null, fetcher, {
    refreshInterval: 60000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  async function markAsRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    revalidate();
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    revalidate();
  }

  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-teal-600 hover:text-teal-800 font-medium"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto max-h-[320px]">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={() => markAsRead(n.id)}
                onClose={() => setOpen(false)}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({
  notification,
  onRead,
  onClose,
}: {
  notification: Notification;
  onRead: () => void;
  onClose: () => void;
}) {
  const isUnread = !notification.readAt;
  const content = (
    <div
      className={`px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors ${
        isUnread ? 'bg-teal-50/50' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{notification.title}</p>
        {notification.body && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{notification.body}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          {new Date(notification.createdAt).toLocaleDateString()}
        </p>
      </div>
      {isUnread && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRead();
          }}
          className="shrink-0 p-1 rounded hover:bg-teal-100 text-teal-600"
          aria-label="Mark as read"
        >
          <Check className="h-4 w-4" />
        </button>
      )}
      {notification.link && (
        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 self-center" />
      )}
    </div>
  );

  if (notification.link) {
    return (
      <Link
        href={notification.link}
        onClick={() => {
          onRead();
          onClose();
        }}
        className="block border-b border-gray-100 last:border-0"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="block border-b border-gray-100 last:border-0 cursor-default"
      onClick={onRead}
    >
      {content}
    </div>
  );
}
