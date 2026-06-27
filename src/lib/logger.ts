const DEBUG = process.env.DEBUG_LOGS === "true";

export const log = {
  info(stage: string, msg: string, data?: Record<string, unknown>) {
    if (!DEBUG) return;
    const prefix = `[log:${stage}]`;
    data ? console.log(prefix, msg, data) : console.log(prefix, msg);
  },
  error(stage: string, msg: string, err?: unknown) {
    // errors always surface regardless of DEBUG flag
    console.error(`[log:${stage}] ERROR: ${msg}`, err ?? "");
  },
};
