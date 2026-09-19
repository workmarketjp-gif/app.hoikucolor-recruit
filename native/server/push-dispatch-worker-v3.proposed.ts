// PREPARED ONLY — Supabase Edge Function style worker.
// No deployment is performed by this artifact.
//
// P0 guarantees:
// - lock-screen content is generic and carries only notificationId;
// - a unique worker id is created per invocation (not per isolate);
// - Expo ticket `ok` is NOT treated as final provider delivery;
// - Expo receipts are checked >=15 minutes after send;
// - DeviceNotRegistered revokes the installation token;
// - missing receipts are re-checked without re-sending (avoids duplicates);
// - ticket/receipt retry is bounded by DB attempt limits.
// - a claimed delivery is revalidated against canonical unread ownership immediately before provider HTTP.

import { createClient } from 'npm:@supabase/supabase-js@2';

type ClaimedDelivery = {
  delivery_id: string;
  notification_id: string;
  push_provider: 'expo' | 'apns' | 'fcm';
  push_token: string;
  attempt_count: number;
};

type ClaimedReceipt = {
  delivery_id: string;
  provider_message_id: string;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoReceipt = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function expoHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function expoError(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const value = (details as { error?: unknown }).error;
  return typeof value === 'string' && value ? value : null;
}

function classifyProviderError(errorCode: string | null) {
  if (errorCode === 'DeviceNotRegistered') return 'invalid_token' as const;
  if (errorCode === 'MessageTooBig' || errorCode === 'MismatchSenderId' || errorCode === 'InvalidCredentials') {
    return 'permanent_error' as const;
  }
  // MessageRateExceeded and unknown provider errors are bounded retries.
  return 'retry_delivery' as const;
}

function ticketHttpOutcome(status: number) {
  if (status === 429 || status >= 500) return 'retry' as const;
  if (status >= 400) return 'suppressed' as const;
  return 'retry' as const;
}

async function sendExpo(delivery: ClaimedDelivery) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({
      to: delivery.push_token,
      title: 'Hoiku Colorに新しいお知らせがあります',
      body: 'アプリで内容を確認してください',
      sound: 'default',
      data: { notificationId: delivery.notification_id },
    }),
  });

  const payload = await response.json().catch(() => null) as { data?: ExpoTicket } | null;
  const ticket = payload?.data;

  if (!response.ok) {
    const outcome = ticketHttpOutcome(response.status);
    return { outcome, errorCode: `EXPO_HTTP_${response.status}` };
  }
  if (ticket?.status === 'ok') {
    if (!ticket.id) return { outcome: 'retry' as const, errorCode: 'EXPO_TICKET_ID_MISSING' };
    return { outcome: 'sent' as const, providerMessageId: ticket.id };
  }

  const errorCode = expoError(ticket?.details);
  if (errorCode === 'DeviceNotRegistered') {
    return { outcome: 'invalid_token' as const, errorCode: 'EXPO_DEVICE_NOT_REGISTERED' };
  }
  if (errorCode === 'MessageTooBig' || errorCode === 'MismatchSenderId' || errorCode === 'InvalidCredentials') {
    return { outcome: 'suppressed' as const, errorCode: `EXPO_${errorCode}` };
  }
  return {
    outcome: 'retry' as const,
    errorCode: `EXPO_${errorCode || String(ticket?.message || 'PUSH_FAILED').slice(0,160)}`,
  };
}

async function dispatchOne(delivery: ClaimedDelivery) {
  if (delivery.push_provider !== 'expo') {
    return {
      outcome: 'suppressed' as const,
      errorCode: `PROVIDER_NOT_IMPLEMENTED_${delivery.push_provider.toUpperCase()}`,
    };
  }
  return sendExpo(delivery);
}

async function processDispatch(workerId: string) {
  // Repair only very recent canonical notifications if the fail-open DB trigger
  // could not enqueue them. Never let push delivery block the Web transaction.
  await supabase.rpc('hc_mobile_reconcile_push_queue_v1', { p_limit: 500 });
  await supabase.rpc('hc_mobile_release_stale_push_claims_v1');
  await supabase.rpc('hc_mobile_suppress_unroutable_push_v1');

  const { data, error } = await supabase.rpc('hc_mobile_claim_push_batch_v1', {
    p_worker_id: workerId,
    p_limit: 50,
  });
  if (error) throw new Error('CLAIM_FAILED');

  const deliveries = (data || []) as ClaimedDelivery[];
  const results = [];

  for (const delivery of deliveries) {
    try {
      const { data: shouldSend, error: validateError } = await supabase.rpc(
        'hc_mobile_validate_push_claim_v1',
        { p_delivery_id: delivery.delivery_id, p_worker_id: workerId },
      );
      if (validateError) throw new Error('CLAIM_REVALIDATION_FAILED');
      if (shouldSend !== true) {
        const { data: completed, error: completeError } = await supabase.rpc(
          'hc_mobile_complete_push_delivery_v1',
          {
            p_delivery_id: delivery.delivery_id,
            p_worker_id: workerId,
            p_outcome: 'suppressed',
            p_provider_message_id: null,
            p_error_code: 'PUSH_NO_LONGER_DELIVERABLE',
          },
        );
        results.push({ id: delivery.delivery_id, completed: completed === true, completeError: Boolean(completeError), suppressedBeforeProvider: true });
        continue;
      }

      const result = await dispatchOne(delivery);
      const { data: completed, error: completeError } = await supabase.rpc(
        'hc_mobile_complete_push_delivery_v1',
        {
          p_delivery_id: delivery.delivery_id,
          p_worker_id: workerId,
          p_outcome: result.outcome,
          p_provider_message_id: 'providerMessageId' in result ? result.providerMessageId : null,
          p_error_code: 'errorCode' in result ? result.errorCode : null,
        },
      );
      results.push({ id: delivery.delivery_id, completed: completed === true, completeError: Boolean(completeError) });
    } catch {
      await supabase.rpc('hc_mobile_complete_push_delivery_v1', {
        p_delivery_id: delivery.delivery_id,
        p_worker_id: workerId,
        p_outcome: 'retry',
        p_provider_message_id: null,
        p_error_code: 'WORKER_UNHANDLED_ERROR',
      });
      results.push({ id: delivery.delivery_id, completed: false, completeError: false });
    }
  }
  return results;
}

async function fetchExpoReceipts(ticketIds: string[]) {
  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({ ids: ticketIds }),
  });

  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    return { ok: false as const, transient, errorCode: `EXPO_RECEIPT_HTTP_${response.status}` };
  }

  const payload = await response.json().catch(() => null) as
    | { data?: Record<string, ExpoReceipt> }
    | null;
  return { ok: true as const, receipts: payload?.data || {} };
}

async function completeReceipt(workerId: string, deliveryId: string, outcome: string, errorCode?: string | null) {
  return supabase.rpc('hc_mobile_complete_push_receipt_v1', {
    p_delivery_id: deliveryId,
    p_worker_id: workerId,
    p_outcome: outcome,
    p_error_code: errorCode || null,
  });
}

async function processReceipts(workerId: string) {
  await supabase.rpc('hc_mobile_release_stale_push_receipt_claims_v1');

  const { data, error } = await supabase.rpc('hc_mobile_claim_push_receipts_v1', {
    p_worker_id: workerId,
    p_limit: 200,
  });
  if (error) throw new Error('RECEIPT_CLAIM_FAILED');

  const claimed = (data || []) as ClaimedReceipt[];
  if (!claimed.length) return [];

  const byTicket = new Map(claimed.map((row) => [row.provider_message_id, row]));
  const fetched = await fetchExpoReceipts([...byTicket.keys()]);
  const results = [];

  if (!fetched.ok) {
    for (const row of claimed) {
      // Receipt endpoint failures do not justify re-sending the push. Re-check later.
      await completeReceipt(workerId, row.delivery_id, 'not_ready', fetched.errorCode);
      results.push({ id: row.delivery_id, receipt: 'not_ready', endpointTransient: fetched.transient });
    }
    return results;
  }

  for (const row of claimed) {
    const receipt = fetched.receipts[row.provider_message_id];
    if (!receipt) {
      await completeReceipt(workerId, row.delivery_id, 'not_ready', 'EXPO_RECEIPT_NOT_READY');
      results.push({ id: row.delivery_id, receipt: 'not_ready' });
      continue;
    }
    if (receipt.status === 'ok') {
      await completeReceipt(workerId, row.delivery_id, 'ok', null);
      results.push({ id: row.delivery_id, receipt: 'ok' });
      continue;
    }

    const providerError = expoError(receipt.details);
    const outcome = classifyProviderError(providerError);
    await completeReceipt(
      workerId,
      row.delivery_id,
      outcome,
      `EXPO_RECEIPT_${providerError || String(receipt.message || 'ERROR').slice(0,150)}`,
    );
    results.push({ id: row.delivery_id, receipt: outcome, providerError });
  }
  return results;
}

Deno.serve(async () => {
  // Per-invocation ownership avoids concurrent requests in a warm isolate sharing
  // one claim identity.
  const workerId = `hc-native-push:${crypto.randomUUID()}`;

  try {
    const [dispatch, receipts] = await Promise.all([
      processDispatch(workerId),
      processReceipts(workerId),
    ]);
    return new Response(
      JSON.stringify({ ok: true, dispatch, receipts }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, code: String((error as Error)?.message || 'WORKER_FAILED') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
