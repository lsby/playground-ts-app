export type 本地优先远程同步错误代码 =
  | 'NOT_LOGGED_IN'
  | 'SCHEMA_MISMATCH'
  | 'REMOTE_DATA_CHANGED'
  | 'INVALID_SYNC_DATABASE'

export class 本地优先远程同步错误 extends Error {
  public constructor(
    public readonly code: 本地优先远程同步错误代码,
    message: string,
  ) {
    super(message)
    this.name = '本地优先远程同步错误'
  }
}

export class 本地优先远程不可用错误 extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = '本地优先远程不可用错误'
  }
}
