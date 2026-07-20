import 'dotenv/config';
import { refreshCatalog } from '../src/lib/catalog';

refreshCatalog()
  .then((count) => {
    console.log(`Catalog refreshed: ${count} problems`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Catalog refresh failed:', err);
    process.exit(1);
  });
