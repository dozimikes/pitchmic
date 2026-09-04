/**
 * src/providers/AuthProvider.tsx
 *
 * Re-exports the AuthProvider from hooks/useAuth so it can be imported
 * from either path:
 *   import { AuthProvider } from '@/providers/AuthProvider'
 *   import { AuthProvider } from '@/hooks/useAuth'
 *
 * The canonical implementation lives in hooks/useAuth - this is purely
 * a convenience re-export for the providers/ directory convention.
 */
export { AuthProvider } from '@/hooks/useAuth';
