import { readFileSync } from 'node:fs'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const files = [
  '../supabase/functions/create-checkout/index.ts',
  '../supabase/functions/stripe-webhook/index.ts',
  '../supabase/functions/stripe-replay/index.ts',
  '../supabase/functions/_shared/stripe-event-processor.ts',
  '../supabase/functions/provider-payouts/index.ts',
  '../supabase/functions/send-notifications/index.ts',
]

describe('hardened Supabase Edge Functions', () => {
  for (const relativePath of files) {
    it(`has valid TypeScript syntax: ${relativePath}`, () => {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
      const result = ts.transpileModule(source, {
        fileName: relativePath,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      })

      const errors = (result.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )

      expect(errors).toEqual([])
    })
  }
})
