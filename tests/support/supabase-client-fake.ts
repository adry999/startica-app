import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@core/supabase/types'

export interface RecordedOperation {
  method: string
  args: unknown[]
}

export interface RecordedQuery {
  target: string
  operations: RecordedOperation[]
}

export interface FakeResponse {
  data: unknown
  error: { code: string, message: string, details: string, hint: string } | null
  status: number
}

export function successResponse(data: unknown): FakeResponse {
  return { data, error: null, status: 200 }
}

export function refusalResponse(code: string, status: number): FakeResponse {
  return { data: null, error: { code, message: `database error ${code}`, details: '', hint: '' }, status }
}

export const networkFailureResponse: FakeResponse = {
  data: null,
  error: { code: '', message: 'FetchError: fetch failed', details: '', hint: '' },
  status: 0,
}

// Records every chained builder call and resolves the chain to the scripted
// response, so tests assert tenant filters without re-mocking the builder shape.
export function createSupabaseClientFake(respond: (query: RecordedQuery) => FakeResponse) {
  const queries: RecordedQuery[] = []

  function chainFor(query: RecordedQuery): unknown {
    const chain: unknown = new Proxy({}, {
      get(_target, property) {
        if (property === 'then') {
          return (onFulfilled: (response: FakeResponse) => unknown, onRejected: (reason: unknown) => unknown) =>
            Promise.resolve().then(() => respond(query)).then(onFulfilled, onRejected)
        }
        return (...args: unknown[]) => {
          query.operations.push({ method: String(property), args })
          return chain
        }
      },
    })
    return chain
  }

  function startQuery(target: string, firstOperation?: RecordedOperation) {
    const query: RecordedQuery = { target, operations: firstOperation ? [firstOperation] : [] }
    queries.push(query)
    return chainFor(query)
  }

  const client = {
    from: (table: string) => startQuery(table),
    rpc: (functionName: string, args: unknown) => startQuery(`rpc:${functionName}`, { method: 'rpc', args: [args] }),
  }

  return { client: client as unknown as SupabaseClient<Database>, queries }
}

export function argumentsOf(query: RecordedQuery | undefined, method: string): unknown[][] {
  return (query?.operations ?? []).filter(operation => operation.method === method).map(operation => operation.args)
}
