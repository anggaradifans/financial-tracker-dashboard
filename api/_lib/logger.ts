export type LogFields = Record<string, unknown>;

export interface Logger {
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}

function write(level: string, fields: LogFields, message: string): void {
  // One JSON line per event so Vercel's log drain can index the fields.
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...fields }));
}

export const jsonLogger: Logger = {
  info: (fields, message) => write('info', fields, message),
  warn: (fields, message) => write('warn', fields, message),
  error: (fields, message) => write('error', fields, message),
};
