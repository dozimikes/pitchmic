'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Loader2, HandCoins } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { Offer } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { OfferDetailIntelligenceModal } from '@/components/offers/OfferDetailIntelligenceModal';
import { OfferRow } from '@/components/offers/OfferRow';
import { useAuth } from '@/hooks/useAuth';

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isInvestor } = useAuth();
  const offerId = params.id as string;

  const { data: offer, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: async () => {
      return apiGet<Offer>(`/offers/${offerId}/`);
    },
    enabled: Boolean(offerId),
  });

  const [modalOpen, setModalOpen] = React.useState(true);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-orange-500" />
      </div>
    );
  }

  if (isError || !offer) {
    return (
      <div className="space-y-4">
        <Link href="/offers">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to offers
          </Button>
        </Link>
        <Card className="border-dashed bg-red-50/60 border-red-200">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="font-semibold text-red-700">Offer not found</p>
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : 'The requested offer does not exist or has been removed.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/offers">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to all offers
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalOpen(true)}
        >
          Open Intelligence Deep Dive
        </Button>
      </div>

      <OfferRow
        offer={offer}
        viewAs={isInvestor ? 'investor' : 'startup'}
        onOpen={() => setModalOpen(true)}
      />

      <OfferDetailIntelligenceModal
        offer={offer}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        perspective={isInvestor ? 'investor' : 'startup'}
      />
    </div>
  );
}
