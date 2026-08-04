import { describe, expect, it } from 'vitest';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';

/** Wrap one Cloud API message object in a realistic webhook envelope. */
function envelope(message: any, profileName = 'Kasun Perera') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '94770711939',
                phone_number_id: '111222333',
              },
              contacts: [{ profile: { name: profileName }, wa_id: '94771234567' }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('whatsappAdapter.normalizeInbound', () => {
  it('normalizes a plain text message (regression)', () => {
    const out = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.TEXT',
        timestamp: '1722758400',
        type: 'text',
        text: { body: '3BR house in Kandy, 85000 per month' },
      })
    );

    expect(out).toEqual([
      {
        channel: 'whatsapp',
        senderId: '94771234567',
        senderName: 'Kasun Perera',
        messageId: 'wamid.TEXT',
        text: '3BR house in Kandy, 85000 per month',
        mediaIds: [],
        unsupportedMedia: false,
        timestamp: new Date(1722758400 * 1000),
      },
    ]);
    expect(out[0].interactiveReplyId).toBeUndefined();
    expect(out[0].location).toBeUndefined();
  });

  it('normalizes an image with caption (regression)', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.IMG',
        timestamp: '1722758400',
        type: 'image',
        image: { id: 'MEDIA_1', mime_type: 'image/jpeg', caption: 'Front view' },
      })
    );

    expect(msg.mediaIds).toEqual(['MEDIA_1']);
    expect(msg.text).toBe('Front view');
    expect(msg.unsupportedMedia).toBe(false);
  });

  it('flags video as unsupported media but keeps the caption (regression)', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.VID',
        timestamp: '1722758400',
        type: 'video',
        video: { id: 'MEDIA_2', mime_type: 'video/mp4', caption: 'House tour' },
      })
    );

    expect(msg.unsupportedMedia).toBe(true);
    expect(msg.text).toBe('House tour');
    expect(msg.mediaIds).toEqual([]);
  });

  it('normalizes a button_reply: text = title, interactiveReplyId = id', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.BTN',
        timestamp: '1722758400',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'publish_yes', title: 'Yes, publish' },
        },
      })
    );

    expect(msg.text).toBe('Yes, publish');
    expect(msg.interactiveReplyId).toBe('publish_yes');
    expect(msg.mediaIds).toEqual([]);
    expect(msg.unsupportedMedia).toBe(false);
    expect(msg.location).toBeUndefined();
  });

  it('normalizes a list_reply the same way', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.LIST',
        timestamp: '1722758400',
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: {
            id: 'listing_42',
            title: '3BR house in Kandy',
            description: 'LKR 85,000/month',
          },
        },
      })
    );

    expect(msg.text).toBe('3BR house in Kandy');
    expect(msg.interactiveReplyId).toBe('listing_42');
    expect(msg.unsupportedMedia).toBe(false);
  });

  it('drops interactive payloads without a recognizable reply', () => {
    const out = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.NFM',
        timestamp: '1722758400',
        type: 'interactive',
        interactive: { type: 'nfm_reply', nfm_reply: { response_json: '{}' } },
      })
    );
    expect(out).toEqual([]);
  });

  it('normalizes a location: coordinates populated, text is the empty string', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.LOC',
        timestamp: '1722758400',
        type: 'location',
        location: {
          latitude: 6.9271,
          longitude: 79.8612,
          name: 'Colombo Fort',
          address: 'Colombo 01, Sri Lanka',
        },
      })
    );

    expect(msg.text).toBe('');
    expect(msg.location).toEqual({
      latitude: 6.9271,
      longitude: 79.8612,
      name: 'Colombo Fort',
      address: 'Colombo 01, Sri Lanka',
    });
    expect(msg.unsupportedMedia).toBe(false);
    expect(msg.interactiveReplyId).toBeUndefined();
  });

  it('handles a bare pin without name/address', () => {
    const [msg] = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.PIN',
        timestamp: '1722758400',
        type: 'location',
        location: { latitude: 7.2906, longitude: 80.6337 },
      })
    );

    expect(msg.location).toEqual({ latitude: 7.2906, longitude: 80.6337 });
  });

  it('drops a location with unusable coordinates', () => {
    const out = whatsappAdapter.normalizeInbound(
      envelope({
        from: '94771234567',
        id: 'wamid.BADLOC',
        timestamp: '1722758400',
        type: 'location',
        location: { latitude: 'not-a-number' },
      })
    );
    expect(out).toEqual([]);
  });

  it('still drops stickers and reactions', () => {
    for (const message of [
      {
        from: '94771234567',
        id: 'wamid.STICKER',
        timestamp: '1722758400',
        type: 'sticker',
        sticker: { id: 'MEDIA_3', mime_type: 'image/webp' },
      },
      {
        from: '94771234567',
        id: 'wamid.REACT',
        timestamp: '1722758400',
        type: 'reaction',
        reaction: { message_id: 'wamid.TEXT', emoji: '👍' },
      },
    ]) {
      expect(whatsappAdapter.normalizeInbound(envelope(message))).toEqual([]);
    }
  });

  it('returns [] for status-only webhook deliveries', () => {
    const out = whatsappAdapter.normalizeInbound({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '94770711939', phone_number_id: '111222333' },
                statuses: [{ id: 'wamid.OUT', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });
});
