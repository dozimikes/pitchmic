'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Mail,
  Mic,
  RefreshCw,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiPost } from '@/lib/api';

type VerifyStatus = 'loading' | 'success' | 'error' | 'expired';

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  const [status, setStatus] = React.useState<VerifyStatus>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isResending, setIsResending] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided.');
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        setStatus('loading');
        await apiPost('/auth/verify-email/', { token });
        if (!cancelled) {
          setStatus('success');
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Verification failed';
        const expired =
          message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('invalid');
        setStatus(expired ? 'expired' : 'error');
        setErrorMessage(
          expired
            ? 'This verification link has expired or has already been used.'
            : message
        );
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resendVerification = async () => {
    setIsResending(true);
    setErrorMessage(null);
    try {
      await apiPost('/auth/verify-email/resend/', {});
      setStatus('success');
      setErrorMessage(null);
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not resend verification email.'
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <MarketingShell>
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <Card className="w-full border-slate-200 bg-white/80 shadow-xl shadow-slate-900/5 backdrop-blur">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                <Mail className="h-7 w-7 text-brand-orange-500" />
              </div>
              <Badge variant="default" className="mx-auto w-fit">
                Email Verification
              </Badge>
              <CardTitle className="mt-3 text-2xl">
                Verifying your email
              </CardTitle>
              <CardDescription className="text-sm">
                We&apos;re checking the link you clicked. This only takes a moment.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <AnimatePresence mode="wait">
                {status === 'loading' && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center py-10"
                  >
                    <Loader2 className="h-12 w-12 animate-spin text-brand-orange-500" />
                    <p className="mt-4 text-sm text-slate-600">
                      Confirming your email address...
                    </p>
                  </motion.div>
                )}

                {status === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center py-8 text-center"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 animate-ping rounded-full bg-green-500/30" />
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-500/30">
                        <CheckCircle2 className="h-10 w-10 text-white" />
                      </div>
                    </div>
                    <h3 className="mt-6 text-2xl font-bold text-slate-900">
                      Email verified!
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      Your email address has been successfully confirmed. You now
                      have full access to PitchMic and all of its features.
                    </p>
                    <div className="mt-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs text-green-800">
                      <Mic className="h-4 w-4 text-green-600" />
                      Welcome to PitchMic — let&apos;s make deals happen.
                    </div>
                  </motion.div>
                )}

                {(status === 'error' || status === 'expired') && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center py-8 text-center"
                  >
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/30">
                      <XCircle className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="mt-6 text-2xl font-bold text-slate-900">
                      {status === 'expired'
                        ? 'Link expired or already used'
                        : 'Verification failed'}
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      {errorMessage ??
                        'Something went wrong while verifying your email.'}
                    </p>

                    {status === 'expired' && (
                      <div className="mt-6 w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-xs text-amber-800">
                        <p className="font-semibold text-amber-900">What now?</p>
                        <p>
                          Don&apos;t worry — you can request a new verification
                          email and we&apos;ll send you a fresh link right away.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>

            <CardFooter className="flex-col gap-3">
              {status === 'success' ? (
                <>
                  <Link href="/newsfeed" className="w-full">
                    <Button size="lg" className="w-full h-11 text-base shadow-lg shadow-brand-orange-500/20">
                      Go to Newsfeed
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/profile/edit">
                    <Button variant="outline" className="h-10 w-full">
                      Complete your profile
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {status === 'expired' && (
                    <Button
                      size="lg"
                      className="w-full h-11 text-base"
                      variant={isResending ? 'default' : 'default'}
                      loading={isResending}
                      onClick={resendVerification}
                      leftIcon={!isResending ? <RefreshCw className="h-5 w-5" /> : undefined}
                    >
                      {isResending ? 'Sending new link...' : 'Resend verification email'}
                    </Button>
                  )}
                  <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                    <Link href="/sign-in">
                      <Button variant="outline" className="w-full h-10">
                        Back to sign in
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button variant="ghost" className="w-full h-10">
                        Return home
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </MarketingShell>
  );
}
