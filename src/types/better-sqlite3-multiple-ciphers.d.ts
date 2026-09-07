/**
 * Minimal ambient typings for the subset of the better-sqlite3-multiple-ciphers
 * API this project uses. The package ships prebuilt N-API binaries and no
 * bundled types; we only need the synchronous surface below.
 */
declare module 'better-sqlite3-multiple-ciphers' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<Row = unknown> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Row | undefined;
    all(...params: unknown[]): Row[];
    iterate(...params: unknown[]): IterableIterator<Row>;
  }

  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    readonly open: boolean;
    readonly name: string;
    pragma(source: string, options?: { simple?: boolean }): unknown;
    exec(source: string): this;
    prepare<Row = unknown>(source: string): Statement<Row>;
    transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;
    close(): this;
  }

  export = Database;
}
