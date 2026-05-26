export type ActionResult<T = undefined> =
  | (T extends undefined ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export type ActionOk<T = undefined> = T extends undefined
  ? { success: true }
  : { success: true } & T;
