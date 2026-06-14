import type { Database } from './supabase.gen.js';

export type { Database };

/**
 * Row, Insert, and Update helpers for any public table by name.
 *
 *   type Song = Tables<'songs'>;
 *   type NewSong = TablesInsert<'songs'>;
 *   type SongPatch = TablesUpdate<'songs'>;
 */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/**
 * Public enum types by name.
 *
 *   type Visibility = Enums<'visibility'>;  // 'private' | 'shared' | 'public'
 */
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
