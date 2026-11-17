/**
 * An expected problem with a message that is safe and useful to show to the
 * person using the app (or to the Rovo agent). Anything else that is thrown
 * is treated as unexpected, logged, and reported generically.
 */
export class UserError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
}
