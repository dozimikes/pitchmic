'use client';

import * as React from 'react';
import { Settings, Bell, Shield, LogOut, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { useAuth } from '@/hooks/useAuth';
import { apiPost } from '@/lib/api';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try { await apiPost('/auth/logout/', {}); } catch { /* best-effort */ }
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    },
    onSuccess: () => {
      logout();
      router.replace('/sign-in');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">Manage your account, notifications, and security.</p>
      </div>

      {/* Account info */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-brand-orange-500" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0">
          <SettingRow label="Email" value={user?.email ?? '-'} />
          <SettingRow label="Role" value={
            <Badge variant="secondary" className="capitalize">{user?.role ?? '-'}</Badge>
          } />
          <SettingRow
            label="Email verified"
            value={
              user?.is_verified
                ? <Badge variant="success">Verified</Badge>
                : <Badge variant="warning">Pending</Badge>
            }
          />
        </CardContent>
      </Card>

      {/* Notifications stub */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-brand-deep-pitch-500" />
            Notifications
            <Badge variant="secondary" className="ml-1">Coming soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-slate-500">
          Granular notification controls (email, in-app, digest frequency) are coming in the next release.
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader className="border-b border-red-100 pb-4">
          <CardTitle className="text-base text-red-700">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <Separator className="mb-4" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Sign out everywhere</p>
              <p className="text-xs text-slate-500">Revokes your session on this device.</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              loading={logoutMutation.isPending}
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={() => void logoutMutation.mutateAsync()}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
