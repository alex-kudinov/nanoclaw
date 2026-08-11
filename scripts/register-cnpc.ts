/** Source-checkout wrapper. Production uses the immutable compiled CLI at
 * `dist/cnpc-register.js` from the verified release. */
import { runCnpcRegistrationCli } from '../src/cnpc-register.js';

runCnpcRegistrationCli();
