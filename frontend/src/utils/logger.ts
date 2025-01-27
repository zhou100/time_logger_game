const isDevelopment = process.env.NODE_ENV === 'development';

class Logger {
  static info(message: string, ...args: any[]) {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  static error(message: string, error?: any) {
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, error);
    }
  }

  static warn(message: string, ...args: any[]) {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  static debug(message: string, ...args: any[]) {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  static state(action: string, prevState: any, nextState: any) {
    if (isDevelopment) {
      console.group(`[STATE] ${action}`);
      console.log('Previous State:', prevState);
      console.log('Next State:', nextState);
      console.groupEnd();
    }
  }
}

export default Logger;
