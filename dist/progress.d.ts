export interface ProgressPayload {
    status: "downloading" | "finished" | string;
    filename?: string;
    downloaded_bytes?: number;
    total_bytes?: number | null;
    elapsed?: number;
    eta?: number | null;
    speed?: number | null;
}
export declare function defaultProgressPrinter(): (d: ProgressPayload) => void;
