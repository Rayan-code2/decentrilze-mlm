// Silence the annoying Appwrite SDK version mismatch warnings from spamming the console at startup
const originalWarn = console.warn;
const originalLog = console.log;
const originalError = console.error;

const shouldSuppress = (msg: any) => {
    if (typeof msg === 'string') {
        const str = msg.toLowerCase();
        return str.includes('sdk is built for appwrite') || 
               str.includes('current appwrite server version') || 
               str.includes('please downgrade your sdk') ||
               str.includes('appwrite version:') ||
               str.includes('appwrite.io/docs/sdks');
    }
    return false;
};

console.warn = function (...args: any[]) {
    if (args.length > 0 && shouldSuppress(args[0])) return;
    originalWarn.apply(console, args);
};

console.log = function (...args: any[]) {
    if (args.length > 0 && shouldSuppress(args[0])) return;
    originalLog.apply(console, args);
};

console.error = function (...args: any[]) {
    if (args.length > 0 && shouldSuppress(args[0])) return;
    originalError.apply(console, args);
};

// Also handle Node process warning emitter to completely suppress it
try {
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function (warning: any, ...args: any[]) {
        const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
        if (shouldSuppress(msg)) return;
        originalEmitWarning.call(process, warning, ...args);
    };
} catch (e) {
    // Fail-safe
}
