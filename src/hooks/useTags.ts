import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useTags(trackId: string) {
  const qc = useQueryClient();

  const { data: tags = [], isLoading } = useQuery<string[]>({
    queryKey: ['tags', trackId],
    queryFn: async () => {
      const res = await fetch(`/api/tracks/${trackId}/tags`);
      if (!res.ok) throw new Error('Failed to fetch tags');
      return res.json();
    },
  });

  const toggleTag = useMutation({
    mutationFn: async ({ tag, category, active }: { tag: string; category: string; active: boolean }) => {
      const method = active ? 'DELETE' : 'POST';
      const res = await fetch(`/api/tracks/${trackId}/tags`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, category }),
      });
      if (!res.ok) throw new Error('Toggle tag failed');
      return res.json();
    },
    onMutate: async ({ tag, active }) => {
      await qc.cancelQueries({ queryKey: ['tags', trackId] });
      const previousTags = qc.getQueryData<string[]>(['tags', trackId]) || [];
      
      const newTags = active 
        ? previousTags.filter(t => t !== tag)
        : [...previousTags, tag];

      qc.setQueryData(['tags', trackId], newTags);
      return { previousTags };
    },
    onError: (err, variables, context) => {
      if (context) qc.setQueryData(['tags', trackId], context.previousTags);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tags', trackId] });
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });

  return { tags, toggleTag, isLoading };
}
