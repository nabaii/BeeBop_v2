'use client';

/**
 * Property-level gallery section on the listing editor — photos, then video
 * tours. The gallery mechanics live in PhotoManager and VideoManager, which the
 * off-campus inventory editor reuses per unit type: a landlord manages "photos
 * and tours of the building" here and "of this room" there, with the same
 * controls.
 */

import { useState } from 'react';

import { PhotoManager } from '@/components/listing/photo-manager';
import { VideoManager } from '@/components/listing/video-manager';
import { MAX_VIDEOS_PER_PROPERTY_GALLERY, type ListingView, type PhotoView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: Partial<ListingView>) => void;
}

export function PhotoUpload({ listing, onSaved }: Props) {
  const [photos, setPhotos] = useState<PhotoView[]>(listing.photos);
  const [videos, setVideos] = useState<PhotoView[]>(listing.videos ?? []);

  return (
    <>
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
      <VideoManager
        listingId={listing.id}
        videos={videos}
        onChange={(next) => {
          setVideos(next);
          onSaved({ videos: next });
        }}
        maxVideos={MAX_VIDEOS_PER_PROPERTY_GALLERY}
        title="Video tours"
        description="Optional. A short walkthrough shows what photos can't."
        emptyTitle="Add a video tour"
        emptyHint="A slow walk through the property — seekers renting from another city rely on it."
      />
    </>
  );
}
