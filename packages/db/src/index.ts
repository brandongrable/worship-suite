/**
 * Placeholder until the Supabase project exists. Once it does:
 *
 *   pnpm dlx supabase gen types typescript \
 *     --project-id <SUPABASE_PROJECT_REF> > src/supabase.gen.ts
 *
 * Then re-export the generated `Database` type and add thin typed-client
 * helpers here (server-side service-role + browser anon variants).
 */
export type DatabasePlaceholder = {
  __note: 'awaiting supabase gen types';
};
