// Log helpers when debugging process.env.DEBUG=true
export const debug = (...args: any[]) => {
  if (process.env.DEBUG) {
    console.log(...args);
  }
};
