// عالم الشراء — shared backend (Supabase). If it is not configured or cannot be
// reached, every function fails softly and the app keeps working on this device only.

// The publishable key is meant to be public: what each user may read or write is
// enforced by the row-level-security rules in schema.sql, not by hiding this key.
export const SUPABASE_URL = 'https://jfchuxvyfzywbraniibq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_RAaT-jRKfQw_J_7z6P1MeA_A1a2EJLS';

let sb = null, loading = null;
export const configured = () => !!(SUPABASE_URL && SUPABASE_KEY);

export async function client(){
  if(sb) return sb;
  if(!configured()) return null;
  loading ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(m => (sb = m.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:true, autoRefreshToken:true}})))
    .catch(e => { console.warn('backend unavailable', e); loading = null; return null; });
  return loading;
}

export async function myId(){
  const c = await client(); if(!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user?.id || null;
}

// Creates a private anonymous account the first time someone signs up on this device.
async function ensureUser(){
  const c = await client(); if(!c) throw new Error('offline');
  const id = await myId(); if(id) return id;
  const { data, error } = await c.auth.signInAnonymously();
  if(error) throw error;
  return data.user.id;
}

export async function saveProfile(p){
  const c = await client(); if(!c) return false;
  const id = await ensureUser();
  const a = await c.from('profiles').upsert({ id, phone:p.phone, age:p.age, guardian:!!p.guardian, consent_at:p.consentAt });
  if(a.error) throw a.error;
  const b = await c.from('avatars').upsert({ id, name:p.name, avatar:p.avatar, updated_at:new Date().toISOString() });
  if(b.error) throw b.error;
  return true;
}

export async function loadProfile(){
  const c = await client(); if(!c) return null;
  const id = await myId(); if(!id) return null;
  const [a, b] = await Promise.all([
    c.from('profiles').select('*').eq('id', id).maybeSingle(),
    c.from('avatars').select('*').eq('id', id).maybeSingle(),
  ]);
  if(a.error || b.error || !a.data || !b.data) return null;
  return { name:b.data.name, phone:a.data.phone, age:a.data.age, guardian:a.data.guardian, consentAt:a.data.consent_at,
           avatar:b.data.avatar, avatarDone:true, createdAt:a.data.created_at };
}

export async function deleteMe(){
  const c = await client(); if(!c) return false;
  const id = await myId(); if(!id) return false;
  // remove your uploaded photos / 3D files first (storage does not cascade)
  try{ const { data } = await c.storage.from(BUCKET).list(id, { limit: 1000 });
       if(data?.length) await c.storage.from(BUCKET).remove(data.map(f => `${id}/${f.name}`)); }catch(e){ console.warn(e); }
  const { error } = await c.rpc('delete_me'); if(error) throw error;
  await c.auth.signOut();
  return true;
}

export async function loadPlots(){
  const c = await client(); if(!c) return null;
  const { data, error } = await c.from('plots').select('plot_id,owner,owner_name,store,updated_at');
  if(error){ console.warn(error); return null; }
  return data;
}

// Claim a plot or update your shop on it. Fails with code 'taken' if someone else owns it.
export async function savePlot(plotId, store, ownerName){
  const c = await client(); if(!c) return false;
  const owner = await ensureUser();
  const row = { plot_id:plotId, owner, owner_name:ownerName, store:store||null, updated_at:new Date().toISOString() };
  const { error } = await c.from('plots').upsert(row);
  if(error){
    if(error.code === '23505' || error.code === '42501' || /row-level security/i.test(error.message)) { const e = new Error('taken'); e.code = 'taken'; throw e; }
    throw error;
  }
  return true;
}

export async function onPlotChange(cb){
  const c = await client(); if(!c) return;
  c.channel('plots-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'plots' }, payload => cb(payload))
    .subscribe();
}

/* ---------- merchant portal ---------- */
export const BUCKET = 'shop-media';
const MEDIA_PREFIX = () => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
// only accept media that lives in our own bucket (no outside links, no tracking pixels)
export const mediaOk = u => typeof u === 'string' && configured() && u.startsWith(MEDIA_PREFIX()) && !/[\s"'<>]/.test(u);

export async function getPlot(plotId){
  const c = await client(); if(!c) return null;
  const { data, error } = await c.from('plots').select('plot_id,owner,owner_name,store,updated_at').eq('plot_id', plotId).maybeSingle();
  if(error){ console.warn(error); return null; }
  return data;
}

// Upload a Blob into your own folder; returns its public link.
export async function uploadMedia(blob, ext, contentType){
  const c = await client(); if(!c) throw new Error('offline');
  const id = await ensureUser();
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await c.storage.from(BUCKET).upload(path, blob, { contentType, upsert:false, cacheControl:'31536000' });
  if(error) throw error;
  return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function requestBuild({plotId, shopName, notes, contact}){
  const c = await client(); if(!c) throw new Error('offline');
  await ensureUser();
  const { error } = await c.from('build_requests').insert({ plot_id:plotId, shop_name:shopName, notes, contact });
  if(error) throw error;
  return true;
}

export async function myBuildRequests(plotId){
  const c = await client(); if(!c) return [];
  if(!(await myId())) return [];
  const { data } = await c.from('build_requests').select('id,notes,status,created_at').eq('plot_id', plotId).order('created_at', { ascending:false });
  return data || [];
}

/* ---------- safety ---------- */
export async function reportUser({reported, reason, context}){
  const c = await client(); if(!c) throw new Error('offline');
  await ensureUser();
  const { error } = await c.from('reports').insert({ reported, reason, context });
  if(error) throw error;
  return true;
}
