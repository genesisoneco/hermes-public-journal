// Prints the Cloudflare account id that owns doaia.com (for wrangler's
// CLOUDFLARE_ACCOUNT_ID), so no account id has to be stored in the repo.
import { zone } from "./cf.mjs";

const z = await zone();
process.stdout.write(z.account.id);
