'use client';

import * as React from 'react';

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface IntelligenceExplanation {
  title: string;
  entityName?: string;
  category: string;
  severity: RiskSeverity;
  confidence: number; // e.g. 87 for 87%
  detectedAt: string;
  evidence: string[];
  sources: string[];
  model: string;
  policy?: string;
  contradictions?: string[];
  recommendedAction?: {
    label: string;
    type?: 'INTERVENTION' | 'AUDIT' | 'INTERVIEW' | 'MENTOR_REASSIGN' | 'REVIEW';
    suggestedMentor?: string;
    expectedOutcome?: string;
  };
  evidenceDetail?: EvidenceItem;
}

export interface EvidenceItem {
  id?: string | number;
  title: string;
  claimant?: string;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'FLAGGED';
  declared: {
    source: string;
    value: string;
    date?: string;
  };
  supporting: {
    source: string;
    value: string;
    status: 'MATCH' | 'DISCREPANCY' | 'MISSING';
  }[];
  observed: {
    source: string;
    value: string;
    status: 'VERIFIED' | 'DISCREPANCY' | 'PENDING' | 'MISSING';
  }[];
  snapshotId?: string;
  confidence: number;
  notes?: string;
}

export interface InterventionDraft {
  startupName: string;
  problem: string;
  recommended: string;
  assignedMentor?: string;
  expectedOutcome?: string;
  category?: string;
}

interface IntelligenceContextType {
  // Drawer triggers
  intelligenceDrawerOpen: boolean;
  activeExplanation: IntelligenceExplanation | null;
  openIntelligenceDrawer: (explanation: IntelligenceExplanation) => void;
  closeIntelligenceDrawer: () => void;

  evidenceDrawerOpen: boolean;
  activeEvidence: EvidenceItem | null;
  openEvidenceDrawer: (evidence: EvidenceItem) => void;
  closeEvidenceDrawer: () => void;

  interventionModalOpen: boolean;
  activeInterventionDraft: InterventionDraft | null;
  openInterventionModal: (draft?: Partial<InterventionDraft>) => void;
  closeInterventionModal: () => void;

  // Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

const IntelligenceContext = React.createContext<IntelligenceContextType | null>(null);

export function IntelligenceProvider({ children }: { children: React.ReactNode }) {
  const [intelligenceDrawerOpen, setIntelligenceDrawerOpen] = React.useState(false);
  const [activeExplanation, setActiveExplanation] = React.useState<IntelligenceExplanation | null>(null);

  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = React.useState(false);
  const [activeEvidence, setActiveEvidence] = React.useState<EvidenceItem | null>(null);

  const [interventionModalOpen, setInterventionModalOpen] = React.useState(false);
  const [activeInterventionDraft, setActiveInterventionDraft] = React.useState<InterventionDraft | null>(null);

  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  const openIntelligenceDrawer = React.useCallback((explanation: IntelligenceExplanation) => {
    setActiveExplanation(explanation);
    setIntelligenceDrawerOpen(true);
  }, []);

  const closeIntelligenceDrawer = React.useCallback(() => {
    setIntelligenceDrawerOpen(false);
  }, []);

  const openEvidenceDrawer = React.useCallback((evidence: EvidenceItem) => {
    setActiveEvidence(evidence);
    setEvidenceDrawerOpen(true);
  }, []);

  const closeEvidenceDrawer = React.useCallback(() => {
    setEvidenceDrawerOpen(false);
  }, []);

  const openInterventionModal = React.useCallback((draft?: Partial<InterventionDraft>) => {
    // Every field comes from the caller or the open explanation. Where neither
    // supplies one, the draft stays empty rather than filling in a canned action.
    setActiveInterventionDraft({
      startupName: draft?.startupName || activeExplanation?.entityName || '',
      problem: draft?.problem || activeExplanation?.title || '',
      recommended: draft?.recommended || activeExplanation?.recommendedAction?.label || '',
      assignedMentor: draft?.assignedMentor || activeExplanation?.recommendedAction?.suggestedMentor || '',
      expectedOutcome: draft?.expectedOutcome || activeExplanation?.recommendedAction?.expectedOutcome || '',
      category: draft?.category || activeExplanation?.category || '',
    });
    setInterventionModalOpen(true);
  }, [activeExplanation]);

  const closeInterventionModal = React.useCallback(() => {
    setInterventionModalOpen(false);
  }, []);

  return (
    <IntelligenceContext.Provider
      value={{
        intelligenceDrawerOpen,
        activeExplanation,
        openIntelligenceDrawer,
        closeIntelligenceDrawer,

        evidenceDrawerOpen,
        activeEvidence,
        openEvidenceDrawer,
        closeEvidenceDrawer,

        interventionModalOpen,
        activeInterventionDraft,
        openInterventionModal,
        closeInterventionModal,

        commandPaletteOpen,
        setCommandPaletteOpen,
      }}
    >
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligence() {
  const context = React.useContext(IntelligenceContext);
  if (!context) {
    throw new Error('useIntelligence must be used within an IntelligenceProvider');
  }
  return context;
}
