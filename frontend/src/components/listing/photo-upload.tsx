'use client';

/**
 * Property-level photo section on the listing editor. The gallery mechanics
 * (signed upload, reorder, labels, cover, delete) live in PhotoManager, which
 * the off-campus inventory editor reuses per unit type — a landlord manages
 * "photos of the building" here and "photos of this room" there with the same
 * controls.
 */

import { useState } from 'react';

import { PhotoManager } from '@/components/listing/photo-manager';
import type { ListingView, PhotoView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: Partial<ListingView>) => void;
}

export function PhotoUpload({ listing, onSaved }: Props) {
  const [photos, setPhotos] = useState<PhotoView[]>(listing.photos);

  return (
    <PhotoManager
      listingId={listing.id}
      photos={photos}
      onChange={(next) => {
        setPhotos(next);
        onSaved({ photos: next });
      }}
      title="Photos"
      description="Drag to reorder. First photo is the cover."
      emptyTitle="Add property photos"
      emptyHint="Drag files here or click to browse. Add at least one photo."
    />
  );
}
