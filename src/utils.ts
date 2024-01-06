import path from "path";

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeout<T>(promiseGen: (timeout: Promise<any>) => Promise<T>, ms: number) {
    const timeoutPromise = new Promise((resolve, reject) => {
        const promise = promiseGen(timeoutPromise);
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        promise
            .then((value) => resolve(value))
            .catch((reason) => reject(reason))
            .finally(() => clearTimeout(timer));
    });
}

export function promiseState(promise: Promise<any>): Promise<"pending" | "fulfilled" | "rejected">  {
    const t = {};
    return Promise.race([promise, t])
        .then(v => (v === t) ? "pending" : "fulfilled", () => "rejected");
}

export function arePathsEqual(path1: string, path2: string) {
    path1 = path.resolve(path1)
    path2 = path.resolve(path2)
    if (process.platform === "win32") {
        return path1.toLowerCase() === path2.toLowerCase();
    }
    return path1 === path2;
}