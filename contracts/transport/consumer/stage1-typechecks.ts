import type { Stage1Example } from './stage1.ts';

type Availability = Extract<Stage1Example, { operationId: 'readStage1Availability' }>;
type Confirmation = Extract<Stage1Example, { operationId: 'confirmStage1RfHandover' }>;
type Throttled = Extract<Confirmation['response'], { status: 429 }>;

// These compile-only negative examples guard requiredness at the consumer seam.
function requiredFields(availability: Availability, throttled: Throttled) {
  const { query, ...withoutQuery } = availability.request;
  void query;
  // @ts-expect-error Availability requires variant and requesting-unit selectors.
  const missingQuery: Availability['request'] = withoutQuery;
  const { 'retry-after': retryAfter, ...withoutRetryAfter } = throttled.headers;
  void retryAfter;
  // @ts-expect-error A contracted 429 requires the parsed Retry-After header.
  const missingRetryAfter: Throttled['headers'] = withoutRetryAfter;
  void missingQuery;
  void missingRetryAfter;
}
void requiredFields;
