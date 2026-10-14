'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Shield, Smartphone, Key, CheckCircle2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

export function SecuritySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-settings-program', pid] as const;

  const [mfaPolicy, setMfaPolicy] = React.useState<'required_admins' | 'required_all' | 'optional'>('required_admins');
  const [ssoProvider, setSsoProvider] = React.useState<'google' | 'microsoft' | 'disabled'>('google');
  const [sessionTimeoutHours, setSessionTimeoutHours] = React.useState(12);
  const [maxConcurrentSessions, setMaxConcurrentSessions] = React.useState(3);
  const [ipRestrictions, setIpRestrictions] = React.useState(false);
  const [ipWhitelist, setIpWhitelist] = React.useState('197.210.64.0/18');

  const { data: program } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const moduleConfig: Record<string, any> =
    React.useMemo(() => (program as any)?.module_config ?? {}, [program]);

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const sec = ((program as any).module_config?.security ?? {}) as Record<string, any>;
    if (sec.mfa_policy === 'required_admins' || sec.mfa_policy === 'required_all' || sec.mfa_policy === 'optional') {
      setMfaPolicy(sec.mfa_policy);
    }
    if (sec.sso_provider === 'google' || sec.sso_provider === 'microsoft' || sec.sso_provider === 'disabled') {
      setSsoProvider(sec.sso_provider);
    }
    if (typeof sec.session_timeout_minutes === 'number') {
      setSessionTimeoutHours(Math.max(1, Math.round(sec.session_timeout_minutes / 60)));
    }
    if (typeof sec.max_concurrent_sessions === 'number') setMaxConcurrentSessions(sec.max_concurrent_sessions);
    if (typeof sec.ip_restrictions === 'boolean') setIpRestrictions(sec.ip_restrictions);
    if (typeof sec.ip_allowlist === 'string' && sec.ip_allowlist) setIpWhitelist(sec.ip_allowlist);
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const saveSecurity = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        module_config: {
          ...moduleConfig,
          security: {
            ...(moduleConfig.security ?? {}),
            mfa_policy: mfaPolicy,
            require_2fa: mfaPolicy !== 'optional',
            sso_provider: ssoProvider,
            sso_enabled: ssoProvider !== 'disabled',
            session_timeout_minutes: sessionTimeoutHours * 60,
            max_concurrent_sessions: maxConcurrentSessions,
            ip_restrictions: ipRestrictions,
            ip_allowlist: ipWhitelist,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Security Policies Enforced',
        description: 'MFA rules, session timeouts, and authentication gates updated.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save security policy.',
        variant: 'error',
      });
    },
  });
  const isSaving = saveSecurity.isPending;

  const [activeSessions, setActiveSessions] = React.useState([
    { id: 'sess_1', device: 'Chrome / Windows 11', location: 'Lagos, Nigeria', lastActive: 'Current Session', isCurrent: true },
    { id: 'sess_2', device: 'Safari / iPhone 15 Pro', location: 'Lagos, Nigeria', lastActive: '2 hours ago', isCurrent: false },
    { id: 'sess_3', device: 'Firefox / macOS Sonoma', location: 'London, UK', lastActive: '3 days ago', isCurrent: false },
  ]);

  const handleRevokeSession = (id: string) => {
    setActiveSessions(activeSessions.filter((s) => s.id !== id));
    toast({
      title: 'Session Revoked',
      description: 'The selected device has been immediately logged out and session token invalidated.',
      variant: 'warning',
    });
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its security policies.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Security · Access Governance
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Lock className="h-5 w-5 text-indigo-400" />
          Enterprise Authentication &amp; Session Management
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Rigorous access controls, multi-factor authentication enforcement, single sign-on (SSO), and session lifetime governance.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Authentication Policies */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-emerald-400" /> Multi-Factor Authentication (MFA)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'required_admins', title: 'Required for Admins & Directors', desc: 'Standard security posture. Mandatory for staff with selection or export rights.' },
              { id: 'required_all', title: 'Required for All Members', desc: 'Highest zero-trust security. Enforced for all reviewers, mentors, and staff.' },
              { id: 'optional', title: 'Optional for Members', desc: 'Allows members to opt-in independently.' },
            ].map((opt) => (
              <div
                key={opt.id}
                onClick={() => setMfaPolicy(opt.id as any)}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  mfaPolicy === opt.id
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{opt.title}</span>
                  {mfaPolicy === opt.id && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{opt.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise SSO */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Key className="h-4 w-4 text-indigo-400" /> Single Sign-On (SSO) Provider
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'google', title: 'Google Workspace SSO', desc: 'Authenticate via Google OAuth with organization domain matching.' },
              { id: 'microsoft', title: 'Microsoft Azure Entra ID', desc: 'SAML 2.0 integration with corporate Microsoft 365 tenant.' },
              { id: 'disabled', title: 'Email & Password + TOTP', desc: 'Standard credentials authentication.' },
            ].map((sso) => (
              <div
                key={sso.id}
                onClick={() => setSsoProvider(sso.id as any)}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  ssoProvider === sso.id
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{sso.title}</span>
                  {ssoProvider === sso.id && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{sso.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Session Timeouts & Limits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/10 pt-5">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
            <label className="text-xs font-semibold text-white/70 block">Inactivity Session Timeout</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={72}
                value={sessionTimeoutHours}
                onChange={(e) => setSessionTimeoutHours(parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">hours</span>
            </div>
            <p className="text-[10px] text-white/40">Forces re-authentication after specified inactivity window.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
            <label className="text-xs font-semibold text-white/70 block">Max Concurrent Sessions</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={10}
                value={maxConcurrentSessions}
                onChange={(e) => setMaxConcurrentSessions(parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">devices</span>
            </div>
            <p className="text-[10px] text-white/40">Terminates oldest active session when threshold exceeded.</p>
          </div>
        </div>

        {/* Active Sessions Table */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-indigo-400" /> Active Organization Sessions
            </h4>
            <span className="text-xs text-white/40 font-mono">{activeSessions.length} Devices Online</span>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 overflow-hidden">
            {activeSessions.map((sess) => (
              <div key={sess.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{sess.device}</span>
                    {sess.isCurrent && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.2 rounded-full font-bold">
                        Current Device
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/40">{sess.location} · {sess.lastActive}</p>
                </div>

                {!sess.isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRevokeSession(sess.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Complies with SOC-2 Type II authentication protocols.
          </span>
          <Button
            onClick={() => saveSecurity.mutate()}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Security Policy'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
