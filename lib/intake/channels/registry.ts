import type { ChannelAdapter, IntakeChannel } from './types';
import { whatsappAdapter } from './whatsapp/adapter';

/**
 * Every registered intake channel. Adding a channel = one adapter module,
 * one thin webhook route, and an entry here.
 */
export const intakeChannelAdapters: ChannelAdapter[] = [whatsappAdapter];

export function getAdapter(channel: IntakeChannel): ChannelAdapter | null {
  return intakeChannelAdapters.find((a) => a.channel === channel) ?? null;
}
