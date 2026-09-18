import { z } from 'zod';

// M0 synthetic policy only: no provider data or free text is representable.
export const syntheticNamespace = 'abisso.synthetic.m0/1';
export const syntheticExtensionBytes = 256;
export const syntheticExtensions = z.strictObject({
  [syntheticNamespace]: z.strictObject({
    fixture: z.literal('quarantine'),
    requires_interpretation: z.literal(true),
  }),
});
export type SyntheticExtensions = z.infer<typeof syntheticExtensions>;
