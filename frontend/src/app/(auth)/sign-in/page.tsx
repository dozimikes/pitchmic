'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Mail,
  Lock,
  Mic,
  Building2,
  Briefcase,
  AlertCircle,
  Eye,
  EyeOff,
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
import { SignInSchema, type SignInInput } from '@/lib/validators';
import { useAuth, signInWithPassword } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api';

function SignInPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const sessionExpired = searchParams.get('session_expired') === '1';
  const { login, isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: {
      email: '',
      password: '',
      remember_me: false,
    },
    mode: 'onTouched',
  });

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace(next ? decodeURIComponent(next) : '/newsfeed');
    }
  }, [isAuthenticated, router, next]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { tokens, user } = await signInWithPassword({
        email: values.email,
        password: values.password,
      });
      login(tokens, user);
      router.push(next ? decodeURIComponent(next) : '/newsfeed');
    } catch (err) {
      const error = err as ApiError;
      if (error.status === 401 || error.status === 400) {
        setError('email', { message: ' ' });
        setError('password', { message: ' ' });
        setServerError(
          'Invalid email or password. Please check your credentials and try again.'
        );
      } else {
        setServerError(error.message || 'Sign in failed. Please try again.');
      }
    }
  });

  return (
    <MarketingShell showNavbar={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="hidden flex-col justify-between lg:flex"
          >
            <div>
              <Link href="/" className="inline-flex items-center">
                <Logo size="lg" />
              </Link>

              <h1 className="mt-12 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Welcome back.
                <br />
                <span className="gradient-text">Let&apos;s make deals happen.</span>
              </h1>

              <p className="mt-5 max-w-md text-lg leading-8 text-slate-600">
                Sign in to discover curated pitches, manage your offers, and
                connect with founders and investors from around the world.
              </p>
            </div>

            <div className="mt-12 space-y-4">
              {[
                {
                  icon: Building2,
                  title: 'For founders',
                  body: 'Track views, likes, and offers on your pitches in real time.',
                },
                {
                  icon: Briefcase,
                  title: 'For investors',
                  body: 'Discover high-signal startups and manage your deal pipeline.',
                },
                {
                  icon: Mic,
                  title: 'Built for both sides',
                  body: 'Structured offers, built-in messaging, and secure data rooms.',
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-4 backdrop-blur"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                    <Icon className="h-5 w-5 text-brand-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            {/* Mobile logo when top navbar is removed */}
            <div className="mb-6 flex justify-center lg:hidden">
              <Link href="/" className="inline-flex items-center">
                <Logo size="md" />
              </Link>
            </div>

            <Card className="w-full border-slate-200 bg-white/80 shadow-xl shadow-slate-900/5 backdrop-blur">
              <CardHeader className="text-center">
                <Badge variant="default" className="mx-auto w-fit bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600">
                  Account
                </Badge>
                <CardTitle className="mt-3 text-2xl">Sign in to PitchMic</CardTitle>
                <CardDescription className="text-sm">
                  Enter your credentials to access your dashboard.
                </CardDescription>
                {sessionExpired && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Your session has expired. Please sign in again to continue.
                    </span>
                  </div>
                )}
              </CardHeader>

              <form onSubmit={onSubmit} noValidate>
                <CardContent className="space-y-5">
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

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className={cn('pl-10', errors.email && 'border-red-500 focus:ring-red-500/20')}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && serverError === null && (
                      <p className="text-xs text-red-600">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs font-medium text-brand-orange-600 hover:text-brand-orange-700 transition-colors"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        className={cn('pl-10 pr-10', errors.password && !errors.email && serverError && 'border-red-500 focus:ring-red-500/20')}
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
                    {errors.password && serverError === null && (
                      <p className="text-xs text-red-600">{errors.password.message}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        {...register('remember_me')}
                        className="h-4 w-4 rounded border-slate-300 text-brand-orange-500 focus:ring-brand-orange-500/20"
                      />
                      <span className="text-xs text-slate-600">Remember me for 30 days</span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full h-11 text-base shadow-lg shadow-brand-orange-500/20"
                    loading={isSubmitting}
                  >
                    {isSubmitting ? 'Signing in...' : 'Sign in'}
                    {!isSubmitting && <ArrowRight className="h-5 w-5" />}
                  </Button>
                </CardContent>
              </form>

              <CardFooter className="flex-col gap-4">
                <div className="flex w-full items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    New to PitchMic?
                  </span>
                  <Separator className="flex-1" />
                </div>

                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <Link href="/sign-up/startup">
                    <Button variant="outline" className="w-full h-10 border-slate-300 hover:border-brand-orange-400 hover:text-brand-orange-600">
                      <Building2 className="h-4 w-4" />
                      I&apos;m a founder
                    </Button>
                  </Link>
                  <Link href="/sign-up/investor">
                    <Button variant="outline" className="w-full h-10 border-slate-300 hover:border-brand-deep-pitch-400 hover:text-brand-deep-pitch-600">
                      <Briefcase className="h-4 w-4" />
                      I&apos;m an investor
                    </Button>
                  </Link>
                </div>
              </CardFooter>
            </Card>

            <p className="mt-6 text-center text-xs text-slate-500">
              By signing in, you agree to our{' '}
              <Link href="/terms" className="text-slate-700 underline hover:text-slate-900">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-slate-700 underline hover:text-slate-900">
                Privacy Policy
              </Link>
              .
            </p>
          </motion.div>
        </div>
      </div>
    </MarketingShell>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense fallback={null}>
      <SignInPageInner />
    </React.Suspense>
  );
}

