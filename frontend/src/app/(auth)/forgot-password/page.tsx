'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ForgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim(),
});
type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ForgotPasswordPageInner() {
  React.useEffect(() => {
    document.title = 'Reset Your Password | Pitchmic';
  }, []);

  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      if (!res.ok && res.status !== 202) {
        throw new Error('Request failed. Please try again.');
      }
      setSubmitted(true);
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
                {submitted
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  : <ShieldCheck  className="h-6 w-6 text-brand-orange-500" />
                }
              </div>
              <CardTitle className="text-xl">
                {submitted ? 'Check your email' : 'Forgot your password?'}
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {submitted
                  ? `We sent a password reset link to ${getValues('email')}. It expires in 1 hour.`
                  : "Enter the email address for your account and we'll send you a reset link."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {!submitted ? (
                <>
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
                    </motion.div>
                  )}

                  <form onSubmit={onSubmit} noValidate className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <Input
                          id="email"
                          type="email"
                          autoFocus
                          autoComplete="email"
                          placeholder="you@example.com"
                          aria-invalid={!!errors.email}
                          aria-describedby={errors.email ? 'email-error' : undefined}
                          className={cn('pl-10', errors.email && 'border-red-500 focus:ring-red-500/20')}
                          {...register('email')}
                        />
                      </div>
                      {errors.email?.message && (
                        <p id="email-error" role="alert" className="text-xs text-red-600">
                          {errors.email.message}
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
                      {isSubmitting ? 'Sending…' : 'Send reset link'}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <p>If you don&apos;t see the email within a few minutes, check your spam or junk folder.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full h-11"
                    onClick={() => setSubmitted(false)}
                  >
                    Try a different email
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </MarketingShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ForgotPasswordPageInner />
    </React.Suspense>
  );
}
