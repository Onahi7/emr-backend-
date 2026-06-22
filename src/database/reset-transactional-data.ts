/**
 * Disabled broad reset script.
 *
 * The project policy forbids bulk wipes and deleteMany({}) cleanup flows.
 * Create a targeted cleanup script with explicit record IDs, preview counts,
 * per-category approval, and post-delete verification instead.
 */
async function resetTransactionalData() {
  throw new Error(
    'reset-transactional-data is disabled. Use a targeted cleanup script with explicit record IDs and approval.',
  );
}

void resetTransactionalData();
