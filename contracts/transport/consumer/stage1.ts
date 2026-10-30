// Compile-time consumer examples only. This file does not send requests or retry.
import type { operations, components } from '../generated/api.d.ts';
import { routes } from '../generated/routes.ts';

type Stage1Operation = {
  [K in keyof operations]: K extends `${string}Stage1${string}` ? K : never
}[keyof operations];
type Parameters<K extends Stage1Operation> = operations[K]['parameters'];
type Query<K extends Stage1Operation> = undefined extends Parameters<K>['query']
  ? { query?: Parameters<K>['query'] } : { query: Parameters<K>['query'] };
type Headers<R> = R extends { headers: infer H }
  ? { 'cache-control': H extends { 'Cache-Control': infer C } ? C : never }
    & (H extends { 'Retry-After': infer T } ? { 'retry-after': T } : { 'retry-after'?: never })
  : never;
type Body<K extends Stage1Operation> = operations[K] extends {
  requestBody: { content: { 'application/json': infer B } }
} ? { mediaType: 'application/json'; body: B } : { body?: never; mediaType?: never };
type Result<K extends Stage1Operation> = {
  [S in keyof operations[K]['responses']]: operations[K]['responses'][S] extends {
    content: infer C
  } ? {
    [M in keyof C]: { status: S; mediaType: M; body: C[M]; headers: Headers<operations[K]['responses'][S]> }
  }[keyof C] : never
}[keyof operations[K]['responses']];

// After the existing scoped lookup returns a terminal identity, validate its
// original action payload against that operation's 200 schema before narrowing.
export type Stage1Recovered<K extends Stage1Operation> = Extract<Result<K>, { status: 200 }>;

export type Stage1Example = {
  [K in Stage1Operation]: {
    name: string;
    operationId: K;
    method: Lowercase<typeof routes[K]['method']>;
    // Templated path is validated against OpenAPI by validateExchange.
    path: string;
    request: { path: Parameters<K>['path']; header: Parameters<K>['header'] } & Query<K> & Body<K>;
    response: Result<K>;
  }
}[Stage1Operation];

export type CommittedStage1Change = components['schemas']['Stage1CommitEvent'];
export type Stage1LocalAttempt = {
  chapterId: string;
  idempotencyKey: string;
  // Preserve draft separately from refreshed server state and the original command.
  originalCommand: Stage1Example['request'];
  state: 'editing' | 'in_flight' | 'uncertain' | 'resolved';
};
