'use client';

import * as React from 'react';
import { Rocket, Check, Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface CohortTrackerProps {
  cohortData: any;
}

export function CohortTracker({ cohortData }: CohortTrackerProps) {
  const members = cohortData?.members || [
    {
      company_name: 'BioMedica Diagnostics',
      latest_readiness_score: 86,
      milestones_complete: 2,
      milestones_total: 6,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-emerald-400" />
            Active Cohort Management & Milestones
          </h2>
          <p className="text-xs text-neutral-400">
            Continuous readiness tracking post-acceptance: 12-week milestones, mentor reviews, and Demo Day data rooms.
          </p>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
          Batch Progress: Week 6 of 12
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Members */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-white">Enrolled Portfolio Startups ({members.length})</h3>
          <div className="space-y-3">
            {members.map((mem: any, idx: number) => (
              <Card key={idx} className="bg-neutral-900/60 border-neutral-800">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-base">{mem.company_name}</p>
                      <p className="text-xs text-neutral-400">
                        Milestones: {mem.milestones_complete || 2} of {mem.milestones_total || 6} Completed
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-400">Readiness Score</p>
                      <p className="text-xl font-bold font-mono text-emerald-400">
                        {mem.latest_readiness_score || 86}/100
                      </p>
                    </div>
                  </div>

                  {/* Continuous Reassessment Curve */}
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-850 space-y-2">
                    <p className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Continuous Reassessment Evolution</span>
                      <span className="text-emerald-400 font-mono">+14pts since intake</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded bg-neutral-900">
                        <p className="text-[10px] text-neutral-500">At Intake</p>
                        <p className="font-bold text-neutral-300 font-mono">72</p>
                      </div>
                      <div className="p-2 rounded bg-neutral-900">
                        <p className="text-[10px] text-neutral-500">Week 4 Checkpoint</p>
                        <p className="font-bold text-neutral-300 font-mono">81</p>
                      </div>
                      <div className="p-2 rounded bg-neutral-900 border border-emerald-500/30">
                        <p className="text-[10px] text-emerald-400">Current (Wk 6)</p>
                        <p className="font-bold text-emerald-400 font-mono">86</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 12-Week Milestone Templates */}
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Program Milestones (12-Week Track)
            </h3>
            <div className="space-y-3">
              {[
                { wk: 2, title: 'Customer Discovery & ICP Refinement', cat: 'customer', done: true },
                { wk: 4, title: 'Architecture & Pilot Deployment', cat: 'product', done: true },
                { wk: 6, title: 'Commercial Traction & LOI Conversion', cat: 'revenue', active: true },
                { wk: 8, title: 'Unit Economics & Financial Forensics', cat: 'revenue' },
                { wk: 10, title: 'Demo Day Pitch Deck & Data Room', cat: 'fundraising' },
                { wk: 12, title: 'Demo Day & Syndicate Close', cat: 'fundraising' },
              ].map((m, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2.5 rounded-lg border text-xs flex items-center justify-between',
                    m.done
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : m.active
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                      : 'bg-neutral-950 border-neutral-850 text-neutral-400'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">Wk {m.wk}:</span>
                    <span>{m.title}</span>
                  </div>
                  {m.done && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  {m.active && <Badge className="bg-amber-500/20 text-amber-400 text-[9px]">IN PROGRESS</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
