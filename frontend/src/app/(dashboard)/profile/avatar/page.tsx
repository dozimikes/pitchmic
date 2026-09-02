'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  User,
  Sparkles,
  RotateCw,
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
import { Avatar } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { apiPatch } from '@/lib/api';

const PRESET_GRADIENTS = [
  'from-brand-orange-400 to-brand-deep-pitch-500',
  'from-rose-400 to-orange-500',
  'from-amber-400 to-red-500',
  'from-emerald-400 to-teal-500',
  'from-sky-400 to-blue-600',
  'from-indigo-400 to-purple-600',
  'from-fuchsia-400 to-pink-500',
  'from-slate-500 to-slate-800',
];

interface AvatarState {
  file: File | null;
  previewUrl: string | null;
  currentUrl: string | null;
}

export default function AvatarUploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [state, setState] = React.useState<AvatarState>({
    file: null,
    previewUrl: null,
    currentUrl: user?.avatar_url ?? null,
  });  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [rotate, setRotate] = React.useState(0);

  React.useEffect(() => {
    setState((s) => ({ ...s, currentUrl: user?.avatar_url ?? null }));
  }, [user?.avatar_url]);

  React.useEffect(() => {
    return () => {
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    };
  }, [state.previewUrl]);

  const fullName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.email;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    const url = URL.createObjectURL(file);
    setState({ file, previewUrl: url, currentUrl: state.currentUrl });
    setSelectedPreset(null);
    setZoom(1);
    setRotate(0);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleChoose = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ file: null, previewUrl: null, currentUrl: state.currentUrl });
    setSelectedPreset(null);
    setZoom(1);
    setRotate(0);
  };

  const handlePreset = (gradient: string) => {
    setSelectedPreset(gradient);
    setState({ file: null, previewUrl: null, currentUrl: state.currentUrl });
    setZoom(1);
    setRotate(0);
  };

  const handleRotate = () => {
    setRotate((r) => (r + 90) % 360);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (state.file) {
        formData.append('avatar', state.file);
      }
      if (selectedPreset) {
        formData.append('avatar_preset', selectedPreset);
      }
      return apiPatch('/me/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: async (data) => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      const payload = data as { avatar_url?: string };
      if (user) {
        refreshUser({ ...user, avatar_url: payload.avatar_url ?? user.avatar_url });
      }
    },
  });

  const hasChanges = state.file !== null || selectedPreset !== null;
  const previewSrc = state.previewUrl ?? (selectedPreset ? null : state.currentUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Avatar
            </h1>
            <Badge variant="default" className="bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600">
              <Sparkles className="mr-1 h-3 w-3" />
              Profile Settings
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Upload a professional photo. Clear, recognizable avatars build trust.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/profile/edit')}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back to profile
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-5">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
              <div className="relative flex aspect-square items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-brand-orange-50 p-6 md:aspect-auto">
                <div className="relative">
                  <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-brand-orange-400/30 to-brand-deep-pitch-500/30 blur-2xl" />
                  <motion.div
                    className={cn(
                      'relative h-56 w-56 overflow-hidden rounded-full border-4 border-white shadow-2xl shadow-slate-900/10',
                      selectedPreset && `bg-gradient-to-br ${selectedPreset}`
                    )}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt="Avatar preview"
                        className="h-full w-full object-cover transition-transform"
                        style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
                      />
                    ) : selectedPreset ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <User className="h-24 w-24 text-white/80" />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Avatar
                          src={null}
                          alt={fullName ?? 'User'}
                          fallback={fullName ?? null}
                          size="xl"
                          className="h-full w-full"
                        />
                      </div>
                    )}
                  </motion.div>
                  <button
                    type="button"
                    onClick={handleChoose}
                    aria-label="Take or upload photo"
                    className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <CardHeader className="p-0">
                  <CardTitle className="text-lg">Upload a photo</CardTitle>
                  <CardDescription>
                    PNG, JPG, or WEBP · Square crop · Up to 5MB
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
                    aria-label="Upload avatar image"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10 transition-transform group-hover:scale-105">
                      <Upload className="h-7 w-7 text-brand-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {isDragging ? 'Drop your image here' : 'Drag & drop or click to upload'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Square photos work best · We&apos;ll crop for you
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>

                {state.file && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                        <ImageIcon className="h-5 w-5 text-brand-orange-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{state.file.name}</p>
                        <p className="text-xs text-slate-500">
                          {(state.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50"
                        onClick={handleClear}
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600">Zoom</p>
                        <input
                          type="range"
                          min={1}
                          max={1.8}
                          step={0.05}
                          value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          className="h-2 w-full cursor-pointer accent-brand-orange-500"
                        />
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRotate}
                          leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                        >
                          Rotate
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-brand-orange-500" />
                Quick gradient avatars
              </CardTitle>
              <CardDescription>
                No photo? Pick a preset. Your initials will appear over the gradient.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                {PRESET_GRADIENTS.map((gradient) => {
                  const active = selectedPreset === gradient;
                  return (
                    <button
                      key={gradient}
                      type="button"
                      onClick={() => handlePreset(gradient)}
                      aria-label={`Choose preset gradient ${gradient}`}
                      className={cn(
                        'group relative flex aspect-square items-center justify-center rounded-2xl transition-all',
                        'bg-gradient-to-br',
                        gradient,
                        active
                          ? 'scale-105 ring-4 ring-brand-orange-300 shadow-lg shadow-brand-orange-500/20'
                          : 'ring-1 ring-white shadow-sm hover:scale-105 hover:shadow-md'
                      )}
                    >
                      <span className="text-sm font-bold text-white/90">
                        {fullName?.slice(0, 2).toUpperCase() ?? 'PM'}
                      </span>
                      {active && (
                        <div className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow-lg">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Card className="border-brand-orange-200 bg-gradient-to-br from-brand-orange-50/60 to-white">
            <CardHeader>
              <CardTitle className="text-base">Before you save</CardTitle>
              <CardDescription>A quick checklist for a great avatar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                'Use a real photo of you (not a logo — that goes on Company Logo).',
                'Crop tightly around your face and shoulders.',
                'Make sure the background is clean and not distracting.',
                'Good lighting, natural smile, eye contact = trust.',
                'Square crop works best across all screens.',
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
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>How you&apos;ll appear to others.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={previewSrc}
                    alt={fullName ?? 'You'}
                    fallback={fullName ?? null}
                    size="lg"
                    className={cn(selectedPreset && !previewSrc && `bg-gradient-to-br ${selectedPreset}`)}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">{fullName}</p>
                    <p className="text-xs text-slate-500">
                      {user?.email}
                    </p>
                  </div>
                  <Badge variant="default" className="ml-auto bg-brand-deep-pitch-500">
                    {user?.role === 'startup' ? 'Founder' : 'Investor'}
                  </Badge>
                </div>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Avatar
                    src={previewSrc}
                    alt="small"
                    fallback={fullName ?? null}
                    size="sm"
                    className={cn(selectedPreset && !previewSrc && `bg-gradient-to-br ${selectedPreset}`)}
                  />
                  <span>Comment thread</span>
                  <Avatar
                    src={previewSrc}
                    alt="tiny"
                    fallback={fullName ?? null}
                    size="sm"
                    className={cn('ml-auto', selectedPreset && !previewSrc && `bg-gradient-to-br ${selectedPreset}`)}
                  />
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
                {uploadMutation.isPending ? 'Saving avatar...' : 'Save avatar'}
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
                      : 'Failed to upload avatar. Please try again.'}
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
                  <span>Avatar updated successfully.</span>
                </motion.div>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
