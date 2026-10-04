// Storage-only subset of Wrangler 4.92.0 generated runtime types.
// Do not load Worker DOM/Response declarations into this mixed browser/server project.
interface R2ListOptions {
    limit?: number;
    prefix?: string;
    cursor?: string;
    delimiter?: string;
    startAfter?: string;
    include?: ("httpMetadata" | "customMetadata")[];
}
interface R2Bucket {
    head(key: string): Promise<R2Object | null>;
    get(key: string, options: R2GetOptions & {
        onlyIf: R2Conditional | Headers;
    }): Promise<R2ObjectBody | R2Object | null>;
    get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions & {
        onlyIf: R2Conditional | Headers;
    }): Promise<R2Object | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
    createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload>;
    resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
    delete(keys: string | string[]): Promise<void>;
    list(options?: R2ListOptions): Promise<R2Objects>;
}
interface R2MultipartUpload {
    readonly key: string;
    readonly uploadId: string;
    uploadPart(partNumber: number, value: ReadableStream | (ArrayBuffer | ArrayBufferView) | string | Blob, options?: R2UploadPartOptions): Promise<R2UploadedPart>;
    abort(): Promise<void>;
    complete(uploadedParts: R2UploadedPart[]): Promise<R2Object>;
}
interface R2UploadedPart {
    partNumber: number;
    etag: string;
}
declare abstract class R2Object {
    readonly key: string;
    readonly version: string;
    readonly size: number;
    readonly etag: string;
    readonly httpEtag: string;
    readonly checksums: R2Checksums;
    readonly uploaded: Date;
    readonly httpMetadata?: R2HTTPMetadata;
    readonly customMetadata?: Record<string, string>;
    readonly range?: R2Range;
    readonly storageClass: string;
    readonly ssecKeyMd5?: string;
    writeHttpMetadata(headers: Headers): void;
}
interface R2ObjectBody extends R2Object {
    get body(): ReadableStream;
    get bodyUsed(): boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
    bytes(): Promise<Uint8Array>;
    text(): Promise<string>;
    json<T>(): Promise<T>;
    blob(): Promise<Blob>;
}
type R2Range = {
    offset: number;
    length?: number;
} | {
    offset?: number;
    length: number;
} | {
    suffix: number;
};
interface R2Conditional {
    etagMatches?: string;
    etagDoesNotMatch?: string;
    uploadedBefore?: Date;
    uploadedAfter?: Date;
    secondsGranularity?: boolean;
}
interface R2GetOptions {
    onlyIf?: (R2Conditional | Headers);
    range?: (R2Range | Headers);
    ssecKey?: (ArrayBuffer | string);
}
interface R2PutOptions {
    onlyIf?: (R2Conditional | Headers);
    httpMetadata?: (R2HTTPMetadata | Headers);
    customMetadata?: Record<string, string>;
    md5?: ((ArrayBuffer | ArrayBufferView) | string);
    sha1?: ((ArrayBuffer | ArrayBufferView) | string);
    sha256?: ((ArrayBuffer | ArrayBufferView) | string);
    sha384?: ((ArrayBuffer | ArrayBufferView) | string);
    sha512?: ((ArrayBuffer | ArrayBufferView) | string);
    storageClass?: string;
    ssecKey?: (ArrayBuffer | string);
}
interface R2MultipartOptions {
    httpMetadata?: (R2HTTPMetadata | Headers);
    customMetadata?: Record<string, string>;
    storageClass?: string;
    ssecKey?: (ArrayBuffer | string);
}
interface R2Checksums {
    readonly md5?: ArrayBuffer;
    readonly sha1?: ArrayBuffer;
    readonly sha256?: ArrayBuffer;
    readonly sha384?: ArrayBuffer;
    readonly sha512?: ArrayBuffer;
    toJSON(): R2StringChecksums;
}
interface R2StringChecksums {
    md5?: string;
    sha1?: string;
    sha256?: string;
    sha384?: string;
    sha512?: string;
}
interface R2HTTPMetadata {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: Date;
}
type R2Objects = {
    objects: R2Object[];
    delimitedPrefixes: string[];
} & ({
    truncated: true;
    cursor: string;
} | {
    truncated: false;
});
interface R2UploadPartOptions {
    ssecKey?: (ArrayBuffer | string);
}
interface D1Meta {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changed_db: boolean;
    changes: number;
    /**
     * The region of the database instance that executed the query.
     */
    served_by_region?: string;
    /**
     * The three letters airport code of the colo that executed the query.
     */
    served_by_colo?: string;
    /**
     * True if-and-only-if the database instance that executed the query was the primary.
     */
    served_by_primary?: boolean;
    timings?: {
        /**
         * The duration of the SQL query execution by the database instance. It doesn't include any network time.
         */
        sql_duration_ms: number;
    };
    /**
     * Number of total attempts to execute the query, due to automatic retries.
     * Note: All other fields in the response like `timings` only apply to the last attempt.
     */
    total_attempts?: number;
}
interface D1Response {
    success: true;
    meta: D1Meta & Record<string, unknown>;
    error?: never;
}
type D1Result<T = unknown> = D1Response & {
    results: T[];
};
interface D1ExecResult {
    count: number;
    duration: number;
}
type D1SessionConstraint =
// Indicates that the first query should go to the primary, and the rest queries
// using the same D1DatabaseSession will go to any replica that is consistent with
// the bookmark maintained by the session (returned by the first query).
'first-primary'
// Indicates that the first query can go anywhere (primary or replica), and the rest queries
// using the same D1DatabaseSession will go to any replica that is consistent with
// the bookmark maintained by the session (returned by the first query).
 | 'first-unconstrained';
type D1SessionBookmark = string;
declare abstract class D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1ExecResult>;
    /**
     * Creates a new D1 Session anchored at the given constraint or the bookmark.
     * All queries executed using the created session will have sequential consistency,
     * meaning that all writes done through the session will be visible in subsequent reads.
     *
     * @param constraintOrBookmark Either the session constraint or the explicit bookmark to anchor the created session.
     */
    withSession(constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession;
    /**
     * @deprecated dump() will be removed soon, only applies to deprecated alpha v1 databases.
     */
    dump(): Promise<ArrayBuffer>;
}
declare abstract class D1DatabaseSession {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    /**
     * @returns The latest session bookmark across all executed queries on the session.
     *          If no query has been executed yet, `null` is returned.
     */
    getBookmark(): D1SessionBookmark | null;
}
declare abstract class D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName: string): Promise<T | null>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(options: {
        columnNames: true;
    }): Promise<[
        string[],
        ...T[]
    ]>;
    raw<T = unknown[]>(options?: {
        columnNames?: false;
    }): Promise<T[]>;
}
declare module 'cloudflare:workers' { export const env: {DB:D1Database; BUCKET:R2Bucket}; }
