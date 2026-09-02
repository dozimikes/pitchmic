'use client';

import * as React from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfileUpdateSchema, type ProfileUpdateInput } from '@/lib/validators';
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { apiGet, apiPatch } from '@/lib/api';
import type { StartupProfile } from '@/lib/types';

export default function CompanyPage() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['startup-profile', 'me'],
    queryFn: () => apiGet<StartupProfile>('/profiles/startup/me/'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Extract<ProfileUpdateInput, { role: 'startup' }>>({
    resolver: zodResolver(ProfileUpdateSchema) as never,
    defaultValues: { role: UserRole.STARTUP },
  });

  // Populate form once data loads
  React.useEffect(() => {
    if (profile) {
      reset({
        role: UserRole.STARTUP,
        startup_name: profile.company_name,
        tagline: profile.tagline,
        description: profile.description,
        website_url: profile.website,
        linkedin_url: profile.linkedin,
        twitter_url: profile.twitter,
        industry: profile.industry,
        location: profile.location,
        founded_year: profile.founded_year,
      } as Extract<ProfileUpdateInput, { role: typeof UserRole.STARTUP }>);
    }
  }, [profile, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: Extract<ProfileUpdateInput, { role: 'startup' }>) =>
      apiPatch('/profiles/startup/me/', {
        company_name: data.startup_name,
        tagline: data.tagline,
        description: data.description,
        website: data.website_url,
        linkedin: data.linkedin_url,
        twitter: data.twitter_url,
        industry: data.industry,
        location: data.location,
        founded_year: data.founded_year,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['startup-profile'] }),
  });

  const onSubmit = handleSubmit((data) => void saveMutation.mutateAsync(data as Extract<ProfileUpdateInput, { role: typeof UserRole.STARTUP }>));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-orange-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-8 text-center text-sm text-red-700">
          Failed to load company profile.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar
          src={profile?.logo_url ?? null}
          alt={profile?.company_name ?? 'Company'}
          fallback={profile?.company_name ?? 'C'}
          size="xl"
          className="border-2 border-slate-200 shadow-sm"
        />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {profile?.company_name ?? 'Company profile'}
            </h1>
            <Badge variant="secondary">
              <Building2 className="mr-1 h-3 w-3" />
              Startup
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{profile?.industry ?? 'No industry set'}</p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Company details</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="co-name">Company name</Label>
                <Input id="co-name" {...register('startup_name')} />
                {errors.startup_name && <p className="text-xs text-red-600">{errors.startup_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-tagline">Tagline</Label>
                <Input id="co-tagline" placeholder="One-liner description" {...register('tagline')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="co-description">About</Label>
              <Textarea id="co-description" rows={4} placeholder="Tell investors about your company…" {...register('description')} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="co-industry">Industry</Label>
                <Input id="co-industry" placeholder="SaaS, Fintech…" {...register('industry')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-location">Location</Label>
                <Input id="co-location" placeholder="City, Country" {...register('location')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-year">Founded year</Label>
                <Input id="co-year" type="number" placeholder="2022" {...register('founded_year')} />
                {errors.founded_year && <p className="text-xs text-red-600">{errors.founded_year.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="co-website">Website</Label>
                <Input id="co-website" type="url" placeholder="https://…" {...register('website_url')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-linkedin">LinkedIn</Label>
                <Input id="co-linkedin" type="url" placeholder="https://linkedin.com/…" {...register('linkedin_url')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-twitter">Twitter / X</Label>
                <Input id="co-twitter" type="url" placeholder="https://x.com/…" {...register('twitter_url')} />
              </div>
            </div>

            {saveMutation.isError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(saveMutation.error as Error).message ?? 'Failed to save changes.'}
              </p>
            )}
            {saveMutation.isSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Company profile updated.
              </p>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button
                type="submit"
                variant="default"
                loading={saveMutation.isPending}
                disabled={!isDirty}
              >
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
