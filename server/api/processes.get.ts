import { processProvider } from '../utils/process/factory';

export default defineEventHandler(async () => {
  try {
    if (processProvider.listProcesses) {
      const list = await processProvider.listProcesses();
      return { processes: list };
    }
    return { processes: [] };
  } catch {
    return { processes: [] };
  }
});
