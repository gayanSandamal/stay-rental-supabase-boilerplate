import { describe, expect, it } from 'vitest';
import { extractDeliveryFailures } from '@/lib/intake/channels/whatsapp/adapter';

const envelope = (statuses: unknown[]) => ({
  entry: [{ changes: [{ value: { statuses } }] }],
});

describe('extractDeliveryFailures', () => {
  it('reports a failed status with its Meta error and only the last four digits', () => {
    const failures = extractDeliveryFailures(
      envelope([
        {
          id: 'wamid.abc',
          status: 'failed',
          recipient_id: '94717925501',
          errors: [
            {
              code: 131049,
              title: 'This message was not delivered to maintain healthy ecosystem engagement.',
              error_data: { details: 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.' },
            },
          ],
        },
      ])
    );
    expect(failures).toEqual([
      {
        messageId: 'wamid.abc',
        recipientTail: '5501',
        errors: [
          {
            code: 131049,
            title: 'This message was not delivered to maintain healthy ecosystem engagement.',
            details: 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.',
          },
        ],
      },
    ]);
    expect(JSON.stringify(failures)).not.toContain('94717925501');
  });

  it('ignores sent, delivered and read statuses, and inbound messages', () => {
    expect(
      extractDeliveryFailures(
        envelope([
          { id: 'a', status: 'sent', recipient_id: '94700000000' },
          { id: 'b', status: 'delivered', recipient_id: '94700000000' },
          { id: 'c', status: 'read', recipient_id: '94700000000' },
        ])
      )
    ).toEqual([]);
    expect(extractDeliveryFailures({ entry: [{ changes: [{ value: { messages: [{ from: '1' }] } }] }] })).toEqual([]);
    expect(extractDeliveryFailures(null)).toEqual([]);
  });
});
