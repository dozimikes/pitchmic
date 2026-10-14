'use client';

import * as React from 'react';
import { FileText, Globe, Linkedin, Twitter } from 'lucide-react';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';

const DASH = '—';

function initials(name?: string | null): string {
  if (!name) return DASH;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return DASH;
  return parts.slice(0, 3).map((p) => p[0].toUpperCase()).join('');
}

export function ProfileSettings() {
  const { activeProgram, userContext, activeContext } = useActiveProgram();

  const program = activeProgram as any;
  const organizationName =
    activeContext?.organization_name || program?.organization_name || DASH;
  const email = userContext?.email || DASH;
  const role = activeContext?.role || DASH;

  const shortBio = program?.tagline || DASH;
  const longBio = program?.description || DASH;
  const website = program?.website || DASH;
  const linkedin = DASH;   // no backing field in program or user context
  const twitter = DASH;    // no backing field in program or user context
  const location = program?.location || program?.geography_focus || DASH;

  const focusAreas: string[] = React.useMemo(() => {
    const raw: string = program?.sector_focus || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [program]);

  const readOnlyCls =
    'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white/80 ' +
    'cursor-default focus:outline-none';
  const fieldCls =
    'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 ' +
    'cursor-default focus:outline-none';

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Account · Identity
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-400" />
          Profile &amp; Organization Context
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Your signed-in identity and active organization context. These values are read from your session.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Identity header (from getContext) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 border-b border-white/10 pb-5">
          <div className="h-20 w-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-extrabold text-2xl">
            {initials(organizationName)}
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-white">{organizationName}</h4>
            <p className="text-xs text-white/50">Email: <span className="text-white/80">{email}</span></p>
            <p className="text-xs text-white/50">
              Active role: <span className="text-white/80">{role}</span>
              {activeProgram?.name ? (
                <> · Active program: <span className="text-white/80">{activeProgram.name}</span></>
              ) : null}
            </p>
            <p className="text-[11px] text-white/40 max-w-sm pt-1">
              To change your email, role, or organization membership, contact your workspace administrator.
            </p>
          </div>
        </div>

        {/* Narrative Descriptions (from active program) */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">Short Tagline / Overview</label>
            <input type="text" value={shortBio} readOnly className={readOnlyCls} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">Full Organization Bio</label>
            <textarea rows={3} value={longBio} readOnly className={readOnlyCls} />
          </div>
        </div>

        {/* Digital Presence */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-white/10 pt-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-indigo-400" /> Website
            </label>
            <input type="text" value={website} readOnly className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
              <Linkedin className="h-3.5 w-3.5 text-blue-400" /> LinkedIn
            </label>
            <input type="text" value={linkedin} readOnly className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
              <Twitter className="h-3.5 w-3.5 text-sky-400" /> X / Twitter
            </label>
            <input type="text" value={twitter} readOnly className={fieldCls} />
          </div>
        </div>

        {/* Location */}
        <div className="border-t border-white/10 pt-5 space-y-1.5">
          <label className="text-xs font-semibold text-white/70">Location / Geography</label>
          <input type="text" value={location} readOnly className={readOnlyCls} />
        </div>

        {/* Focus Areas & Sectors */}
        <div className="space-y-3 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Thematic Focus Areas</h4>
              <p className="text-[11px] text-white/40">Sectors actively targeted by your evaluation policies and scouts.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {focusAreas.length === 0 ? (
              <span className="text-xs text-white/40">{DASH}</span>
            ) : (
              focusAreas.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-medium"
                >
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4">
          <span className="text-[11px] text-white/40">
            This profile is read-only and reflects your current session context.
          </span>
        </div>
      </div>
    </div>
  );
}
