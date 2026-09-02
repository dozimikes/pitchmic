'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  DollarSign,
  Percent,
  Tag as TagIcon,
  FileText,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { apiGet, apiPatch } from '@/lib/api';
import type { Pitch } from '@/lib/types';
import { PitchCreateSchema, type PitchCreateInput } from '@/lib/validators';
import { cn } from '@/lib/utils';

export default function EditPitchPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pitchId = params?.id as string;

  const [tagInput, setTagInput] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  // Media URL fields not included in the strict form schema — tracked separately
  const [coverImageUrl, setCoverImageUrl] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');

  // Load existing pitch
  const { data: pitch, isLoading, isError } = useQuery({
    queryKey: ['pitch', pitchId],
    queryFn: () => apiGet<Pitch>(`/pitches/${pitchId}/`),
    enabled: !!pitchId,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<PitchCreateInput>({
    resolver: zodResolver(PitchCreateSchema),
  });

  // Populate form once pitch is loaded
  React.useEffect(() => {
    if (pitch) {
      reset({
        title: pitch.title,
        description: pitch.description ?? '',
        problem: pitch.problem ?? '',
        solution: pitch.solution ?? '',
        market_size: pitch.market_size ?? '',
        business_model: pitch.business_model ?? '',
        traction: pitch.traction ?? '',
        use_of_funds: pitch.use_of_funds ?? '',
        asking_amount: pitch.asking_amount ? Number(pitch.asking_amount) : undefined,
        equity_offered: pitch.equity_offered ? Number(pitch.equity_offered) : undefined,
        video_url: pitch.video_url ?? '',
        deck_url: pitch.deck_url ?? '',
      });
      setTags(pitch.tags ?? []);
      setCoverImageUrl(pitch.cover_image_url ?? '');
      setImageUrl(pitch.image_url ?? '');
    }
  }, [pitch, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<PitchCreateInput> & { tags?: string[]; cover_image_url?: string; image_url?: string }) =>
      apiPatch<Pitch>(`/pitches/${pitchId}/`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['pitch', pitchId], updated);
      queryClient.invalidateQueries({ queryKey: ['pitches'] });
      setSaved(true);
      setSubmitError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: Error) => {
      setSubmitError(err.message || 'Failed to save changes. Please try again.');
    },
  });

  const onSubmit = handleSubmit((data) => {
    setSubmitError(null);
    updateMutation.mutate({ ...data, tags, cover_image_url: coverImageUrl, image_url: imageUrl });
  });

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-orange-500 mx-auto" />
          <p className="text-sm text-slate-500">Loading pitch…</p>
        </div>
      </div>
    );
  }

  if (isError || !pitch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-slate-600">Could not load pitch for editing.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/pitches/${pitchId}`)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Edit Pitch</h1>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{pitch.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/pitches/${pitchId}`)}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={updateMutation.isPending || (!isDirty && tags === pitch.tags)}
            className="shadow-md shadow-brand-orange-500/20 min-w-[100px]"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-400" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {submitError}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Core Details */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-orange-500" />
              Core Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="edit-title" className="text-sm font-semibold text-slate-700 mb-1.5 block">
                Pitch Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-title"
                placeholder="e.g. Kipawa — Agency Banking & Logistics Platform for Africa"
                {...register('title')}
                className={cn(errors.title && 'border-red-300 focus:ring-red-500')}
              />
              {errors.title && (
                <p className="mt-1.5 text-xs text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="edit-description" className="text-sm font-semibold text-slate-700 mb-1.5 block">
                Overview / Description
              </Label>
              <Textarea
                id="edit-description"
                rows={4}
                placeholder="Brief overview of your startup, what you do, and who you serve…"
                {...register('description')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pitch Narrative */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900">Pitch Narrative</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Answer each section to strengthen your pitch scorecard.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { id: 'problem', label: 'The Problem', placeholder: 'What specific problem are you solving? For who?' },
              { id: 'solution', label: 'Your Solution', placeholder: 'How does your product/service solve this?' },
              { id: 'market_size', label: 'Market Size (SAM/TAM/SOM)', placeholder: 'Quantify your addressable market with data…' },
              { id: 'business_model', label: 'Business Model', placeholder: 'How do you make money? Revenue streams, pricing…' },
              { id: 'traction', label: 'Traction & Metrics', placeholder: 'ARR, MRR, active users, growth rate, key partnerships…' },
              { id: 'use_of_funds', label: 'Use of Funds', placeholder: 'How will you allocate the investment round…' },
            ].map((field, idx) => (
              <div key={field.id}>
                {idx > 0 && <Separator className="mb-5" />}
                <Label htmlFor={`edit-${field.id}`} className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  {field.label}
                </Label>
                <Textarea
                  id={`edit-${field.id}`}
                  rows={3}
                  placeholder={field.placeholder}
                  {...register(field.id as keyof PitchCreateInput)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Funding Terms */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-brand-orange-500" />
              Funding Terms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-asking" className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  Asking Amount (USD)
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="edit-asking"
                    type="number"
                    step="1000"
                    min={0}
                    placeholder="500000"
                    className="pl-8"
                    {...register('asking_amount', { valueAsNumber: true })}
                  />
                </div>
                {errors.asking_amount && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.asking_amount.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-equity" className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  Equity Offered (%)
                </Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="edit-equity"
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    placeholder="10"
                    className="pl-8"
                    {...register('equity_offered', { valueAsNumber: true })}
                  />
                </div>
                {errors.equity_offered && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.equity_offered.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Media & Links */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900">Media & Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'video_url', label: 'Pitch Video URL', placeholder: 'https://youtube.com/…' },
              { id: 'deck_url', label: 'Pitch Deck URL', placeholder: 'https://docsend.com/…' },
            ].map((field) => (
              <div key={field.id}>
                <Label htmlFor={`edit-${field.id}`} className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  {field.label}
                </Label>
                <Input
                  id={`edit-${field.id}`}
                  type="url"
                  placeholder={field.placeholder}
                  {...register(field.id as keyof PitchCreateInput)}
                />
              </div>
            ))}
            {/* Extra media fields not in strict schema — managed via local state */}
            <div>
              <Label htmlFor="edit-cover-image-url" className="text-sm font-semibold text-slate-700 mb-1.5 block">
                Cover Image URL
              </Label>
              <Input
                id="edit-cover-image-url"
                type="url"
                placeholder="https://…/cover.jpg"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tags */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-brand-orange-500" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                id="edit-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag and press Enter (e.g. fintech, saas, b2b)"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addTag} size="sm">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1.5 pr-1.5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="h-3.5 w-3.5 rounded-full hover:bg-slate-300 flex items-center justify-center transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Up to 10 tags. Used for VC search and discovery filtering.
            </p>
          </CardContent>
        </Card>

        {/* Sticky save footer */}
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur shadow-lg px-4 py-3 flex items-center gap-3">
            {saved && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> All changes saved
              </span>
            )}
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="shadow-md shadow-brand-orange-500/20 min-w-[120px]"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
