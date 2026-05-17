'use server';

import { isSupabaseConfigured, createServiceClient } from '@/lib/db';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getAll, insert, update } from '@/lib/local-store';

export async function getCreatorProfile() {
  try {
    if (isSupabaseConfigured()) {
      const cookieClient = await createServerClient();
      const { data: { user } } = await cookieClient.auth.getUser();
      if (!user) {
        return { error: 'Not authenticated', profile: null };
      }

      const admin = createServiceClient();
      const { data: profile, error } = await admin
        .from('creator_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return { profile: profile || null };
    }

    // Local-store fallback
    const all = getAll('creator_profiles' as any) || [];
    const profile = all.find((p: any) => p.user_id === 'local-user') || null;
    return { profile };
  } catch (error: any) {
    console.error('getCreatorProfile Server Action error:', error);
    return { error: error.message, profile: null };
  }
}

export async function updateCreatorProfile(payload: any) {
  try {
    if (isSupabaseConfigured()) {
      const cookieClient = await createServerClient();
      const { data: { user } } = await cookieClient.auth.getUser();
      if (!user) {
        return { error: 'Not authenticated', profile: null };
      }

      const admin = createServiceClient();
      const { data: profile, error } = await admin
        .from('creator_profiles')
        .upsert({
          user_id: user.id,
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return { profile };
    }

    // Local-store fallback
    const all = getAll('creator_profiles' as any) || [];
    let profile = all.find((p: any) => p.user_id === 'local-user');
    if (profile) {
      profile = update('creator_profiles' as any, profile.id, payload);
    } else {
      profile = insert('creator_profiles' as any, {
        user_id: 'local-user',
        ...payload,
      });
    }

    return { profile };
  } catch (error: any) {
    console.error('updateCreatorProfile Server Action error:', error);
    return { error: error.message, profile: null };
  }
}
