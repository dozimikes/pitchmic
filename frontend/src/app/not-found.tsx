import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-orange-500/10 text-brand-orange-600 mb-4 shadow-xs">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-900 tracking-tight">404 - Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-md">
        The page you are looking for does not exist, was moved, or requires authentication.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/newsfeed">
          <Button variant="default" size="sm" className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold">
            <Home className="w-4 h-4 mr-1.5" />
            Go to Newsfeed
          </Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="outline" size="sm" className="border-slate-300 font-semibold">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Sign In
          </Button>
        </Link>
      </div>
    </div>
  );
}
