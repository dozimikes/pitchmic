'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceleratorApi,
  AcceleratorProgram,
  OrganizationSummary,
  UserContextResponse,
  ActiveContext,
} from '@/lib/acceleratorApi';

interface ProgramContextType {
  userContext: UserContextResponse | null;
  organizations: OrganizationSummary[];
  /**
   * The organization that owns the active program. It is derived rather than
   * selected: nothing in the database maps this account to a set of
   * organizations, so a second "switch organization" axis would be a browser
   * preference presented as tenancy.
   */
  activeOrganization: OrganizationSummary | null;
  programs: AcceleratorProgram[];
  activeProgram: AcceleratorProgram | null;
  activeProgramId: number | null;
  setActiveProgramId: (id: number) => Promise<void>;
  /**
   * Set when the server refused a program switch. The header shows it instead
   * of continuing to display a context nobody confirmed.
   */
  contextError: string | null;
  clearContextError: () => void;
  activeContext: ActiveContext | null;
  isLoading: boolean;
  programsError: boolean;
  refetchContext: () => void;
}

const ProgramContext = React.createContext<ProgramContextType>({
  userContext: null,
  organizations: [],
  activeOrganization: null,
  programs: [],
  activeProgram: null,
  activeProgramId: null,
  setActiveProgramId: async () => {},
  contextError: null,
  clearContextError: () => {},
  activeContext: null,
  isLoading: false,
  programsError: false,
  refetchContext: () => {},
});

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = React.useState<number | null>(null);
  const [contextError, setContextError] = React.useState<string | null>(null);

  // 1. Fetch unified user context
  const {
    data: userContext,
    isLoading: loadingContext,
    refetch: refetchContext,
  } = useQuery({
    queryKey: ['accelerator-user-context'],
    queryFn: async () => {
      try {
        return await acceleratorApi.getContext();
      } catch {
        return null;
      }
    },
  });

  // 2. Fetch programs
  const {
    data: programs = [],
    isLoading: loadingPrograms,
    isError: programsFailed,
  } = useQuery({
    queryKey: ['accelerator-programs'],
    queryFn: acceleratorApi.getPrograms,
  });

  const organizations: OrganizationSummary[] = userContext?.organizations || [];

  // Initialize selected program
  React.useEffect(() => {
    if (userContext?.active_context?.program_id && selectedProgramId === null) {
      setSelectedProgramId(userContext.active_context.program_id);
    } else if (programs.length > 0) {
      if (selectedProgramId === null || !programs.some((p) => p.id === selectedProgramId)) {
        setSelectedProgramId(programs[0].id);
      }
    }
  }, [userContext, programs, selectedProgramId]);

  // Deep links: ?program=<id> selects that program once the list is loaded.
  // Read from window.location (not useSearchParams) to keep this provider
  // free of Suspense-boundary coupling.
  const appliedProgramParam = React.useRef(false);
  React.useEffect(() => {
    if (appliedProgramParam.current || programs.length === 0) return;
    const param = Number(new URLSearchParams(window.location.search).get('program'));
    if (Number.isFinite(param) && programs.some((p) => p.id === param)) {
      appliedProgramParam.current = true;
      setSelectedProgramId(param);
    }
  }, [programs]);

  const activeProgram = programs.find((p) => p.id === selectedProgramId) || programs[0] || null;

  const activeOrganization = React.useMemo(() => {
    if (!activeProgram) return null;
    return organizations.find((o) => o.program_ids.includes(activeProgram.id)) || null;
  }, [organizations, activeProgram]);

  const setActiveProgramId = React.useCallback(
    async (id: number) => {
      const previous = selectedProgramId;
      setSelectedProgramId(id);
      setContextError(null);
      try {
        const updated = await acceleratorApi.switchContext({ program_id: id });
        queryClient.setQueryData(['accelerator-user-context'], updated);
        queryClient.invalidateQueries({ queryKey: ['accelerator'] });
      } catch (err) {
        // A switch the server did not accept must not stay on screen. The old
        // code set local state first and swallowed the failure, so the header
        // kept asserting a program the backend had refused.
        setSelectedProgramId(previous);
        setContextError(
          err instanceof Error && err.message
            ? err.message
            : 'The server did not accept that program, so this view stayed where it was.'
        );
      }
    },
    [selectedProgramId, queryClient]
  );

  const clearContextError = React.useCallback(() => setContextError(null), []);

  return (
    <ProgramContext.Provider
      value={{
        userContext: userContext || null,
        organizations,
        activeOrganization,
        programs,
        activeProgram,
        activeProgramId: activeProgram?.id ?? null,
        setActiveProgramId,
        contextError,
        clearContextError,
        activeContext: userContext?.active_context || null,
        isLoading: loadingContext || loadingPrograms,
        programsError: programsFailed,
        refetchContext,
      }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function useActiveProgram() {
  const context = React.useContext(ProgramContext);
  if (!context) {
    throw new Error('useActiveProgram must be used within a ProgramProvider');
  }
  return context;
}
