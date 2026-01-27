import type { Load } from './types';
import { addHours, addMinutes, toIso } from './time';

function deriveMapLink(origin: string, dest: string) {
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(dest);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}`;
}

function deriveTextLink(phone: string, body: string) {
  const b = encodeURIComponent(body);
  // Works on most devices; desktop will no-op gracefully
  return `sms:${phone}?&body=${b}`;
}

function makeLoad(partial: Omit<Load, 'mapLink' | 'textLink'>): Load {
  return {
    ...partial,
    mapLink: deriveMapLink(partial.originCityState, partial.destCityState),
    textLink: deriveTextLink(
      partial.carrierPhone,
      `Load ${partial.id}: ${partial.nextAction}`,
    ),
  };
}

/**
 * Mock data notes:
 * - Times are generated relative to "now" so the dashboard sections (Today / Next 48h) stay meaningful.
 * - Exceptions include at least 2 red, 3 yellow.
 */
export const mockLoads: Load[] = (() => {
  const now = new Date();

  return [
    // 🔴 RED (late pickup + stale GPS)
    makeLoad({
      id: 'L-10421',
      status: 'red',
      riskReason: '2h late pickup',
      originCityState: 'Portland, OR',
      destCityState: 'Boise, ID',
      pickupWindowStartISO: toIso(addHours(now, -4)),
      pickupWindowEndISO: toIso(addHours(now, -2)),
      deliveryWindowStartISO: toIso(addHours(now, 10)),
      deliveryWindowEndISO: toIso(addHours(now, 14)),
      carrierName: 'Cascadia Haul Co.',
      carrierPhone: '+15035550111',
      lastGpsMinutesAgo: 190,
      nextAction: 'Call carrier for pickup ETA + confirm on-site status.',
    }),

    // 🔴 RED (delivery risk + no GPS)
    makeLoad({
      id: 'L-10433',
      status: 'red',
      riskReason: 'No GPS ping',
      originCityState: 'Tacoma, WA',
      destCityState: 'Sacramento, CA',
      pickupWindowStartISO: toIso(addHours(now, -12)),
      pickupWindowEndISO: toIso(addHours(now, -10)),
      deliveryWindowStartISO: toIso(addHours(now, 8)),
      deliveryWindowEndISO: toIso(addHours(now, 10)),
      carrierName: 'NorthStar Freight',
      carrierPhone: '+12065550122',
      lastGpsMinutesAgo: null,
      nextAction: 'Text carrier requesting immediate GPS/location update.',
    }),

    // 🟡 YELLOW (watch: borderline pickup window)
    makeLoad({
      id: 'L-10410',
      status: 'yellow',
      riskReason: 'Pickup window starts in 45m',
      originCityState: 'Salem, OR',
      destCityState: 'Spokane, WA',
      pickupWindowStartISO: toIso(addMinutes(now, 45)),
      pickupWindowEndISO: toIso(addHours(now, 2)),
      deliveryWindowStartISO: toIso(addHours(now, 14)),
      deliveryWindowEndISO: toIso(addHours(now, 18)),
      carrierName: 'Iron Ridge Transport',
      carrierPhone: '+15415550133',
      lastGpsMinutesAgo: 52,
      nextAction: 'Monitor; ping carrier if not checked-in by window start.',
    }),

    // 🟡 YELLOW (watch: GPS getting stale)
    makeLoad({
      id: 'L-10418',
      status: 'yellow',
      riskReason: 'GPS stale (89m)',
      originCityState: 'Eugene, OR',
      destCityState: 'Reno, NV',
      pickupWindowStartISO: toIso(addHours(now, -1)),
      pickupWindowEndISO: toIso(addHours(now, 1)),
      deliveryWindowStartISO: toIso(addHours(now, 20)),
      deliveryWindowEndISO: toIso(addHours(now, 24)),
      carrierName: 'HighDesert Logistics',
      carrierPhone: '+15415550144',
      lastGpsMinutesAgo: 89,
      nextAction: 'Text carrier: request location + confirm moving toward pickup.',
    }),

    // 🟡 YELLOW (watch: tight delivery window)
    makeLoad({
      id: 'L-10427',
      status: 'yellow',
      riskReason: 'Tight delivery window (ETA variance)',
      originCityState: 'Vancouver, WA',
      destCityState: 'Medford, OR',
      pickupWindowStartISO: toIso(addHours(now, 3)),
      pickupWindowEndISO: toIso(addHours(now, 5)),
      deliveryWindowStartISO: toIso(addHours(now, 12)),
      deliveryWindowEndISO: toIso(addHours(now, 13)),
      carrierName: 'Evergreen Linehaul',
      carrierPhone: '+13605550155',
      lastGpsMinutesAgo: 35,
      nextAction: 'Verify route plan and confirm delivery appointment.',
    }),

    // 🟢 GREEN
    makeLoad({
      id: 'L-10398',
      status: 'green',
      originCityState: 'Hillsboro, OR',
      destCityState: 'Seattle, WA',
      pickupWindowStartISO: toIso(addHours(now, 1)),
      pickupWindowEndISO: toIso(addHours(now, 3)),
      deliveryWindowStartISO: toIso(addHours(now, 9)),
      deliveryWindowEndISO: toIso(addHours(now, 12)),
      carrierName: 'Puget Sound Carriers',
      carrierPhone: '+12065550166',
      lastGpsMinutesAgo: 18,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN
    makeLoad({
      id: 'L-10402',
      status: 'green',
      originCityState: 'Gresham, OR',
      destCityState: 'Bend, OR',
      pickupWindowStartISO: toIso(addHours(now, -2)),
      pickupWindowEndISO: toIso(addHours(now, -1)),
      deliveryWindowStartISO: toIso(addHours(now, 4)),
      deliveryWindowEndISO: toIso(addHours(now, 6)),
      carrierName: 'Summit Routes',
      carrierPhone: '+15035550177',
      lastGpsMinutesAgo: 22,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN (tomorrow-ish, in next 48h)
    makeLoad({
      id: 'L-10405',
      status: 'green',
      originCityState: 'Olympia, WA',
      destCityState: 'Portland, OR',
      pickupWindowStartISO: toIso(addHours(now, 26)),
      pickupWindowEndISO: toIso(addHours(now, 28)),
      deliveryWindowStartISO: toIso(addHours(now, 34)),
      deliveryWindowEndISO: toIso(addHours(now, 36)),
      carrierName: 'Rainier Freight',
      carrierPhone: '+13605550188',
      lastGpsMinutesAgo: 12,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN (next 48h)
    makeLoad({
      id: 'L-10407',
      status: 'green',
      originCityState: 'Longview, WA',
      destCityState: 'Eugene, OR',
      pickupWindowStartISO: toIso(addHours(now, 40)),
      pickupWindowEndISO: toIso(addHours(now, 42)),
      deliveryWindowStartISO: toIso(addHours(now, 46)),
      deliveryWindowEndISO: toIso(addHours(now, 48)),
      carrierName: 'Columbia Corridor',
      carrierPhone: '+13605550199',
      lastGpsMinutesAgo: 9,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN (older, not today/next48 depending on now)
    makeLoad({
      id: 'L-10377',
      status: 'green',
      originCityState: 'Boise, ID',
      destCityState: 'Salt Lake City, UT',
      pickupWindowStartISO: toIso(addHours(now, 60)),
      pickupWindowEndISO: toIso(addHours(now, 62)),
      deliveryWindowStartISO: toIso(addHours(now, 72)),
      deliveryWindowEndISO: toIso(addHours(now, 76)),
      carrierName: 'Intermountain Haulers',
      carrierPhone: '+12085550110',
      lastGpsMinutesAgo: 14,
      nextAction: 'No action needed. Monitor normally.',
    })
  ];
})();
