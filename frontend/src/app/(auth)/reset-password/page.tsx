'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Schema - matches the backend ResetPasswordSerializer constraints
// ---------------------------------------------------------------------------

const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    password_confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: 'Passwords do not match',
    path: ['password_confirm'],
  });

type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ResetPasswordPageInner() {
  React.useEffect(() => {
    document.title = 'Set a New Password | Pitchmic';
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm]   = React.useState(false);
  const [succeeded, setSucceeded]       = React.useState(false);
  const [serverError, setServerError]   = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: '', password_confirm: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  // No token in URL - show an error immediately
  const missingToken = !token;

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setServerError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: values.password,
          password_confirm: values.password_confirm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? 'Password reset failed. Please try again.');
      }
      setSucceeded(true);
      // Auto-redirect to sign-in after 3 seconds
      setTimeout(() => router.replace('/sign-in'), 3000);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <MarketingShell showNavbar={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Link href="/">
              <Logo size="md" priority />
            </Link>
          </div>

          <Card className="border-slate-200 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange-50 border border-brand-orange-200">
                {succeeded
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  : <Lock         className="h-6 w-6 text-brand-orange-500" />
                }
              </div>
              <CardTitle className="text-xl">
                {succeeded ? 'Password updated' : 'Set a new password'}
              </CardTitle>
              <CardDescription className="text-sm">
                {succeeded
                  ? 'Your password has been changed. Redirecting you to sign in…'
                  : 'Choose a strong password for your account.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Missing or invalid token */}
              {missingToken && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                    <span>This password reset link is missing or invalid. Please request a new one.</span>
                  </div>
                  <Link
                    href="/forgot-password"
                    className="block text-xs font-semibold text-red-700 underline hover:text-red-800 transition-colors"
                  >
                    Request a new reset link
                  </Link>
                </div>
              )}

              {/* Success state */}
              {succeeded && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 text-center">
                  You will be redirected to sign in shortly.
                </div>
              )}

              {/* Form - only shown when token present and not yet succeeded */}
              {!missingToken && !succeeded && (
                <form onSubmit={onSubmit} noValidate className="space-y-4">
                  {serverError && (
                    <motion.div
                      role="alert"
                      aria-live="assertive"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                      <span>{serverError}</span>
                      {serverError.toLowerCase().includes('expired') || serverError.toLowerCase().includes('invalid') ? (
                        <Link
                          href="/forgot-password"
                          className="ml-auto shrink-0 text-xs font-semibold underline"
                        >
                          Get new link
                        </Link>
                      ) : null}
                    </motion.div>
                  )}

                  {/* New password */}
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoFocus
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? 'password-error' : undefined}
                        className={cn('pl-10 pr-10', errors.password && 'border-red-500 focus:ring-red-500/20')}
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-controls="password"
                        aria-pressed={showPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        {showPassword
                          ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                          : <Eye    className="h-4 w-4" aria-hidden="true" />
                        }
                      </button>
                    </div>
                    {errors.password?.message && (
                      <p id="password-error" role="alert" className="text-xs text-red-600">
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-2">
                    <Label htmlFor="password_confirm">Confirm new password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        id="password_confirm"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Repeat your new password"
                        aria-invalid={!!errors.password_confirm}
                        aria-describedby={errors.password_confirm ? 'confirm-error' : undefined}
                        className={cn('pl-10 pr-10', errors.password_confirm && 'border-red-500 focus:ring-red-500/20')}
                        {...register('password_confirm')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                        aria-controls="password_confirm"
                        aria-pressed={showConfirm}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        {showConfirm
                          ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                          : <Eye    className="h-4 w-4" aria-hidden="true" />
                        }
                      </button>
                    </div>
                    {errors.password_confirm?.message && (
                      <p id="confirm-error" role="alert" className="text-xs text-red-600">
                        {errors.password_confirm.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full h-11"
                    disabled={isSubmitting}
                    loading={isSubmitting}
                  >
                    {isSubmitting ? 'Saving…' : 'Set new password'}
                  </Button>
                </form>
              )}

              {/* Go to sign-in */}
              {!succeeded && (
                <div className="text-center pt-1">
                  <Link
                    href="/sign-in"
                    className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Back to sign in
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MarketingShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordPageInner />
    </React.Suspense>
  );
}
