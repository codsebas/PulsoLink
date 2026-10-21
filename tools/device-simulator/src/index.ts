import 'dotenv/config';
import { readSettings } from './config.js';
import { Simulator, FatalSimulatorError } from './simulator.js';

async function main(): Promise<void> {
  const simulator = new Simulator(readSettings(process.env));
  const stop = () => simulator.stop();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { await simulator.run(); }
  catch (error) {
    console.error(error instanceof FatalSimulatorError ? error.message : 'Error del simulador; revisar configuración.');
    process.exitCode = 1;
  } finally {
    simulator.stop();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
