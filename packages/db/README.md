# @worship/db

Generated Supabase types + thin client helpers.

Currently a placeholder. Wire it up once the Supabase project is
created:

```bash
# from Worship_Suite/packages/db
pnpm dlx supabase gen types typescript \
    --project-id <SUPABASE_PROJECT_REF> > src/supabase.gen.ts
```

Then replace `index.ts` with real exports.
