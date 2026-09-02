'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User as UserIcon,
  Building2,
  Globe,
  Linkedin,
  Twitter,
  Briefcase,
  MapPin,
  Calendar,
  Users,
  DollarSign,
  Sparkles,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Avatar } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';
import { ProfileUpdateSchema, type ProfileUpdateInput } from '@/lib/validators';
import { UserRole, type StartupProfile, type InvestorProfile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { apiGet, apiPatch } from '@/lib/api';

export default function EditProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isStartup, isInvestor, refreshUser } = useAuth();
  const [savedFlash, setSavedFlash] = React.useState(false);

  const role = isStartup ? UserRole.STARTUP : UserRole.INVESTOR;

  const profileQuery = useQuery({
    queryKey: ['profile', role],
    queryFn: async () => {
      if (isStartup) {
        return apiGet<StartupProfile>('/me/startup-profile/');
      }
      return apiGet<InvestorProfile>('/me/investor-profile/');
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const profile = profileQuery.data;

  const getDefaultValues = (): ProfileUpdateInput => {
    if (isStartup) {
      const p = profile as StartupProfile | undefined;
      return {
        role: UserRole.STARTUP,
        startup_name: p?.company_name ?? '',
        tagline: p?.tagline ?? undefined,
        description: p?.description ?? undefined,
        website_url: p?.website ?? undefined,
        linkedin_url: p?.linkedin ?? undefined,
        twitter_url: p?.twitter ?? undefined,
        industry: p?.industry ?? undefined,
        stage: undefined,
        location: p?.location ?? undefined,
        founded_year: p?.founded_year ?? undefined,
        number_of_employees: undefined,
        funding_raised: undefined,
      };
    }
    const p = profile as InvestorProfile | undefined;
    return {
      role: UserRole.INVESTOR,
      company_name: p?.company_name ?? undefined,
      position: p?.title ?? undefined,
      bio: p?.bio ?? undefined,
      website_url: p?.website ?? undefined,
      linkedin_url: p?.linkedin ?? undefined,
      twitter_url: p?.twitter ?? undefined,
      niche: p?.niche ?? undefined,
      investment_stage: [],
      minimum_investment: p?.investment_range_min ? Number(p.investment_range_min) : undefined,
      maximum_investment: p?.investment_range_max ? Number(p.investment_range_max) : undefined,
    };
  };

  const initialDefault = getDefaultValues();
  const isStartupProfile = isStartup;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
    watch,
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(ProfileUpdateSchema as never),
    defaultValues: initialDefault as never,
    values: initialDefault as never,
    mode: 'onTouched',
  });

  React.useEffect(() => {
    if (profile) {
      reset(getDefaultValues() as never);
    }
    void profile;
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (values: ProfileUpdateInput) => {
      const payload: Record<string, unknown> = { ...values };
      if ('role' in payload) delete payload.role;
      return apiPatch(
        isStartupProfile ? '/me/startup-profile/' : '/me/investor-profile/',
        payload
      );
    },
    onSuccess: async () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3500);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (user) {
        refreshUser(user);
      }
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await updateMutation.mutateAsync(values);
  });

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
              Edit profile
            </h1>
            <Badge
              variant="default"
              className={cn(
                isStartupProfile
                  ? 'bg-brand-orange-500 hover:bg-brand-orange-600'
                  : 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600'
              )}
            >
              {isStartupProfile ? (
                <><Building2 className="mr-1 h-3 w-3" /> Startup</>
              ) : (
                <><Briefcase className="mr-1 h-3 w-3" /> Investor</>
              )}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Update your public profile. Complete profiles get 3× more engagement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkOrButton
            href="/profile/avatar"
            leftIcon={<UserIcon className="h-4 w-4" />}
            variant="outline"
          >
            Avatar
          </LinkOrButton>
          {isStartupProfile && (
            <LinkOrButton
              href="/profile/logo"
              leftIcon={<Building2 className="h-4 w-4" />}
              variant="outline"
            >
              Company Logo
            </LinkOrButton>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-brand-orange-50 via-white to-brand-deep-pitch-50">
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          <Avatar
            src={user?.avatar_url ?? null}
            alt={fullName ?? 'You'}
            fallback={fullName ?? null}
            size="xl"
            className="ring-4 ring-white shadow-xl"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900">
              {fullName}
            </h2>
            <p className="truncate text-sm text-slate-600">{user?.email}</p>
            {Boolean(isStartupProfile && profile && 'startup_name' in profile && profile.startup_name) && (
              <p className="mt-1 truncate text-sm font-semibold text-brand-orange-600">
                {(profile as any).startup_name}
              </p>
            )}
            {Boolean(isInvestor && profile && 'company_name' in profile && profile.company_name) && (
              <p className="mt-1 truncate text-sm font-semibold text-brand-deep-pitch-600">
                {(profile as any).company_name}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge variant="secondary" className="bg-white/80 text-slate-700">
                <Sparkles className="mr-1 h-3 w-3" />
                Profile strength: {isDirty ? 'Updating...' : 'Good'}
              </Badge>
              <AnimatedSaveFlash show={savedFlash} />
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserIcon className="h-5 w-5 text-brand-orange-500" />
                  Basic info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {isStartupProfile ? (
                  <>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field
                        label="Startup name"
                        required
                        icon={<Building2 className="h-4 w-4 text-slate-400" />}
                        error={errorFor(errors, 'startup_name')}
                      >
                        <Input
                          id="startup_name"
                          placeholder="Acme, Inc."
                          className="pl-9"
                          {...(register as (name: 'startup_name') => Record<string, unknown>)('startup_name')}
                        />
                      </Field>
                      <Field label="Tagline" icon={<Sparkles className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'tagline')}>
                        <Input
                          id="tagline"
                          placeholder="Customer insights, supercharged."
                          className="pl-9"
                          {...(register as (name: 'tagline') => Record<string, unknown>)('tagline')}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Company description"
                      icon={<Globe className="h-4 w-4 text-slate-400" />}
                      error={errorFor(errors, 'description')}
                    >
                      <Textarea
                        id="description"
                        rows={4}
                        placeholder="What do you do, who do you serve, and why does it matter?"
                        className="pl-9 pt-2.5"
                        {...(register as (name: 'description') => Record<string, unknown>)('description')}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field
                        label="Firm / company name"
                        icon={<Building2 className="h-4 w-4 text-slate-400" />}
                        error={errorFor(errors, 'company_name')}
                      >
                        <Input
                          id="company_name"
                          placeholder="Northwind Capital"
                          className="pl-9"
                          {...(register as (name: 'company_name') => Record<string, unknown>)('company_name')}
                        />
                      </Field>
                      <Field
                        label="Your position"
                        icon={<Briefcase className="h-4 w-4 text-slate-400" />}
                        error={errorFor(errors, 'position')}
                      >
                        <Input
                          id="position"
                          placeholder="General Partner"
                          className="pl-9"
                          {...(register as (name: 'position') => Record<string, unknown>)('position')}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Bio"
                      icon={<UserIcon className="h-4 w-4 text-slate-400" />}
                      error={errorFor(errors, 'bio')}
                    >
                      <Textarea
                        id="bio"
                        rows={4}
                        placeholder="Tell founders about yourself, your thesis, and what you look for."
                        className="pl-9 pt-2.5"
                        {...(register as (name: 'bio') => Record<string, unknown>)('bio')}
                      />
                    </Field>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-brand-deep-pitch-500" />
                  Links & social
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <Field label="Website" icon={<Globe className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'website_url')}>
                  <Input
                    id="website_url"
                    type="url"
                    placeholder="https://..."
                    className="pl-9"
                    {...(register as (name: 'website_url') => Record<string, unknown>)('website_url')}
                  />
                </Field>
                <Field label="LinkedIn" icon={<Linkedin className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'linkedin_url')}>
                  <Input
                    id="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    className="pl-9"
                    {...(register as (name: 'linkedin_url') => Record<string, unknown>)('linkedin_url')}
                  />
                </Field>
                <Field label="Twitter / X" icon={<Twitter className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'twitter_url')}>
                  <Input
                    id="twitter_url"
                    type="url"
                    placeholder="https://x.com/..."
                    className="pl-9"
                    {...(register as (name: 'twitter_url') => Record<string, unknown>)('twitter_url')}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-brand-orange-500" />
                  {isStartupProfile ? 'Startup details' : 'Investment focus'}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
                {isStartupProfile ? (
                  <>
                    <Field label="Industry" icon={<Briefcase className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'industry')}>
                      <Input
                        id="industry"
                        placeholder="SaaS, Fintech..."
                        className="pl-9"
                        {...(register as (name: 'industry') => Record<string, unknown>)('industry')}
                      />
                    </Field>
                    <Field label="Stage" icon={<Sparkles className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'stage')}>
                      <Input
                        id="stage"
                        placeholder="Pre-seed, Seed..."
                        className="pl-9"
                        {...(register as (name: 'stage') => Record<string, unknown>)('stage')}
                      />
                    </Field>
                    <Field label="Location" icon={<MapPin className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'location')}>
                      <Input
                        id="location"
                        placeholder="San Francisco, CA"
                        className="pl-9"
                        {...(register as (name: 'location') => Record<string, unknown>)('location')}
                      />
                    </Field>
                    <Field label="Founded year" icon={<Calendar className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'founded_year')}>
                      <Input
                        id="founded_year"
                        type="number"
                        min={1900}
                        max={new Date().getFullYear()}
                        className="pl-9"
                        {...(register as (name: 'founded_year') => Record<string, unknown>)('founded_year')}
                      />
                    </Field>
                    <Field label="Team size" icon={<Users className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'number_of_employees')}>
                      <Input
                        id="number_of_employees"
                        type="number"
                        min={0}
                        placeholder="12"
                        className="pl-9"
                        {...(register as (name: 'number_of_employees') => Record<string, unknown>)('number_of_employees')}
                      />
                    </Field>
                    <Field label="Total raised" icon={<DollarSign className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'funding_raised')}>
                      <Input
                        id="funding_raised"
                        type="number"
                        min={0}
                        placeholder="1200000"
                        className="pl-9"
                        {...(register as (name: 'funding_raised') => Record<string, unknown>)('funding_raised')}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Niche / thesis" icon={<Briefcase className="h-4 w-4 text-slate-400" />} error={errorFor(errors, 'niche')}>
                      <Input
                        id="niche"
                        placeholder="Developer tools, B2B SaaS"
                        className="pl-9"
                        {...(register as (name: 'niche') => Record<string, unknown>)('niche')}
                      />
                    </Field>
                    <Field
                      label="Min investment ($)"
                      icon={<DollarSign className="h-4 w-4 text-slate-400" />}
                      error={errorFor(errors, 'minimum_investment')}
                    >
                      <Input
                        id="minimum_investment"
                        type="number"
                        min={0}
                        placeholder="25000"
                        className="pl-9"
                        {...(register as (name: 'minimum_investment') => Record<string, unknown>)('minimum_investment')}
                      />
                    </Field>
                    <Field
                      label="Max investment ($)"
                      icon={<DollarSign className="h-4 w-4 text-slate-400" />}
                      error={errorFor(errors, 'maximum_investment')}
                    >
                      <Input
                        id="maximum_investment"
                        type="number"
                        min={0}
                        placeholder="500000"
                        className="pl-9"
                        {...(register as (name: 'maximum_investment') => Record<string, unknown>)('maximum_investment')}
                      />
                    </Field>
                    <div className="sm:col-span-2 md:col-span-3">
                      <Label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <Sparkles className="h-4 w-4 text-brand-deep-pitch-500" />
                        Stages you invest in
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {['Pre-seed', 'Seed', 'Series A', 'Series B', 'Growth', 'Late stage'].map((s) => {
                          const stages = watch('investment_stage' as never) as string[] | undefined;
                          const checked = stages?.includes(s) ?? false;
                          return (
                            <label
                              key={s}
                              className={cn(
                                'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                                checked
                                  ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              )}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                {...(register as (name: 'investment_stage') => Record<string, unknown>)('investment_stage')}
                                value={s}
                              />
                              {s}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-brand-deep-pitch-200 bg-gradient-to-br from-brand-deep-pitch-50/60 to-white">
              <CardHeader>
                <CardTitle className="text-base">Pro tips</CardTitle>
                <CardDescription>
                  Founders &amp; investors with complete profiles receive far more inbound.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                {[
                  'Add a clear profile photo investors will recognize.',
                  'Write a specific, benefit-forward tagline or bio.',
                  'Links to your website and socials build credibility.',
                  'Be honest about stage, traction, and check sizes.',
                ].map((tip) => (
                  <div key={tip} className="flex items-start gap-2 rounded-lg bg-white/70 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{tip}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full shadow-lg shadow-brand-orange-500/20"
                  loading={isSubmitting || updateMutation.isPending}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="w-full"
                  onClick={() => router.push('/profile/avatar')}
                  leftIcon={<UserIcon className="h-4 w-4" />}
                >
                  Update avatar
                  <ArrowRight className="ml-auto h-4 w-4" />
                </Button>
                {isStartupProfile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="w-full"
                    onClick={() => router.push('/profile/logo')}
                    leftIcon={<Building2 className="h-4 w-4" />}
                  >
                    Upload company logo
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </Button>
                )}
              </CardContent>
              {updateMutation.isError && (
                <CardFooter>
                  <div className="flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <span>
                      {updateMutation.error instanceof Error
                        ? updateMutation.error.message
                        : 'Could not save profile. Please try again.'}
                    </span>
                  </div>
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  icon,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={(children as React.ReactElement).props.id}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-[10px]">{icon}</span>}
        {children}
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1 text-xs text-red-600"
        >
          <AlertCircle className="h-3 w-3" />
          {error}
        </motion.p>
      )}
    </div>
  );
}

function errorFor(errors: unknown, key: string): string | undefined {
  const e = errors as Record<string, { message?: string } | undefined> | undefined;
  return e?.[key]?.message;
}

function AnimatedSaveFlash({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: -10, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 10, scale: 0.9 }}
          transition={{ duration: 0.25 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved 
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LinkOrButton({
  href,
  children,
  variant,
  leftIcon,
}: {
  href: string;
  children: React.ReactNode;
  variant: 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline';
  leftIcon?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size="sm"
      leftIcon={leftIcon}
      onClick={() => router.push(href)}
    >
      {children}
    </Button>
  );
}
