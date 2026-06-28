const DEBUG = process.env.DEBUG_LOGS === 'true';

export const log = {
  info(stage: string, msg: string, data?: Record<string, unknown>) {
    if (!DEBUG) return;
    const prefix = `[log:${stage}]`;
    if (data) {
      console.log(prefix, msg, data);
    } else {
      console.log(prefix, msg);
    }
  },
  warn(stage: string, msg: string, data?: Record<string, unknown>) {
    // warnings always surface regardless of DEBUG flag
    if (data) {
      console.warn(`[log:${stage}] WARN: ${msg}`, data);
    } else {
      console.warn(`[log:${stage}] WARN: ${msg}`);
    }
  },
  error(stage: string, msg: string, err?: unknown) {
    // errors always surface regardless of DEBUG flag
    console.error(`[log:${stage}] ERROR: ${msg}`, err ?? '');
  },
};
