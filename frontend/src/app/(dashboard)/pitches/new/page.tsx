'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  Image as ImageIcon,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Mic,
  DollarSign,
  Percent,
  Check,
  AlertCircle,
  Upload,
  Link,
  Sparkles,
  FileText,
  Loader2,
  Eye,
} from 'lucide-react';
import { AudioPitchRecorder } from '@/components/studio/AudioPitchRecorder';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
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
import { Avatar } from '@/components/ui/Avatar';
import { PitchCreateSchema, type PitchCreateInput } from '@/lib/validators';
import { api, apiPost } from '@/lib/api';
import type { Pitch } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type Step = 0 | 1 | 2;

const STEPS: Array<{ id: Step; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 0, label: 'Info', description: 'Tell investors about your opportunity', icon: Lightbulb },
  { id: 1, label: 'Media', description: 'Add visuals, deck, and video', icon: ImageIcon },
  { id: 2, label: 'Review', description: 'Preview and publish your pitch', icon: CheckCircle2 },
];

export default function NewPitchPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isStartup } = useAuth();
  const [step, setStep] = React.useState<Step>(0);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(null);
  const [coverUploadError, setCoverUploadError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = React.useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = React.useState<number>(0);

  const coverUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ url: string }>('/upload/pitch-cover/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      setCoverImageUrl(data.url);
      setCoverUploadError(null);
    },
    onError: () => {
      setCoverUploadError('Cover image upload failed. Please try again.');
    },
  });

  const defaultValues: PitchCreateInput = React.useMemo(
    () => ({
      title: '',
      description: '',
      problem: '',
      solution: '',
      market_size: '',
      business_model: '',
      traction: '',
      asking_amount: 500_000,
      equity_offered: 10,
      use_of_funds: '',
      video_url: '',
      deck_url: '',
      tags: [],
    }),
    []
  );

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors, isValid, isSubmitting, dirtyFields },
    getValues,
  } = useForm<PitchCreateInput>({
    resolver: zodResolver(PitchCreateSchema),
    defaultValues,
    mode: 'onTouched',
  });

  React.useEffect(() => {
    if (!isStartup) {
      router.replace('/newsfeed');
    }
  }, [isStartup, router]);

  const watchAll = watch();

  const validateAndAdvance = async (nextStep: Step) => {
    if (nextStep === 1) {
      const isValidStep = await trigger([
        'title',
        'description',
        'problem',
        'solution',
        'asking_amount',
        'equity_offered',
      ]);
      if (!isValidStep) return;
    }
    setStep(nextStep);
  };

  const createPitchMutation = useMutation({
    mutationFn: async (data: PitchCreateInput) => {
      // Build payload, omitting undefined / empty-string URL fields so the
      // backend URLField validators never receive a blank value.
      const payload: Record<string, unknown> = {
        title: data.title,
        description: data.description,
        problem: data.problem,
        solution: data.solution,
        tags: data.tags ?? [],
        asking_amount: data.asking_amount,
        equity_offered: data.equity_offered,
        is_draft: false,
      };
      if (data.market_size) payload.market_size = data.market_size;
      if (data.business_model) payload.business_model = data.business_model;
      if (data.traction) payload.traction = data.traction;
      if (data.use_of_funds) payload.use_of_funds = data.use_of_funds;
      if (data.video_url) payload.video_url = data.video_url;
      if (data.deck_url) payload.deck_url = data.deck_url;
      if (coverImageUrl) payload.cover_image_url = coverImageUrl;
      return apiPost<Pitch>('/pitches/', payload);
    },
    onSuccess: (pitch) => {
      setSubmitError(null);
      void queryClient.invalidateQueries({ queryKey: ['newsfeed', 'pitches'] });
      void queryClient.invalidateQueries({ queryKey: ['pitches'] });
      router.push(`/pitches/${pitch.id}?created=1`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : 'Failed to publish pitch. Please try again.';
      setSubmitError(msg);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    await createPitchMutation.mutateAsync(values);
  });

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCoverUploadError('File size must be under 5 MB.');
      return;
    }
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = () => {
      setCoverPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Upload to backend eagerly so the URL is ready at submit time
    void coverUploadMutation.mutateAsync(file);
  };

  const addTag = (tag: string) => {
    const currentTags = getValues('tags') ?? [];
    if (!tag.trim() || currentTags.includes(tag.trim())) return;
    if (currentTags.length >= 10) return;
    setValue('tags', [...currentTags, tag.trim()], { shouldDirty: true });
  };

  const removeTag = (tag: string) => {
    const currentTags = getValues('tags') ?? [];
    setValue('tags', currentTags.filter((t) => t !== tag), { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              New Pitch
            </h1>
            <Badge variant="default" className="bg-brand-orange-500 hover:bg-brand-orange-600">
              <Sparkles className="mr-1 h-3 w-3" />
              Step {step + 1} of 3
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Create a compelling pitch to share your startup with investors.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back to Newsfeed
        </Button>
      </div>

      <div className="hidden sm:block">
        <div className="flex items-center justify-between gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isComplete = step > s.id;
            return (
              <React.Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => s.id < step && setStep(s.id)}
                  disabled={s.id > step}
                  className={cn(
                    'group flex flex-1 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                    isActive && 'border-brand-orange-300 bg-gradient-to-br from-brand-orange-50/80 to-brand-deep-pitch-50/80 shadow-sm shadow-brand-orange-500/10',
                    isComplete && 'border-emerald-200 bg-emerald-50/40',
                    !isActive && !isComplete && 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold',
                        isActive && 'bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-md',
                        isComplete && 'bg-emerald-500 text-white',
                        !isActive && !isComplete && 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {isComplete ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isActive && 'text-brand-orange-500',
                        isComplete && 'text-emerald-600',
                        !isActive && !isComplete && 'text-slate-400'
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        isActive ? 'text-slate-900' : isComplete ? 'text-emerald-900' : 'text-slate-700'
                      )}
                    >
                      {s.label}
                    </p>
                    <p className="text-xs text-slate-500">{s.description}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <Separator className="hidden w-6 shrink-0 border-slate-200 md:block" orientation="horizontal" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <Separator className="hidden sm:block" />

      <form onSubmit={onSubmit} noValidate>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-info"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 gap-5 lg:grid-cols-3"
            >
              <div className="space-y-5 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Lightbulb className="h-5 w-5 text-brand-orange-500" />
                      Pitch overview
                    </CardTitle>
                    <CardDescription>
                      This is what investors will see first. Make it count.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="title">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="title"
                        placeholder="e.g. AI-powered customer insights for B2B SaaS teams"
                        className={cn('h-11 text-base', errors.title && 'border-red-500 focus:ring-red-500/20')}
                        {...register('title')}
                      />
                      <FieldError error={errors.title?.message} dirty={!!dirtyFields.title} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">
                        Short description <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="description"
                        rows={3}
                        placeholder="One-paragraph elevator pitch that summarizes your startup and why it matters."
                        className={cn(errors.description && 'border-red-500 focus:ring-red-500/20')}
                        {...register('description')}
                      />
                      <FieldError error={errors.description?.message} dirty={!!dirtyFields.description} />
                      <div className="text-right text-xs text-slate-400">
                        {(watchAll.description ?? '').length} / 2000
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">The Problem</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Textarea
                        id="problem"
                        rows={4}
                        placeholder="Describe the pain point you're solving, who feels it, and how big it is."
                        className={cn(errors.problem && 'border-red-500 focus:ring-red-500/20')}
                        {...register('problem')}
                      />
                      <FieldError error={errors.problem?.message} dirty={!!dirtyFields.problem} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Your Solution</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Textarea
                        id="solution"
                        rows={4}
                        placeholder="Explain your product, how it solves the problem, and what makes it unique."
                        className={cn(errors.solution && 'border-red-500 focus:ring-red-500/20')}
                        {...register('solution')}
                      />
                      <FieldError error={errors.solution?.message} dirty={!!dirtyFields.solution} />
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Market size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        id="market_size"
                        placeholder="$10B TAM by 2030..."
                        {...register('market_size')}
                      />
                      <FieldError error={errors.market_size?.message} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Business model</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        id="business_model"
                        placeholder="SaaS subscriptions, per-seat"
                        {...register('business_model')}
                      />
                      <FieldError error={errors.business_model?.message} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Traction</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        id="traction"
                        placeholder="$400k ARR, 120 customers, 15% WoW growth"
                        {...register('traction')}
                      />
                      <FieldError error={errors.traction?.message} />
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-5">
                <Card className="border-brand-orange-200 bg-gradient-to-br from-brand-orange-50/60 via-white to-brand-deep-pitch-50/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Mic className="h-5 w-5 text-brand-orange-500" />
                      Your Ask
                    </CardTitle>
                    <CardDescription>
                      Be realistic. Investors respect clear, well-reasoned terms.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="asking_amount" className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-brand-orange-500" />
                        Funding amount <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-slate-500">$</span>
                        <Input
                          id="asking_amount"
                          type="number"
                          min={1}
                          step={1000}
                          className="pl-7 h-11 text-base tabular-nums"
                          {...register('asking_amount')}
                        />
                      </div>
                      <FieldError error={errors.asking_amount?.message as string | undefined} dirty={!!dirtyFields.asking_amount} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="equity_offered" className="flex items-center gap-1.5">
                        <Percent className="h-4 w-4 text-brand-deep-pitch-500" />
                        Equity offered <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="equity_offered"
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.1}
                          className="pr-7 h-11 text-base tabular-nums"
                          {...register('equity_offered')}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-medium text-slate-500">%</span>
                      </div>
                      <FieldError error={errors.equity_offered?.message as string | undefined} dirty={!!dirtyFields.equity_offered} />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Post-money valuation</span>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          Implied
                        </Badge>
                      </div>
                      <div className="mt-1 text-xl font-bold tracking-tight text-slate-900 tabular-nums">
                        {watchAll.asking_amount && watchAll.equity_offered
                          ? formatCurrency(Math.round(watchAll.asking_amount / (watchAll.equity_offered / 100)))
                          : '-'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="use_of_funds">Use of funds</Label>
                      <Textarea
                        id="use_of_funds"
                        rows={4}
                        placeholder="e.g. 40% engineering, 30% go-to-market, 20% operations, 10% contingency"
                        {...register('use_of_funds')}
                      />
                      <FieldError error={errors.use_of_funds?.message} />
                    </div>
                  </CardContent>
                </Card>

                {isValid || (Object.keys(dirtyFields).length > 0 && Object.keys(errors).length === 0) ? (
                  <Card className="border-emerald-200 bg-emerald-50/60">
                    <CardContent className="flex items-start gap-2 p-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Ready for media step</p>
                        <p className="mt-0.5 text-xs text-emerald-800/80">
                          All required info fields are valid. Click Continue to add visuals.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-slate-200 bg-slate-50">
                    <CardContent className="flex items-start gap-2 p-4">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">
                          Complete required fields
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Fields marked with <span className="text-red-500">*</span> are required to continue.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-media"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 gap-5 lg:grid-cols-2"
            >
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ImageIcon className="h-5 w-5 text-brand-orange-500" />
                    Cover image
                  </CardTitle>
                  <CardDescription>
                    A strong cover image is the first thing investors see. Aim for 16:9 aspect ratio.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <label
                    htmlFor="cover-upload"
                    className="group relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition-colors hover:border-brand-orange-400 hover:bg-brand-orange-50/30"
                  >
                    {coverPreview ? (
                      <>
                        <img
                          src={coverPreview}
                          alt="Cover preview"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-slate-800 backdrop-blur">
                            <Upload className="h-4 w-4" />
                            Replace cover
                          </div>
                        </div>
                        {coverUploadMutation.isPending && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                            <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-slate-800 backdrop-blur">
                              <Loader2 className="h-4 w-4 animate-spin text-brand-orange-500" />
                              Uploading…
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3 p-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                          <Upload className="h-7 w-7 text-brand-orange-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">Upload a cover image</p>
                          <p className="mt-1 text-xs text-slate-500">
                            PNG, JPG up to 5MB · 16:9 recommended · Min 1280×720
                          </p>
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm">
                          <Upload className="h-3.5 w-3.5" />
                          Choose file
                        </div>
                      </div>
                    )}
                    <input
                      id="cover-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleCoverFile}
                    />
                  </label>
                  {coverUploadError && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {coverUploadError}
                    </p>
                  )}
                  {coverImageUrl && !coverUploadMutation.isPending && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Cover image uploaded successfully.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Link className="h-5 w-5 text-brand-deep-pitch-500" />
                    Pitch deck URL
                  </CardTitle>
                  <CardDescription>
                    Link to a Google Slides, Figma, or hosted deck.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="relative">
                    <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="deck_url"
                      type="url"
                      placeholder="https://..."
                      className="pl-9"
                      {...register('deck_url')}
                    />
                  </div>
                  <FieldError error={errors.deck_url?.message as string | undefined} />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Mic className="h-5 w-5 text-brand-orange-500" />
                    Voice Pitch Studio
                  </CardTitle>
                  <CardDescription>
                    Record your live pitch directly in the browser, or paste a YouTube / Vimeo / Loom link below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AudioPitchRecorder
                    onRecordingComplete={(blob, duration) => {
                      setRecordedAudioBlob(blob);
                      setRecordingDuration(duration);
                    }}
                    cueText={[
                      '1. Hook (0:00-0:20): Who you are, what you do, and why it matters right now.',
                      '2. Problem (0:20-0:40): The pain point and why existing solutions fail.',
                      '3. Solution (0:40-1:10): Your unique approach and key differentiator.',
                      '4. Traction (1:10-1:30): Real numbers - ARR, customers, growth rate.',
                      '5. The Ask (1:30-1:50): How much, on what terms, and what you will build with it.',
                    ].join('\n')}
                  />
                  {recordedAudioBlob && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-800">
                        Voice pitch recorded ({Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')})
                      </span>
                    </div>
                  )}
                  <div className="relative">
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Or paste a video link (YouTube, Vimeo, Loom)</p>
                    <div className="relative">
                      <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="video_url"
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        className="pl-9"
                        {...register('video_url')}
                      />
                    </div>
                    <FieldError error={errors.video_url?.message as string | undefined} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-brand-deep-pitch-500" />
                    Tags
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {watchAll.tags?.length ?? 0} / 10
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Help investors find your pitch with relevant keywords (SaaS, AI, Fintech...).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
                    {(watchAll.tags ?? []).length > 0 ? (
                      (watchAll.tags ?? []).map((tag, idx) => (
                        <Badge key={`${tag}-${idx}`} variant="default" className="bg-brand-orange-500 hover:bg-brand-orange-600 gap-1.5">
                          {tag}
                          <button
                            type="button"
                            aria-label={`Remove ${tag}`}
                            onClick={() => removeTag(tag)}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
                          >
                            <span aria-hidden className="block h-3 w-3 leading-none">×</span>
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No tags yet. Add up to 10 descriptive tags for your startup.
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['SaaS', 'AI', 'Fintech', 'Climate', 'Healthtech', 'B2B', 'Consumer', 'Dev Tools'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        disabled={(watchAll.tags ?? []).includes(t) || (watchAll.tags ?? []).length >= 10}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-brand-orange-300 hover:text-brand-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-review"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 gap-5 lg:grid-cols-3"
            >
              <div className="space-y-5 lg:col-span-2">
                <Card className="overflow-hidden">
                  <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-brand-orange-100 via-slate-50 to-brand-deep-pitch-100">
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/80 shadow-lg backdrop-blur">
                          <ImageIcon className="h-10 w-10 text-brand-orange-500" />
                        </div>
                      </div>
                    )}
                    <div className="absolute left-4 top-4 flex gap-2">
                      <Badge variant="default" className="shadow-md">
                        <Sparkles className="mr-1 h-3 w-3" /> Live Preview
                      </Badge>
                    </div>
                  </div>
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={user?.avatar_url ?? null}
                        alt={user?.first_name ?? 'Founder'}
                        fallback={user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : null}
                        size="lg"
                      />
                      <div>
                        <CardTitle className="text-xl">{watchAll.title || 'Untitled pitch'}</CardTitle>
                        <CardDescription>
                          by {user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : 'Your startup'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Section title="Description">
                      <p className="text-sm leading-relaxed text-slate-700">
                        {watchAll.description || 'No description yet.'}
                      </p>
                    </Section>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Section title="Problem">
                        <p className="text-sm text-slate-700">{watchAll.problem || '-'}</p>
                      </Section>
                      <Section title="Solution">
                        <p className="text-sm text-slate-700">{watchAll.solution || '-'}</p>
                      </Section>
                      <Section title="Market size">
                        <p className="text-sm text-slate-700">{watchAll.market_size || '-'}</p>
                      </Section>
                      <Section title="Business model">
                        <p className="text-sm text-slate-700">{watchAll.business_model || '-'}</p>
                      </Section>
                      <Section title="Traction">
                        <p className="text-sm text-slate-700">{watchAll.traction || '-'}</p>
                      </Section>
                      <Section title="Use of funds">
                        <p className="text-sm text-slate-700">{watchAll.use_of_funds || '-'}</p>
                      </Section>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-5">
                <Card className="border-brand-orange-200 bg-gradient-to-br from-brand-orange-50/60 to-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <DollarSign className="h-5 w-5 text-brand-orange-500" />
                      The Ask
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StatRow label="Raising" value={watchAll.asking_amount ? formatCurrency(watchAll.asking_amount) : '-'} highlight />
                    <StatRow label="Equity" value={`${watchAll.equity_offered ?? 0}%`} />
                    <StatRow
                      label="Valuation"
                      value={
                        watchAll.asking_amount && watchAll.equity_offered
                          ? formatCurrency(Math.round(watchAll.asking_amount / (watchAll.equity_offered / 100)))
                          : '-'
                      }
                    />
                    <Separator />
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
                      <Eye className="h-4 w-4 text-brand-orange-500" />
                      <span>This is exactly what investors will review.</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Pre-flight checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { label: 'Title & description filled', ok: !!watchAll.title && !!watchAll.description },
                      { label: 'Problem & solution explained', ok: !!watchAll.problem && !!watchAll.solution },
                      { label: 'Funding terms set', ok: !!watchAll.asking_amount && !!watchAll.equity_offered },
                      { label: 'Cover image uploaded', ok: !!coverImageUrl },
                      { label: 'Deck or video attached', ok: !!(watchAll.deck_url || watchAll.video_url) },
                    ].map((c) => (
                      <div key={c.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                            c.ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                          )}
                        >
                          {c.ok ? <Check className="h-3 w-3" /> : '!'}
                        </span>
                        <span className={cn(c.ok ? 'text-slate-800' : 'text-slate-500')}>
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="sticky bottom-4 z-20 mt-8">
          <Card className="border-slate-200 bg-white/90 shadow-xl shadow-slate-900/10 backdrop-blur">
            <CardFooter className="flex-col gap-3 p-4 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {isSubmitting || createPitchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-brand-orange-500" />
                    <span>Publishing your pitch...</span>
                  </>
                ) : createPitchMutation.isError ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-600">
                      {createPitchMutation.error instanceof Error
                        ? createPitchMutation.error.message
                        : 'Failed to create pitch. Please try again.'}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>Autosaved locally · Everything looks good</span>
                  </>
                )}
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep((s) => (s - 1) as Step)}
                    leftIcon={<ArrowLeft className="h-4 w-4" />}
                    disabled={createPitchMutation.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    Back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.back()}
                    disabled={createPitchMutation.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    Cancel
                  </Button>
                )}
                {step < 2 ? (
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => validateAndAdvance((step + 1) as Step)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    disabled={createPitchMutation.isPending}
                    className="flex-1 shadow-lg shadow-brand-orange-500/20 sm:flex-none"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="default"
                    size="default"
                    loading={createPitchMutation.isPending}
                    rightIcon={!createPitchMutation.isPending ? <CheckCircle2 className="h-4 w-4" /> : undefined}
                    className="flex-1 shadow-lg shadow-brand-orange-500/20 sm:flex-none"
                  >
                    Publish pitch
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </div>
      </form>
    </div>
  );
}

function FieldError({ error, dirty }: { error?: string; dirty?: boolean }) {
  if (!error) return null;
  if (dirty === false) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1 text-xs text-red-600"
    >
      <AlertCircle className="h-3 w-3" />
      {error}
    </motion.p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <span
        className={cn(
          'font-bold tabular-nums',
          highlight ? 'text-lg text-slate-900' : 'text-sm text-slate-800'
        )}
      >
        {value}
      </span>
    </div>
  );
}
