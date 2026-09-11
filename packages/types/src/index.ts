/**
 * Shared shapes for every package in this repo.
 *
 * This is the contract between the four of us. If you need a shape that
 * another package will also see, add it HERE and tell the others — never
 * redeclare it locally, and never widen a type just to make your own code
 * compile. A mismatch here is the one bug that will cost us a whole evening.
 */

export * from './site.ts';
export * from './measurement.ts';
export * from './reconcile.ts';
export * from './expense.ts';
