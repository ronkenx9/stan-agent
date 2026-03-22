import { EventEmitter } from 'events'
import type { StreamEvent } from '@stan/core'

/**
 * Mock Rumble event emitter.
 * Simulates what the real Rumble Live Stream API poller would detect.
 * Used for demo and testing — real Rumble URL optional.
 */
export class RumbleSimulator extends EventEmitter {
  private _viewerCount = 0
  private _isLive = false

  /** Fire a viewer milestone event */
  hitViewerMilestone(viewers: number): void {
    const event: StreamEvent = {
      type: 'viewer_milestone',
      timestamp: Date.now(),
      data: { watching_now: viewers },
    }
    this._viewerCount = viewers
    this.emit('stream_event', event)
  }

  /** Fire a new subscriber event */
  newSubscriber(username: string, amountDollars = 5): void {
    const event: StreamEvent = {
      type: 'new_subscriber',
      timestamp: Date.now(),
      data: { subscriber: { username, amount_dollars: amountDollars } },
    }
    this.emit('stream_event', event)
  }

  /** Fire a paid rant event (also evaluates match_rant) */
  paidRant(username: string, amountCents: number, text = 'Lets goo!'): void {
    const event: StreamEvent = {
      type: 'match_rant',
      timestamp: Date.now(),
      data: { rant: { username, amount_cents: amountCents, text } },
    }
    this.emit('stream_event', event)

    // Also fire rant_burst evaluation
    const burstEvent: StreamEvent = {
      type: 'rant_burst',
      timestamp: Date.now(),
      data: { rant: { username, amount_cents: amountCents, text } },
    }
    this.emit('stream_event', burstEvent)
  }

  /** Fire a sentiment spike event with a pre-scored value (0–10) */
  sentimentSpike(score: number, messages: string[] = []): void {
    const event: StreamEvent = {
      type: 'sentiment_spike',
      timestamp: Date.now(),
      data: { sentiment_score: score, messages },
    }
    this.emit('stream_event', event)
  }

  /** Fire a gifted sub wave */
  giftedSubWave(count: number): void {
    const event: StreamEvent = {
      type: 'gifted_sub_wave',
      timestamp: Date.now(),
      data: { gifted_sub_count: count },
    }
    this.emit('stream_event', event)
  }

  /** Mark stream as live */
  goLive(): void {
    this._isLive = true
    console.log('[simulator] Stream is LIVE')
    this.emit('status', { isLive: true })
  }

  /** Mark stream as offline */
  goOffline(): void {
    this._isLive = false
    console.log('[simulator] Stream OFFLINE')
    this.emit('status', { isLive: false })
  }

  get isLive(): boolean {
    return this._isLive
  }

  get viewerCount(): number {
    return this._viewerCount
  }
}

export const simulator = new RumbleSimulator()
