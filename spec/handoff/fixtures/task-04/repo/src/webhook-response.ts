export type AcceptedResponse = { status: 202; body: { result: 'accepted' } };

export function acceptedResponse(): AcceptedResponse {
  return { status: 202, body: { result: 'accepted' } };
}
