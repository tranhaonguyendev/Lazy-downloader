function human(n) {
    if (n == null || Number.isNaN(Number(n)))
        return "NA";
    let x = Number(n);
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    for (const u of units) {
        if (x < 1024)
            return `${x.toFixed(2)}${u}`;
        x /= 1024;
    }
    return `${x.toFixed(2)}PiB`;
}
export function defaultProgressPrinter() {
    let last = 0;
    return (d) => {
        const st = d?.status;
        const fn = d?.filename || "";
        const dl = d?.downloaded_bytes;
        const tt = d?.total_bytes;
        const sp = d?.speed;
        const eta = d?.eta;
        const now = Date.now();
        if (st === "downloading") {
            if (now - last < 200)
                return;
            last = now;
            let line;
            if (tt) {
                const pct = ((Number(dl || 0) / Number(tt)) * 100).toFixed(2).padStart(6, " ");
                line = `[download] ${pct}% of ${human(tt)} at ${human(sp ?? null)}/s ETA ${eta}s : ${fn}`;
            }
            else {
                line = `[download] ${human(dl ?? null)} at ${human(sp ?? null)}/s : ${fn}`;
            }
            process.stdout.write(`\r${line.slice(0, 180)}          `);
        }
        else if (st === "finished") {
            process.stdout.write(`\r[download] 100% of ${human(dl ?? null)} in ${Number(d?.elapsed || 0).toFixed(1)}s : ${fn}          \n`);
        }
    };
}
