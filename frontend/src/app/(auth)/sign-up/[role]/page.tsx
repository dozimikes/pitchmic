'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  User as UserIcon,
  Building2,
  Briefcase,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Rocket,
  Check,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import {
  StartupSignUpSchema,
  InvestorSignUpSchema,
  type StartupSignUpInput,
  type InvestorSignUpInput,
} from '@/lib/validators';
import { UserRole } from '@/lib/types';
import { useAuth, signUpWithPassword } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api';

type Role = 'startup' | 'investor';
type FormValues = StartupSignUpInput | InvestorSignUpInput;

function getSchemaForRole(role: Role) {
  return role === 'startup' ? StartupSignUpSchema : InvestorSignUpSchema;
}

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: '8+ characters', regex: /.{8,}/ },
  { key: 'upper', label: '1 uppercase letter', regex: /[A-Z]/ },
  { key: 'lower', label: '1 lowercase letter', regex: /[a-z]/ },
  { key: 'num', label: '1 number', regex: /[0-9]/ },
];

const STARTUP_NICHES = [
  'Fintech & Payments',
  'AI & Machine Learning',
  'B2B SaaS & DevTools',
  'Healthtech & Biotech',
  'E-commerce & Retail',
  'Climate & CleanTech',
  'Web3 & Infrastructure',
];

const INVESTOR_NICHES = [
  'Pre-Seed / Seed B2B',
  'Early Stage Fintech',
  'AI & Enterprise Software',
  'DeepTech & Hardware',
  'Consumer & Marketplaces',
  'Emerging Markets & Africa/MENA',
  'Growth Stage Series A+',
];

function SignUpPageInner() {
  const router = useRouter();
  const params = useParams<{ role: string }>();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();

  const roleParam = (params?.role ?? 'startup').toLowerCase();
  const role: Role = roleParam === 'investor' ? 'investor' : 'startup';

  React.useEffect(() => {
    if (roleParam !== 'startup' && roleParam !== 'investor') {
      router.replace('/sign-up/startup');
    }
  }, [roleParam, router]);

  const [currentStep, setCurrentStep] = React.useState<1 | 2 | 3>(1);
  const [showPassword, setShowPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [passwordValue, setPasswordValue] = React.useState('');
  const [agreedToTerms, setAgreedToTerms] = React.useState(true);

  const schema = getSchemaForRole(role);

  const defaultValues: FormValues =
    role === 'startup'
      ? ({
          role: UserRole.STARTUP,
          email: searchParams.get('email') ?? '',
          password: '',
          confirm_password: '',
          first_name: '',
          last_name: '',
          startup_name: '',
          founder_title: 'Founder & CEO',
          niche: 'B2B SaaS & DevTools',
          co_founders: [],
        } as FormValues)
      : ({
          role: UserRole.INVESTOR,
          email: searchParams.get('email') ?? '',
          password: '',
          confirm_password: '',
          first_name: '',
          last_name: '',
          investor_name: '',
          niche: 'Pre-Seed / Seed B2B',
        } as FormValues);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema as never),
    defaultValues: defaultValues as never,
    mode: 'onTouched',
  });

  const watchedPassword = watch('password', '');
  const watchedFirstName = watch('first_name', '');
  const watchedLastName = watch('last_name', '');
  const watchedEmail = watch('email', '');
  const watchedStartupName = (watch as unknown as (name: 'startup_name') => string)('startup_name') || '';
  const watchedFounderTitle = (watch as unknown as (name: 'founder_title') => string)('founder_title') || '';
  const watchedInvestorName = (watch as unknown as (name: 'investor_name') => string)('investor_name') || '';
  const watchedNiche = (watch as unknown as (name: 'niche') => string)('niche') || '';

  React.useEffect(() => {
    setPasswordValue(watchedPassword);
  }, [watchedPassword]);

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/newsfeed');
    }
  }, [isAuthenticated, router]);

  const isStartupRole = role === 'startup';

  const handleNextStep = async () => {
    setServerError(null);
    if (currentStep === 1) {
      const valid = await trigger([
        'first_name',
        'last_name',
        'email',
        'password',
        'confirm_password',
      ]);
      if (valid) setCurrentStep(2);
    } else if (currentStep === 2) {
      const fieldsToValidate = isStartupRole
        ? ['startup_name' as const, 'founder_title' as const, 'niche' as const]
        : ['niche' as const];
      const valid = await trigger(fieldsToValidate as never);
      if (valid) setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    setServerError(null);
    if (currentStep === 3) setCurrentStep(2);
    else if (currentStep === 2) setCurrentStep(1);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!agreedToTerms) {
      setServerError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    try {
      const payload: Record<string, unknown> = { ...values };
      if ('confirm_password' in payload) {
        delete payload.confirm_password;
      }
      const { tokens, user } = await signUpWithPassword(payload);
      login(tokens, user);
      router.push('/newsfeed');
    } catch (err) {
      const error = err as ApiError;
      if (error.errors) {
        const fieldMap: Record<string, string> = {
          email: 'email',
          password: 'password',
          first_name: 'first_name',
          last_name: 'last_name',
          startup_name: 'startup_name',
          founder_title: 'founder_title',
          niche: 'niche',
        };
        Object.entries(error.errors).forEach(([field, messages]) => {
          const mapped = fieldMap[field];
          if (mapped && messages && messages.length > 0) {
            setError(mapped as never, { message: messages[0] }, { shouldFocus: true });
          }
        });
      }
      const message =
        error.status === 409
          ? 'An account with this email already exists. Please sign in instead.'
          : error.message || 'Sign up failed. Please try again.';
      setServerError(message);
    }
  });

  const STEPS = [
    { num: 1, title: 'Account', desc: 'Your credentials' },
    { num: 2, title: isStartupRole ? 'Startup' : 'Investment', desc: isStartupRole ? 'Company focus' : 'Mandate & niche' },
    { num: 3, title: 'Launch', desc: 'Review & enter' },
  ];

  return (
    <MarketingShell showNavbar={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-5">
          {/* Left Hero Column */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2 hidden flex-col justify-between lg:flex"
          >
            <div>
              <Link href="/" className="inline-flex items-center">
                <Logo size="lg" />
              </Link>

              <Badge
                variant="outline"
                className={cn(
                  'mt-12 w-fit border-slate-200',
                  isStartupRole
                    ? 'bg-brand-orange-50 text-brand-orange-700'
                    : 'bg-brand-deep-pitch-50 text-brand-deep-pitch-700'
                )}
              >
                {isStartupRole ? (
                  <><Building2 className="mr-1.5 h-3.5 w-3.5" /> Founder onboarding</>
                ) : (
                  <><Briefcase className="mr-1.5 h-3.5 w-3.5" /> Investor onboarding</>
                )}
              </Badge>

              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                {isStartupRole ? (
                  <>
                    Pitch your
                    <br />
                    <span className="gradient-text">startup today.</span>
                  </>
                ) : (
                  <>
                    Invest in the
                    <br />
                    <span className="gradient-text">next big thing.</span>
                  </>
                )}
              </h1>

              <p className="mt-5 max-w-md text-base leading-7 text-slate-600">
                {isStartupRole
                  ? 'Join founders raising capital through structured video pitches, interactive due-diligence data rooms, and verified term sheets.'
                  : 'Discover high-signal deals, run automated due-diligence forensics, and issue formal term sheets in minutes.'}
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {(isStartupRole
                ? [
                    'Build a high-conversion pitch in minutes',
                    'Direct access to 3,000+ active venture funds',
                    'Real-time engagement telemetry on your deck',
                  ]
                : [
                    'AI-conducted pitch deck forensics & red flag audits',
                    'Continuous stealth founder radar across registries',
                    'Structured offer & cap table negotiation room',
                  ]
              ).map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-700">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange-500/10">
                    <CheckCircle2 className="h-4 w-4 text-brand-orange-500" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Card / Wizard Column */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="lg:col-span-3"
          >
            {/* Mobile Logo & Role Switcher */}
            <div className="mb-4 flex justify-center lg:hidden">
              <Link href="/" className="inline-flex items-center">
                <Logo size="md" />
              </Link>
            </div>
            <div className="mb-5 flex items-center justify-center gap-2 lg:hidden">
              {(['startup', 'investor'] as const).map((r) => (
                <Link
                  key={r}
                  href={`/sign-up/${r}`}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors',
                    role === r
                      ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {r === 'startup' ? (
                    <><Building2 className="h-3.5 w-3.5" /> Founder</>
                  ) : (
                    <><Briefcase className="h-3.5 w-3.5" /> Investor</>
                  )}
                </Link>
              ))}
            </div>

            <Card className="w-full border-slate-200 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur">
              <CardHeader className="pb-4">
                {/* Visual Step Progress Bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="default"
                      className={cn(
                        'w-fit font-semibold transition-colors',
                        isStartupRole
                          ? 'bg-brand-orange-500 hover:bg-brand-orange-600'
                          : 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600'
                      )}
                    >
                      Step {currentStep} of 3: {STEPS[currentStep - 1].title}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Takes ~2 minutes</p>
                </div>

                {/* Stepper Indicators */}
                <div className="grid grid-cols-3 gap-2">
                  {STEPS.map((s) => {
                    const isPassed = s.num < currentStep;
                    const isCurrent = s.num === currentStep;
                    return (
                      <div key={s.num} className="space-y-1.5">
                        <div
                          className={cn(
                            'h-1.5 w-full rounded-full transition-all duration-300',
                            isPassed
                              ? 'bg-emerald-500'
                              : isCurrent
                              ? isStartupRole
                                ? 'bg-brand-orange-500'
                                : 'bg-brand-deep-pitch-500'
                              : 'bg-slate-200'
                          )}
                        />
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                              isPassed
                                ? 'bg-emerald-100 text-emerald-700'
                                : isCurrent
                                ? isStartupRole
                                  ? 'bg-brand-orange-100 text-brand-orange-700'
                                  : 'bg-brand-deep-pitch-100 text-brand-deep-pitch-700'
                                : 'bg-slate-100 text-slate-400'
                            )}
                          >
                            {isPassed ? <Check className="h-2.5 w-2.5" /> : s.num}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-medium truncate',
                              isCurrent ? 'text-slate-900 font-semibold' : 'text-slate-400'
                            )}
                          >
                            {s.title}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <CardTitle className="mt-5 text-2xl font-bold text-slate-900">
                  {currentStep === 1 && `Create your ${role} credentials`}
                  {currentStep === 2 && (isStartupRole ? 'Startup details' : 'Investment mandate')}
                  {currentStep === 3 && 'Review & launch'}
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  {currentStep === 1 && 'Enter your personal details and secure password.'}
                  {currentStep === 2 &&
                    (isStartupRole
                      ? 'Tell investors about your company and industry focus.'
                      : 'Define your investment mandate and sector focus.')}
                  {currentStep === 3 && 'Confirm your profile details and complete onboarding.'}
                </CardDescription>
              </CardHeader>

              <form onSubmit={onSubmit} noValidate>
                <CardContent className="space-y-5 pt-2">
                  {serverError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <span>{serverError}</span>
                    </motion.div>
                  )}

                  <AnimatePresence mode="wait">
                    {/* STEP 1: Account & Credentials */}
                    {currentStep === 1 && (
                      <motion.div
                        key="step-1"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="first_name">First name</Label>
                            <div className="relative">
                              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <Input
                                id="first_name"
                                autoComplete="given-name"
                                placeholder="Alex"
                                className={cn('pl-10', errors.first_name && 'border-red-500 focus:ring-red-500/20')}
                                {...register('first_name')}
                              />
                            </div>
                            {errors.first_name && (
                              <p className="text-xs text-red-600">{errors.first_name.message as string}</p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="last_name">Last name</Label>
                            <div className="relative">
                              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <Input
                                id="last_name"
                                autoComplete="family-name"
                                placeholder="Morgan"
                                className={cn('pl-10', errors.last_name && 'border-red-500 focus:ring-red-500/20')}
                                {...register('last_name')}
                              />
                            </div>
                            {errors.last_name && (
                              <p className="text-xs text-red-600">{errors.last_name.message as string}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="email">Work email</Label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              id="email"
                              type="email"
                              autoComplete="email"
                              placeholder="you@company.com"
                              className={cn('pl-10', errors.email && 'border-red-500 focus:ring-red-500/20')}
                              {...register('email')}
                            />
                          </div>
                          {errors.email && (
                            <p className="text-xs text-red-600">{errors.email.message as string}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                placeholder="Create password"
                                className={cn('pl-10 pr-10', errors.password && 'border-red-500 focus:ring-red-500/20')}
                                {...register('password')}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            {errors.password && (
                              <p className="text-xs text-red-600">{errors.password.message as string}</p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="confirm_password">Confirm password</Label>
                            <div className="relative">
                              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <Input
                                id="confirm_password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                placeholder="Re-enter password"
                                className={cn('pl-10', errors.confirm_password && 'border-red-500 focus:ring-red-500/20')}
                                {...register('confirm_password')}
                              />
                            </div>
                            {errors.confirm_password && (
                              <p className="text-xs text-red-600">{errors.confirm_password.message as string}</p>
                            )}
                          </div>
                        </div>

                        {/* Password Requirements Checklist */}
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                            Security Requirements
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {PASSWORD_REQUIREMENTS.map((req) => {
                              const satisfied = passwordValue.length > 0 && req.regex.test(passwordValue);
                              return (
                                <div
                                  key={req.key}
                                  className={cn(
                                    'flex items-center gap-1.5 text-xs transition-colors',
                                    satisfied ? 'text-emerald-600 font-medium' : 'text-slate-400'
                                  )}
                                >
                                  {satisfied ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <div className="h-3 w-3 rounded-full border border-slate-300" />
                                  )}
                                  <span>{req.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* STEP 2: Company / Investor Profile */}
                    {currentStep === 2 && (
                      <motion.div
                        key="step-2"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        {isStartupRole ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="startup_name">Startup name</Label>
                                <div className="relative">
                                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-orange-500" />
                                  <Input
                                    id="startup_name"
                                    placeholder="e.g. Acme, Inc."
                                    className={cn('pl-10', (errors as unknown as { startup_name?: { message?: string } }).startup_name && 'border-red-500 focus:ring-red-500/20')}
                                    {...(register as (name: 'startup_name') => Record<string, unknown>)('startup_name')}
                                  />
                                </div>
                                {(errors as unknown as { startup_name?: { message?: string } }).startup_name && (
                                  <p className="text-xs text-red-600">
                                    {(errors as unknown as { startup_name: { message: string } }).startup_name.message}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-1.5">
                                <Label htmlFor="founder_title">Your title</Label>
                                <Input
                                  id="founder_title"
                                  placeholder="Founder & CEO"
                                  className={cn((errors as unknown as { founder_title?: { message?: string } }).founder_title && 'border-red-500 focus:ring-red-500/20')}
                                  {...(register as (name: 'founder_title') => Record<string, unknown>)('founder_title')}
                                />
                                {(errors as unknown as { founder_title?: { message?: string } }).founder_title && (
                                  <p className="text-xs text-red-600">
                                    {(errors as unknown as { founder_title: { message: string } }).founder_title.message}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="niche">Primary Industry / Sector</Label>
                              <div className="flex flex-wrap gap-2">
                                {STARTUP_NICHES.map((nicheOption) => {
                                  const isSelected = watchedNiche === nicheOption;
                                  return (
                                    <button
                                      key={nicheOption}
                                      type="button"
                                      onClick={() => (setValue as unknown as (name: string, val: string) => void)('niche', nicheOption)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                        isSelected
                                          ? 'border-brand-orange-500 bg-brand-orange-50 text-brand-orange-800 font-semibold shadow-xs'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      )}
                                    >
                                      {nicheOption}
                                    </button>
                                  );
                                })}
                              </div>
                              <Input
                                id="niche"
                                placeholder="Or enter custom niche (e.g. AI Workflow Automation)"
                                className="mt-2"
                                {...(register as (name: 'niche') => Record<string, unknown>)('niche')}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="investor_name">
                                Fund / Firm Name <span className="text-slate-400 font-normal">(optional if angel)</span>
                              </Label>
                              <div className="relative">
                                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-deep-pitch-500" />
                                <Input
                                  id="investor_name"
                                  placeholder="e.g. Northwind Ventures / Angel"
                                  className="pl-10"
                                  {...(register as (name: 'investor_name') => Record<string, unknown>)('investor_name')}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="niche">Investment Focus / Mandate</Label>
                              <div className="flex flex-wrap gap-2">
                                {INVESTOR_NICHES.map((nicheOption) => {
                                  const isSelected = watchedNiche === nicheOption;
                                  return (
                                    <button
                                      key={nicheOption}
                                      type="button"
                                      onClick={() => (setValue as unknown as (name: string, val: string) => void)('niche', nicheOption)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                        isSelected
                                          ? 'border-brand-deep-pitch-500 bg-brand-deep-pitch-50 text-brand-deep-pitch-800 font-semibold shadow-xs'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      )}
                                    >
                                      {nicheOption}
                                    </button>
                                  );
                                })}
                              </div>
                              <Input
                                id="niche"
                                placeholder="Or specify custom mandate"
                                className="mt-2"
                                {...(register as (name: 'niche') => Record<string, unknown>)('niche')}
                              />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* STEP 3: Review & Launch */}
                    {currentStep === 3 && (
                      <motion.div
                        key="step-3"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Profile Summary
                            </span>
                            <button
                              type="button"
                              onClick={() => setCurrentStep(1)}
                              className="text-xs font-medium text-brand-orange-600 hover:underline"
                            >
                              Edit
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-slate-400">Full Name</p>
                              <p className="font-semibold text-slate-800 mt-0.5">
                                {watchedFirstName || 'Alex'} {watchedLastName || 'Morgan'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Work Email</p>
                              <p className="font-semibold text-slate-800 mt-0.5 truncate">
                                {watchedEmail || 'you@company.com'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">{isStartupRole ? 'Startup' : 'Firm / Mandate'}</p>
                              <p className="font-semibold text-slate-800 mt-0.5 truncate">
                                {isStartupRole ? (watchedStartupName || 'My Startup') : (watchedInvestorName || 'Angel Investor')}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">{isStartupRole ? 'Role / Title' : 'Sector'}</p>
                              <p className="font-semibold text-slate-800 mt-0.5 truncate">
                                {isStartupRole ? (watchedFounderTitle || 'Founder') : (watchedNiche || 'General')}
                              </p>
                            </div>
                          </div>
                        </div>

                        <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-orange-500 focus:ring-brand-orange-500/20"
                          />
                          <span>
                            I agree to PitchMic&apos;s{' '}
                            <Link href="/terms" className="text-slate-900 underline hover:text-brand-orange-600">
                              Terms of Service
                            </Link>{' '}
                            and{' '}
                            <Link href="/privacy" className="text-slate-900 underline hover:text-brand-orange-600">
                              Privacy Policy
                            </Link>
                            .
                          </span>
                        </label>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Wizard Action Controls */}
                  <div className="flex items-center gap-3 pt-3">
                    {currentStep > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrevStep}
                        className="h-11 px-4 border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                        Back
                      </Button>
                    )}

                    {currentStep < 3 ? (
                      <Button
                        type="button"
                        onClick={handleNextStep}
                        size="lg"
                        className={cn(
                          'flex-1 h-11 text-base shadow-md transition-all',
                          isStartupRole
                            ? 'bg-brand-orange-500 hover:bg-brand-orange-600 shadow-brand-orange-500/20'
                            : 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600 shadow-brand-deep-pitch-500/20'
                        )}
                      >
                        Continue to Step {currentStep + 1}
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        size="lg"
                        className={cn(
                          'flex-1 h-11 text-base shadow-lg transition-all',
                          isStartupRole
                            ? 'bg-brand-orange-500 hover:bg-brand-orange-600 shadow-brand-orange-500/25'
                            : 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600 shadow-brand-deep-pitch-500/25'
                        )}
                        loading={isSubmitting}
                      >
                        {isSubmitting ? (
                          'Creating account...'
                        ) : (
                          <>
                            <Rocket className="h-4 w-4 mr-1.5" />
                            Launch {role} account
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </form>

              <CardFooter className="flex-col pb-6">
                <Separator className="mb-4 w-full" />
                <p className="text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link
                    href="/sign-in"
                    className="font-semibold text-brand-orange-600 hover:text-brand-orange-700 transition-colors"
                  >
                    Sign in →
                  </Link>
                </p>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                  <span className="text-slate-500">
                    {isStartupRole ? 'Investor instead?' : 'Founder instead?'}
                  </span>
                  <Link
                    href={isStartupRole ? '/sign-up/investor' : '/sign-up/startup'}
                    className="font-medium underline underline-offset-2 hover:text-brand-deep-pitch-600"
                  >
                    Create {isStartupRole ? 'investor' : 'founder'} account
                  </Link>
                </div>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      </div>
    </MarketingShell>
  );
}

export default function SignUpPage() {
  return (
    <React.Suspense fallback={null}>
      <SignUpPageInner />
    </React.Suspense>
  );
}
