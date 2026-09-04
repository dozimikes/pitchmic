'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Upload,
  Building2,
  Image as ImageIcon,
  Trash2,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { apiGet, apiPatch } from '@/lib/api';
import type { StartupProfile } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';

const PRESET_BRANDS = [
  { from: 'from-brand-orange-500', to: 'to-amber-500', label: 'Sunrise' },
  { from: 'from-brand-deep-pitch-500', to: 'to-indigo-600', label: 'Pitch' },
  { from: 'from-emerald-500', to: 'to-teal-600', label: 'Forest' },
  { from: 'from-sky-500', to: 'to-blue-700', label: 'Ocean' },
  { from: 'from-rose-500', to: 'to-pink-600', label: 'Rouge' },
  { from: 'from-slate-700', to: 'to-slate-950', label: 'Slate' },
];

export default function CompanyLogoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isStartup, isInvestor } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [startupName, setStartupName] = React.useState<string>('');
  const [currentLogo, setCurrentLogo] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isInvestor) {
      router.replace('/profile/edit');
    }
  }, [isInvestor, router]);

  React.useEffect(() => {
    if (!isStartup) return;
    let cancelled = false;
    const load = async () => {
      try {
        const p = await apiGet<StartupProfile>('/me/startup-profile/');
        if (!cancelled) {
          setStartupName(p.company_name ?? p.startup_name ?? '');
          setCurrentLogo(p.logo_url ?? null);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isStartup]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith('image/')) return;
    if (f.size > 5 * 1024 * 1024) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleChoose = () => fileInputRef.current?.click();

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (file) formData.append('logo', file);
      return apiPatch('/me/startup-profile/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  if (isInvestor) return null;

  const hasChanges = file !== null;
  const displaySrc = previewUrl ?? currentLogo;
  const fullName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.email;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Company logo
            </h1>
            <Badge variant="default" className="bg-brand-orange-500 hover:bg-brand-orange-600">
              <Building2 className="mr-1 h-3 w-3" /> Startup brand
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            A great logo builds instant recognition. Upload yours or pick a branded placeholder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/profile/edit')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back to profile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/profile/avatar')}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Avatar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-5">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
              <div className="relative flex aspect-square items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-deep-pitch-50 p-8 md:aspect-auto">
                <div className="relative w-full max-w-[260px]">
                  <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-brand-orange-500/20 via-transparent to-brand-deep-pitch-500/20 blur-2xl" />
                  <motion.div
                    className={cn(
                      'relative mx-auto flex aspect-square items-center justify-center overflow-hidden rounded-3xl border-4 border-white shadow-2xl shadow-slate-900/10'
                    )}
                    whileHover={{ y: -3 }}
                  >
                    {displaySrc ? (
                      <img
                        src={displaySrc}
                        alt="Company logo preview"
                        className="h-full w-full object-contain bg-white"
                      />
                    ) : startupName ? (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600 px-6 text-center">
                        <span className="truncate text-3xl font-black uppercase tracking-tight text-white drop-shadow-lg">
                          {startupName.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-400">
                        <Building2 className="h-16 w-16 text-white/80" />
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>

              <div className="p-6">
                <CardHeader className="p-0">
                  <CardTitle className="text-lg">Upload your logo</CardTitle>
                  <CardDescription>
                    Transparent PNG or SVG · Up to 5MB · Square works best
                  </CardDescription>
                </CardHeader>

                <div className="mt-5">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={handleChoose}
                    className={cn(
                      'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all',
                      isDragging
                        ? 'border-brand-orange-400 bg-brand-orange-50/70'
                        : 'border-slate-300 bg-slate-50/50 hover:border-brand-orange-300 hover:bg-brand-orange-50/30'
                    )}
                    role="button"
                    tabIndex={0}
                    aria-label="Upload company logo"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10 transition-transform group-hover:scale-105">
                      <Upload className="h-7 w-7 text-brand-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {isDragging ? 'Drop your logo here' : 'Click or drag your logo'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Transparent PNG, SVG, or JPG · up to 5 MB
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>

                {file && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                      <ImageIcon className="h-5 w-5 text-brand-orange-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:bg-red-50"
                      onClick={handleClear}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </motion.div>
                )}

                <Separator className="my-6" />

                <div>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Sparkles className="h-3.5 w-3.5 text-brand-orange-500" />
                    Or use a branded placeholder
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PRESET_BRANDS.map((brand) => (
                      <button
                        key={brand.label}
                        type="button"
                        onClick={() => {
                          setFile(null);
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                        }}
                        className={cn(
                          'group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl transition-all hover:scale-[1.02]',
                          'bg-gradient-to-br',
                          brand.from,
                          brand.to
                        )}
                      >
                        <span className="text-2xl font-black uppercase tracking-tight text-white/95 drop-shadow-md">
                          {startupName.slice(0, 2).toUpperCase() || 'PM'}
                        </span>
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                          {brand.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!file && (
                    <p className="mt-3 text-xs text-slate-500">
                      Tip: Branded placeholders look great until you upload a final logo.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Card className="border-brand-deep-pitch-200 bg-gradient-to-br from-brand-deep-pitch-50/60 to-white">
            <CardHeader>
              <CardTitle className="text-base">What makes a great logo?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                'Use a transparent PNG or SVG so it works on any background.',
                'Square aspect ratio · your logo will be shown in circles, cards, and lists.',
                'Avoid tiny text or intricate detail - it won\';t read at small sizes.',
                'If you don\'t have a logo yet, a wordmark or simple monogram works well.',
                'Keep it legible at 32×32px (the size it appears in a feed).',
              ].map((tip) => (
                <div key={tip} className="flex items-start gap-2 rounded-lg bg-white/80 p-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">{tip}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="text-base">Preview in context</CardTitle>
              <CardDescription>How your startup will appear.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-200',
                        !displaySrc && 'bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600'
                      )}
                    >
                      {displaySrc ? (
                        <img src={displaySrc} alt="logo" className="h-full w-full object-contain bg-white" />
                      ) : (
                        <span className="text-sm font-black text-white">
                          {startupName.slice(0, 2).toUpperCase() || 'PM'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {startupName || 'Your Startup Name'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        AI-powered insights for B2B SaaS teams
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pitch card header
                  </p>
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white shadow-sm',
                        !displaySrc && 'bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600'
                      )}
                    >
                      {displaySrc ? (
                        <img src={displaySrc} alt="logo" className="h-full w-full object-contain bg-white" />
                      ) : (
                        <span className="text-[10px] font-black text-white">
                          {startupName.slice(0, 2).toUpperCase() || 'PM'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {startupName || 'Your Startup'}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">San Francisco, CA · SaaS</p>
                    </div>
                    <Avatar
                      src={user?.avatar_url ?? null}
                      alt={fullName ?? 'Founder'}
                      fallback={fullName ?? null}
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button
                variant="default"
                size="lg"
                className="w-full shadow-lg shadow-brand-orange-500/20"
                loading={uploadMutation.isPending}
                leftIcon={<Save className="h-4 w-4" />}
                disabled={!hasChanges || uploadMutation.isPending}
                onClick={() => void uploadMutation.mutateAsync()}
              >
                {uploadMutation.isPending ? 'Saving logo...' : 'Save logo'}
              </Button>
              <div className="flex w-full gap-2">
                <Button variant="ghost" className="flex-1" onClick={handleClear} disabled={!hasChanges}>
                  Reset
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => router.push('/profile/edit')}>
                  Cancel
                </Button>
              </div>
              {uploadMutation.isError && (
                <div className="flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>
                    {uploadMutation.error instanceof Error
                      ? uploadMutation.error.message
                      : 'Failed to upload logo. Please try again.'}
                  </span>
                </div>
              )}
              {uploadMutation.isSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Company logo saved. Nice brand!</span>
                </motion.div>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
