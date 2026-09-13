export interface LatestRequestGuard {
  begin(): { isLatest(): boolean }
  supersede(): void
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let latestTicket = 0

  return {
    begin() {
      const ticket = ++latestTicket
      return { isLatest: () => ticket === latestTicket }
    },
    supersede() {
      latestTicket += 1
    },
  }
}
