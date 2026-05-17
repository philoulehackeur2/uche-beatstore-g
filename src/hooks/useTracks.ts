import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Track, TrackType } from '@/lib/types';
import { confirmToast } from '@/hooks/useToast';

export function useTracks(type: TrackType | 'all' = 'all', playlistId?: string) {
  return useQuery<Track[]>({
    queryKey: ['tracks', type, playlistId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type !== 'all') params.append('type', type);
      if (playlistId) params.append('playlist_id', playlistId);
      
      const res = await fetch(`/api/tracks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tracks');
      return res.json();
    },
  });
}

export function useUploadTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

export function useUpdateTrack(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Track>) => {
      const res = await fetch(`/api/tracks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Update failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

export function useDeleteTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const ok = await confirmToast(
        'Delete this track?',
        'This permanently removes the track from your library.',
        { confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true },
      );
      if (!ok) return;
      const res = await fetch(`/api/tracks/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}
