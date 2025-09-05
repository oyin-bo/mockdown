import { runOrchestrator } from './orchestrator';
import { runWorker } from './worker';

// Entrypoint: dispatch between orchestrator and worker based on --worker flag
const args = process.argv.slice(2);
if (args.includes('--worker')) {
  runWorker(process.argv.slice(2)).catch(err => { console.error(err); process.exit(2); });
} else {
  runOrchestrator(process.argv.slice(2)).catch(err => { console.error(err); process.exit(1); });
}
