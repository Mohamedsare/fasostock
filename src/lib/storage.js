/**
 * FasoStock - Upload fichiers vers Supabase Storage
 */
import { supabase } from '@/lib/supabase';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_MB = 5;

export async function uploadFile(file, bucket = 'uploads') {
  if (!file || !file.size) throw new Error('Aucun fichier sélectionné.');

  const type = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(type)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG, GIF ou WebP.');
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).`);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: type,
  });

  if (error) {
    if (error.message?.includes('Bucket not found') || error.message?.includes('bucket')) {
      throw new Error('Espace de stockage non configuré. Créez le bucket "uploads" dans Supabase (Storage).');
    }
    if (error.message?.includes('policy') || error.message?.includes('denied')) {
      throw new Error('Droits d\'upload insuffisants. Vérifiez les politiques Storage (RLS).');
    }
    throw new Error(error.message || 'Échec de l\'upload.');
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { file_url: publicUrl };
}
