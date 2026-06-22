# Data Cleanup Guide

Broad transactional resets are disabled.

Do not use `deleteMany({})`, raw collection wipes, or the old `npm run reset:data`
workflow. Cleanup must be targeted:

1. Generate a preview with affected collection names, counts, and exact record IDs.
2. Confirm each category with the user.
3. Run deletion only with explicit filters such as `{ _id: { $in: [...] } }`.
4. Verify remaining counts immediately after deletion.
5. Report deleted and remaining counts.

The old `reset-transactional-data.ts` script now fails closed by design.
