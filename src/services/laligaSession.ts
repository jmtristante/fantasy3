import { supabase } from '../lib/supabase';

interface LaLigaSession {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_on?: number;
  laliga_user_id?: string;
  laliga_username?: string;
}

export async function saveLaLigaSession(session: LaLigaSession): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('saveLaLigaSession: no authenticated user', authError);
    return false;
  }

  const { error } = await supabase
    .from('laliga_sessions')
    .upsert({
      user_id: user.id,
      access_token: session.access_token,
      id_token: session.id_token || null,
      refresh_token: session.refresh_token || null,
      expires_on: session.expires_on || null,
      laliga_user_id: session.laliga_user_id || null,
      laliga_username: session.laliga_username || null,
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('saveLaLigaSession error:', error);
    return false;
  }
  return true;
}

export async function loadLaLigaSession(): Promise<LaLigaSession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('laliga_sessions')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return null;
  return {
    access_token: data.access_token,
    id_token: data.id_token,
    refresh_token: data.refresh_token,
    expires_on: data.expires_on,
    laliga_user_id: data.laliga_user_id,
    laliga_username: data.laliga_username,
  };
}

export async function deleteLaLigaSession(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('laliga_sessions')
    .delete()
    .eq('user_id', user.id);

  return !error;
}
